const ps = require("ps-node");
const childProcess = require("child_process");
const request = require("request");

module.exports = class Steam {
	constructor() {
		this.steamRunningArgs = null;
		this.steamProcess = null;
	}

	KillSteam(killOur = false) {
		return new Promise((resolve, reject) => {
			if (killOur) {
				if (!this.steamProcess) {
					reject(new Error("Steam is not running with our process"));
					return;
				}

				this.steamProcess.kill("SIGKILL");
				this.steamProcess = null;
				resolve(true);
				return;
			}

			ps.lookup({
				command: "steam"
			}, async (err, results) => {
				if (err) {
					reject(err);
					return;
				}

				for (let result of results) {
					if (!/steam\.\w+$/i.test(result.command)) {
						continue;
					}

					this.steamRunningArgs = result.arguments;

					let r = await new Promise((res, rej) => {
						ps.kill(result.pid, (err) => {
							if (err) {
								rej(err);
								return;
							}

							res(true);
						});
					}).catch(reject);

					if (!r) {
						return;
					}
				}

				resolve(true);
			});
		});
	}

	StartSteam(filePath, asLocal, cb) {
		let args = [...(this.steamRunningArgs || [])];
		if (asLocal) {
			args.push("-websocket", "-websocketignorecertissues");
		}

		args.push("-noverifyfiles");

		this.steamProcess = childProcess.execFile(filePath, args);
		this.steamProcess.once("exit", (code, signal) => {
			console.log("Steam exited with code: " + code + ", signal: " + signal);

			if (signal === "SIGKILL") {
				// Sent by our script
				return;
			}

			cb();
		});
	}

	SocketPing() {
		return new Promise((resolve, reject) => {
			request("https://api.steampowered.com/ISteamDirectory/GetCMList/v1/?cellid=0&maxcount=20", async (err, __res, body) => {
				if (err) {
					reject(err);
					return;
				}

				let json = undefined;
				try {
					json = JSON.parse(body);
				} catch { }

				if (!json) {
					let e = new Error("Received invalid body");
					e.statusCode = __res.statusCode;
					e.body = body;
					reject(e);
					return;
				}

				if (!json.response || json.response.result !== 1) {
					let e = new Error("Received invalid JSON body");
					e.statusCode = __res.statusCode;
					e.json = json;
					reject(e);
					return;
				}

				let pings = [];

				for (let cm of json.response.serverlist_websockets) {
					let ping = await new Promise((res, rej) => {
						request({
							url: "https://" + cm + "/cmping/",
							timeout: 700,
							rejectUnauthorized: false
						}, (err, _res, body) => {
							if (err) {
								rej(err);
								return;
							}

							if (_res.statusCode !== 200) {
								rej(new Error("Invalid Status Code: " + _res.statusCode));
								return;
							}

							res(parseInt(_res.headers["x-steam-cmload"]) || Number.MAX_SAFE_INTEGER);
						});
					}).catch((err) => {
						console.error(err);
					});

					if (!ping) {
						continue;
					}

					pings.push({
						cm: cm,
						ping: ping
					});
				}

				if (pings.length <= 0 || pings.every(e => !e.ping || e.ping >= Number.MAX_SAFE_INTEGER)) {
					reject(new Error("All connection managers have failed to ping"));
					return;
				}

				let best = pings.sort((a, b) => a.ping - b.ping).pop();
				console.log("Best ping to cm is " + best.ping + " on " + best.cm);

				resolve("wss://" + best.cm + "/cmsocket/");
			});
		});
	}
}
