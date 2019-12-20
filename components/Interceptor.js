const Events = require("events");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const https = require("https");
const detect = require("detect-port");
const Config = require("./Config.js");
const Steam = require("./Steam.js");
const ConnectionHelper = require("./ConnectionHelper.js");
const isDebugging = process.argv.join(" ").includes("--inspect");

module.exports = class Interceptor extends Events {
	constructor() {
		super();

		this.server = null;
		this.wss = null;
		this.clientSocket = null;
		this.serverSocket = null;
		this.port = 21812;
		this.pingData = null;
		this.mainWindow = null;
		this.config = new Config();
		this.steam = new Steam();
	}

	start(mainWindow, abortCB) {
		return new Promise((resolve, reject) => {
			// Setup the WebSocket server with a working port
			this.mainWindow = mainWindow;

			this.server = https.createServer({
				cert: fs.readFileSync(path.join(__dirname, "..", "certificate", "cert.pem")),
				key: fs.readFileSync(path.join(__dirname, "..", "certificate", "cert.key"))
			});
			this.wss = new WebSocket.Server({
				server: this.server
			});

			this._setup();

			detect(this.port, async (err, _port) => {
				if (err) {
					reject(err);
					return;
				}

				this.port = _port;
				this.server.listen(this.port);

				// Save the original config file
				let steamPath = await this.config.findSteamPath(this.mainWindow);
				if (!steamPath) {
					await this.stop(true);
					resolve(false);
					return;
				}

				this.config.saveConfigWebsockets();
				this.config.overrideConfigWebsockets(this.port);

				// Kill all steam processes and restart it
				await this.steam.KillSteam();
				await this.steam.StartSteam(steamPath.raw, true, () => {
					this.stop(true).catch(() => { });
					abortCB();
				});

				// We are now done here and only have to wait for a connection
				resolve(true);
			});
		});
	}

	stop(abort = false, ignoreError = false) {
		return new Promise(async (resolve, reject) => {
			if (!abort) {
				let r = await this.steam.KillSteam(true).catch((err) => {
					if (ignoreError) {
						return;
					}

					reject(err);
				});
				if (!r && !ignoreError) {
					return;
				}
			}

			if (this.wss) {
				this.wss.close();
			}

			if (this.server) {
				this.server.close();
			}

			if (this.clientSocket) {
				this.clientSocket.close();
			}

			if (this.serverSocket) {
				this.serverSocket.close();
			}

			this.wss = null;
			this.server = null;
			this.clientSocket = null;
			this.serverSocket = null;

			resolve(true);
		});
	}

	_setup() {
		this.wss.on("error", (err) => {
			this.emit("s_error", err);
		});

		this.wss.on("listening", () => {
			this.emit("s_listening");
		});

		this.wss.on("connection", async (ws, req) => {
			// Add backlog for when data is sent during cm pinging
			let clientSocketBacklog = [];
			let serverSocketBacklog = [];

			// Only allow up to one connection (There shouldn't be more anyways)
			if (this.clientSocket) {
				ws.close();
				return;
			}
			this.clientSocket = ws;

			this.clientSocket.on("error", (err) => {
				this.emit("error", err);
			});

			this.clientSocket.on("message", async (data) => {
				if (!this.serverSocket || this.serverSocket.readyState !== this.serverSocket.OPEN) {
					serverSocketBacklog.push(data);
					return;
				}

				// Client -> Server
				let modified = await ConnectionHelper.HandleNetMessage(data, this.pingData);
				if (Array.isArray(modified)) {
					for (let mod of modified) {
						this.serverSocket.send(mod || data);
					}
				} else {
					this.serverSocket.send(modified || data);
				}
			});

			this.clientSocket.on("open", () => {
				while (clientSocketBacklog.length > 0) {
					this.clientSocket.send(clientSocketBacklog.shift());
				}
			});

			this.clientSocket.on("close", () => {
				this.clientSocket = null;
				this.emit("close");
			});

			// Ping connection managers
			this.mainWindow.webContents.send("status", {
				message: "Ping checking...",
				button: false
			});
			let goodCM = await this.steam.SocketPing().catch((err) => {
				console.error(err);
			});
			if (!goodCM) {
				this.stop();
				this.mainWindow.webContents.send("status", {
					message: "Failed",
					button: true
				});
				this.mainWindow.webContents.send("toggle", {
					canceled: true
				});
				return;
			}

			this.mainWindow.webContents.send("status", {
				message: "Connecting...",
				button: false
			});

			// We got an incoming connection, connect to a Steam server
			this.serverSocket = new WebSocket(goodCM);

			this.serverSocket.on("message", async (data) => {
				if (!this.clientSocket || this.clientSocket.readyState !== this.clientSocket.OPEN) {
					clientSocketBacklog.push(data);
					return;
				}

				if (isDebugging) {
					let rawEMsg = data.readInt32LE(0);
					let eMsg = rawEMsg & ~0x80000000;
					let isProtobuf = !!(rawEMsg & 0x80000000);

					console.log("Server -> Client " + data.length + " bytes (" + eMsg + " - " + (isProtobuf ? "IsProto" : "IsNotProto") + ")");
				}

				// Server -> Client is irrelevant to us
				this.clientSocket.send(data);
			});

			this.serverSocket.on("error", (err) => {
				this.emit("error", err);
			});

			this.serverSocket.on("open", () => {
				// We don't have to check any Server -> Client packets on startup as those cannot include any GC data
				while (serverSocketBacklog.length > 0) {
					this.serverSocket.send(serverSocketBacklog.shift());
				}
			});

			this.serverSocket.on("close", () => {
				this.serverSocket = null;
				this.emit("close");
			});

			while (
				!this.serverSocket || this.serverSocket.readyState !== this.serverSocket.OPEN ||
				!this.clientSocket || this.clientSocket.readyState !== this.clientSocket.OPEN
			) {
				await new Promise(p => setTimeout(p, 500));
				continue;
			}

			this.mainWindow.webContents.send("status", {
				message: "Connected",
				button: true
			});
		});
	}
}
