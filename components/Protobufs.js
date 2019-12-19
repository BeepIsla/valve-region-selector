const ByteBuffer = require("bytebuffer");
const path = require("path");
const Protos = require("./ProtobufParser.js")([
	{
		name: "steam",
		protos: path.join(__dirname, "..", "protobufs", "steam")
	},
	{
		name: "csgo",
		protos: path.join(__dirname, "..", "protobufs", "csgo")
	},
	{
		name: "tf2",
		protos: path.join(__dirname, "..", "protobufs", "tf2")
	}
]);

module.exports = class Protobufs {
	static Protos = Protos;

	static decodeProto(protobuf, buffer) {
		if (ByteBuffer.isByteBuffer(buffer)) {
			buffer = buffer.toBuffer();
		}

		let decoded = protobuf.decode(buffer);
		return protobuf.toObject(decoded);
	}

	static encodeProto(protobuf, data) {
		let message = protobuf.create(data);
		let encoded = protobuf.encode(message);
		return encoded.finish();
	}
}
