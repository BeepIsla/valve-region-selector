const Zlib = require("zlib");
const ByteBuffer = require("bytebuffer");
const EMsg = require("./EMsg.js");
const Protobufs = require("./Protobufs.js");
const JOBID_NONE = "18446744073709551615";
const PROTO_MASK = 0x80000000;

module.exports = class Modifier {
	static async run(header, body, pingData) {
		// We only care about GameCoordinator messages
		if (EMsg.ClientToGC !== header.msg) {
			return false;
		}

		// Do some special encoding/decoding here for protobufs
		let gcMsgType = body.msgtype & ~PROTO_MASK;
		let gcTargetJobID;
		let gcBody;
		let gcHeader;
		let protobuf;

		if (body.appid === 440) {
			// We only care about 6528 (k_EMsgGCDataCenterPing_Update)
			if (gcMsgType === 6528) {
				protobuf = Protobufs.Protos.tf2.CMsgGCDataCenterPing_Update;
			}
		} else if (body.appid === 730) {
			// We only care about 9103 (k_EMsgGCCStrike15_v2_MatchmakingClient2ServerPing)
			if (gcMsgType === 9103) {
				protobuf = Protobufs.Protos.csgo.CMsgGCCStrike15_v2_MatchmakingClient2ServerPing;
			}
		}

		if (!protobuf) {
			return false;
		}

		console.log("Received valid ping protobuf message");

		if (body.msgtype & PROTO_MASK) {
			// This is a protobuf message
			let gcHeaderLength = body.payload.readInt32LE(4);
			gcHeader = Protobufs.decodeProto(Protobufs.Protos.steam.CMsgProtoBufHeader, body.payload.slice(8, 8 + gcHeaderLength));
			gcTargetJobID = gcHeader.job_id_target || JOBID_NONE;
			gcBody = body.payload.slice(8 + gcHeaderLength);
		} else {
			gcHeader = ByteBuffer.wrap(body.payload.slice(0, 18));
			gcTargetJobID = gcHeader.readUint64(2);
			gcBody = body.payload.slice(18);
		}

		try {
			let decoded = Protobufs.decodeProto(protobuf, gcBody);
			if (body.appid === 440) {
				decoded.pingdata = decoded.pingdata.map((dcp) => {
					let index = pingData[body.appid].findIndex(i => i.sdr.toLowerCase() === dcp.name.toLowerCase());
					if (index <= -1) {
						console.log(dcp);

						// If we don't have an override for this remove it
						return null;
					}

					// Double equals for type conversion
					if (pingData[body.appid][index].ping != -1) {
						dcp.ping = parseInt(pingData[body.appid][index].ping);
					}

					return dcp;
				}).filter((dcp) => dcp !== null);
			} else if (body.appid === 730) {
				decoded.data_center_pings = decoded.data_center_pings.map((dcp) => {
					let buf = Buffer.alloc(4);
					buf.writeUInt32BE(dcp.data_center_id, 0);
					let sdr = buf.toString().replace(/\0/g, "").trim();

					// Weird thing where if the string is 4 letters long the first one needs to be at the end
					if (sdr.length === 4) {
						let first = sdr[0];
						sdr = sdr.slice(1);
						sdr = sdr + first;
					}

					let index = pingData[body.appid].findIndex(i => i.sdr.toLowerCase() === sdr.toLowerCase());
					if (index <= -1) {
						console.log(dcp);

						// If we don't have an override for this remove it
						return null;
					}

					// Double equals for type conversion
					if (pingData[body.appid][index].ping != -1) {
						dcp.ping = parseInt(pingData[body.appid][index].ping);
					}

					return dcp;
				}).filter((dcp) => dcp !== null);
			}

			let modified = Protobufs.encodeProto(protobuf, decoded);
			gcHeader = gcHeader;
			gcBody = modified;
		} catch (err) {
			console.error(err);

			// If something goes wrong return unmodified
			return false;
		}

		// Now we have to encode this again!
		let gcNewHeader;
		if (body.msgtype & PROTO_MASK) {
			let protoHeader = Protobufs.encodeProto(Protobufs.Protos.steam.CMsgProtoBufHeader, gcHeader);
			gcNewHeader = Buffer.alloc(8);
			gcNewHeader.writeUInt32LE(body.msgtype, 0);
			gcNewHeader.writeInt32LE(protoHeader.length, 4);
			gcNewHeader = Buffer.concat([gcNewHeader, protoHeader]);
		} else {
			gcNewHeader = ByteBuffer.allocate(18, ByteBuffer.LITTLE_ENDIAN);
			gcNewHeader.writeUint16(1); // header version
			gcNewHeader.writeUint64(JOBID_NONE);
			gcNewHeader.writeUint64(gcTargetJobID);
			gcNewHeader = gcNewHeader.flip().toBuffer();
		}

		body.payload = Buffer.concat([gcNewHeader, gcBody]);

		// Return the modified header and body
		return {
			header: header,
			body: body
		};
	}

	static async multi(ch, header, body, pingData) {
		// Decode the multi-packet
		let parts = await decodeMulti(body);

		// Go through the "HandleNetMessage" process again with all normal packets so we can modify them
		let modifiedBufs = await Promise.all(parts.map(p => ch.HandleNetMessage(p, pingData)));

		return modifiedBufs;
	}
}

function decodeMulti(body) {
	return new Promise(async (resolve, reject) => {
		let parts = [];

		let payload = body.message_body;
		if (body.size_unzipped) {
			let _p = await new Promise((res, rej) => {
				Zlib.gunzip(payload, (err, unzipped) => {
					if (err) {
						// Panic
						rej(err);
						return;
					}

					let _parts = processMulti(unzipped);
					res(_parts);
				});
			}).catch(reject);

			if (!_p) {
				return;
			}

			parts = _p;
		} else {
			parts = processMulti(payload);
		}

		function processMulti(payload) {
			let p = [];

			while (payload.length > 0) {
				let subSize = payload.readUInt32LE(0);
				p.push(payload.slice(4, 4 + subSize));
				payload = payload.slice(4 + subSize);
			}

			return p;
		}

		resolve(parts);
	});
}
