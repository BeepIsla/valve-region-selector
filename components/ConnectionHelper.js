const ByteBuffer = require("bytebuffer");
const Protobufs = require("./Protobufs.js");
const EMsg = require("./EMsg.js");
const ProtobufFuncs = {
	[EMsg.Multi]: Protobufs.Protos.steam.CMsgMulti,
	[EMsg.ClientToGC]: Protobufs.Protos.steam.CMsgGCClient,
	[EMsg.ClientFromGC]: Protobufs.Protos.steam.CMsgGCClient
}
const Modifier = require("./Modifier.js");

const PROTO_MASK = 0x80000000;
const JOBID_NONE = "18446744073709551615";

module.exports = class ConnectionHelper {
	static HandleNetMessage(buffer, pingData) {
		// Get eMsg
		let buf = ByteBuffer.wrap(buffer, ByteBuffer.LITTLE_ENDIAN);

		let rawEMsg = buf.readUint32();
		let eMsg = rawEMsg & ~PROTO_MASK;
		let isProtobuf = !!(rawEMsg & PROTO_MASK);
		let header = {
			msg: eMsg
		};

		if (isProtobuf) {
			// Decode the protobuf header
			let headerLength = buf.readUint32();
			header.proto = Protobufs.decodeProto(Protobufs.Protos.steam.CMsgProtoBufHeader, buf.slice(buf.offset, buf.offset + headerLength));
			buf.skip(headerLength);

			header.targetJobID = header.proto.jobid_target && header.proto.jobid_target.toString();
			header.sourceJobID = header.proto.jobid_source && header.proto.jobid_source.toString();
			header.steamID = header.proto.steamid && header.proto.steamid.toString();
			header.sessionID = header.proto.client_sessionid;
		} else {
			// Decode the extended header
			buf.skip(3); // 1 byte for header size (fixed at 36), 2 bytes for header version (fixed at 2)
			header.targetJobID = buf.readUint64().toString();
			header.sourceJobID = buf.readUint64().toString();
			buf.skip(1); // 1 byte for header canary (fixed at 239)
			header.steamID = buf.readUint64().toString();
			header.sessionID = buf.readUint32();
		}

		return this.HandleMessage(header, buf.slice(), pingData);
	}

	static async HandleMessage(header, bodyBuf, pingData) {
		// Decode
		let body = bodyBuf;
		if (ProtobufFuncs[header.msg]) {
			body = Protobufs.decodeProto(ProtobufFuncs[header.msg], bodyBuf);
		}

		// Modify
		let mod = undefined;
		if (header.msg === EMsg.Multi) {
			mod = await Modifier.multi(this, header, body, pingData);
		} else {
			mod = await Modifier.run(header, body, pingData);
		}

		// Tell top we didn't modify this
		if (!mod) {
			return false;
		}

		// Encode again
		if (header.msg === EMsg.Multi) {
			return mod;
		} else {
			return this.HandleEncode(mod.header, mod.body);
		}
	}

	static HandleEncode(retHeader, retBody) {
		// Encode protobuf if exists
		if (ProtobufFuncs[retHeader.msg]) {
			retBody = Protobufs.encodeProto(ProtobufFuncs[retHeader.msg], retBody);
		} else if (ByteBuffer.isByteBuffer(retBody)) {
			retBody = retBody.toBuffer();
		}

		// Encode header
		let hdrBuf;
		if (retHeader.proto) {
			let hdrProtoBuf = Protobufs.encodeProto(Protobufs.Protos.steam.CMsgProtoBufHeader, retHeader.proto);
			hdrBuf = ByteBuffer.allocate(4 + 4 + hdrProtoBuf.length, ByteBuffer.LITTLE_ENDIAN);
			hdrBuf.writeUint32(retHeader.msg | PROTO_MASK);
			hdrBuf.writeUint32(hdrProtoBuf.length);
			hdrBuf.append(hdrProtoBuf);
		} else {
			hdrBuf = ByteBuffer.allocate(4 + 1 + 2 + 8 + 8 + 1 + 8 + 4, ByteBuffer.LITTLE_ENDIAN);
			hdrBuf.writeUint32(retHeader.msg);
			hdrBuf.writeByte(36);
			hdrBuf.writeUint16(2);
			hdrBuf.writeUint64(retHeader.targetJobID || JOBID_NONE);
			hdrBuf.writeUint64(retHeader.sourceJobID || JOBID_NONE);
			hdrBuf.writeByte(239);
			hdrBuf.writeUint64(retHeader.steamID);
			hdrBuf.writeUint32(retHeader.sessionID);
		}

		// Return back the modified buffer
		return Buffer.concat([hdrBuf.flip().toBuffer(), retBody]);
	}
}
