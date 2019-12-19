const { dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const VDF = require("simple-vdf");
const hardcodedCMs = [
	"CM01-FRA.cm.steampowered.com:27021", "cm4-fra1.cm.steampowered.com:443", "CM03-FRA.cm.steampowered.com:27020",
	"cm4-fra1.cm.steampowered.com:27020", "CM01-FRA.cm.steampowered.com:443", "CM01-FRA.cm.steampowered.com:27020",
	"cm4-fra1.cm.steampowered.com:27021", "cm2-fra1.cm.steampowered.com:443", "cm2-fra1.cm.steampowered.com:27021",
	"cm2-fra1.cm.steampowered.com:27020", "CM03-FRA.cm.steampowered.com:27021", "CM03-FRA.cm.steampowered.com:443",
	"CM02-LUX.cm.steampowered.com:443", "CM01-LUX.cm.steampowered.com:443", "CM01-LUX.cm.steampowered.com:27021",
	"cm3-sto1.cm.steampowered.com:27020", "CM02-LUX.cm.steampowered.com:27020", "cm4-sto1.cm.steampowered.com:27020",
	"cm4-sto1.cm.steampowered.com:443", "cm4-sto1.cm.steampowered.com:27021"
];

module.exports = class Config {
	constructor() {
		this.steamInstallPath = undefined;
		this.backupCMSockets = undefined;
	}

	get configPath() {
		if (!this.steamInstallPath) {
			return false;
		}

		let configPath = path.join(this.steamInstallPath, "config", "config.vdf");
		if (!fs.existsSync(configPath)) {
			return false;
		}

		return configPath;
	}

	getConfigWebsocketsObjectPath(vdf) {
		let _path = ["InstallConfigStore", "Software", "Valve", "Steam", "CMWebSocket"];
		let outPath = [];
		let errors = 0;
		let temp = vdf;

		// Some configs have the keys as lowercase, some don't

		for (let i = 0; i < _path.length; i++) {
			let o = temp[_path[i]];
			if (!o) {
				_path[i] = _path[i].toLowerCase();

				errors += 1;
				i--;

				if (errors >= 2) {
					return false;
				}

				continue;
			}

			errors = 0;

			outPath.push(_path[i]);

			temp = o;
		}

		return outPath;
	}

	saveConfigWebsockets() {
		let config = this.configPath;
		if (!config || !fs.existsSync(config)) {
			return false;
		}

		try {
			let parsed = VDF.parse(fs.readFileSync(config).toString());
			let objPath = this.getConfigWebsocketsObjectPath(parsed);
			if (!objPath) {
				return false;
			}

			let backupCMSockets = eval("parsed[\"" + objPath.join("\"][\"") + "\"]");

			this.backupCMSockets = backupCMSockets;
			return this.backupCMSockets || false;
		} catch (err) {
			return false;
		}
	}

	overrideConfigWebsockets(port) {
		let config = this.configPath;
		if (!config || !fs.existsSync(config)) {
			return false;
		}

		try {
			let parsed = VDF.parse(fs.readFileSync(config).toString());
			let objPath = this.getConfigWebsocketsObjectPath(parsed);
			if (!objPath) {
				return false;
			}

			let cmSockets = eval("parsed[\"" + objPath.join("\"][\"") + "\"]");
			cmSockets = {
				["127.0.0.1:" + port]: {
					LastLoadValue: 0,
					LastPingTimestamp: Math.round(Date.now() / 1000),
					LastPingValue: 10
				}
			};
			eval("parsed[\"" + objPath.join("\"][\"") + "\"] = " + JSON.stringify(cmSockets));

			fs.writeFileSync(config, VDF.stringify(parsed, true));
			return true;
		} catch (err) {
			return false;
		}
	}

	restoreConfigWebsockets() {
		let config = this.configPath;
		if (!config || !fs.existsSync(config)) {
			return false;
		}

		try {
			let parsed = VDF.parse(fs.readFileSync(config).toString());
			let objPath = this.getConfigWebsocketsObjectPath(parsed);
			if (!objPath) {
				return false;
			}

			// Ensure we always write at least some CM sockets and not only one
			// If there is only one its most likely our 127.0.0.1 one which we dont want to write
			if (this.backupCMSockets.length <= 1) {
				this.backupCMSockets = {};

				for (let cm of hardcodedCMs) {
					this.backupCMSockets[cm] = {
						LastLoadValue: 0,
						LastPingTimestamp: Math.round(Date.now() / 1000),
						LastPingValue: 10
					}
				}
			}

			eval("parsed[\"" + objPath.join("\"][\"") + "\"] = " + JSON.stringify(this.backupCMSockets));

			fs.writeFileSync(config, VDF.stringify(parsed, true));
			return true;
		} catch (err) {
			return false;
		}
	}

	findSteamPath(mainWindow) {
		return new Promise(async (resolve, reject) => {
			let steamPath = await dialog.showOpenDialog(mainWindow, {
				title: "Steam Directory",
				properties: ["openFile"],
				filters: [
					{
						name: "Steam",
						extensions: ["exe"]
					}
				]
			}).catch(reject);
			if (!steamPath) {
				return;
			}

			if (steamPath.canceled || steamPath.filePaths.length <= 0) {
				mainWindow.webContents.send("toggle", {
					canceled: true
				});
				resolve(undefined);
				return;
			}

			this.steamInstallPath = path.parse(steamPath.filePaths[0]).dir;
			resolve({
				path: this.steamInstallPath,
				raw: steamPath.filePaths[0]
			});
		});
	}
}
