// Modules
const { app, BrowserWindow, Menu, ipcMain, dialog, clipboard, shell, Tray, Notification } = require("electron");
const path = require("path");
const url = require("url");
const request = require("request");
const Interceptor = require("./components/Interceptor.js");

// Force single instance
let singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
	app.quit();
}

// Global variables
let mainWindow = null;
let tray = null;
let interceptor = new Interceptor();
let startupCpuUsage = process.cpuUsage();
let startupTimestamp = Date.now();
let isDebugging = process.argv.join(" ").includes("--inspect");
let isLinux = !["win32", "darwin"].includes(process.platform);
let showedHiddenNotification = false;
let isQuitting = false;

function createWindow() {
	// Setup menu
	let menuTemplate = [
		{
			label: "About",
			click(item, focusedWindow) {
				let memoryUsage = process.memoryUsage();
				let systemMemoryInfo = process.getSystemMemoryInfo();
				let cpuUsage = process.cpuUsage(startupCpuUsage);

				let detailText = [
					"Version: " + app.getVersion(),
					"Arch: " + process.arch,
					"Platform: " + process.platform,
					"Process ID: " + process.pid,
					"Uptime: " + (process.uptime() / 60).toFixed(2) + "m",
					"Debugging: " + (isDebugging ? "True" : "False"),
					"Versions:",
					Object.keys(process.versions).map((key) => {
						return "    - " + key + ": " + process.versions[key]
					}),
					"Memory Usage:",
					"    - Resident Set Size: " + (memoryUsage.rss / 1024 / 1024).toFixed(2) + "MB",
					"    - Total Heap Size: " + (memoryUsage.heapTotal / 1024 / 1024).toFixed(2) + "MB",
					"    - Heap used: " + (memoryUsage.heapUsed / 1024 / 1024).toFixed(2) + "MB",
					"System:",
					"    - Total RAM: " + (systemMemoryInfo.total / 1024 / 1024).toFixed(2) + "GB",
					"    - Free RAM: " + (systemMemoryInfo.free / 1024 / 1024).toFixed(2) + "GB",
					"    - CPU Usage: " + (100 * (cpuUsage.user + cpuUsage.system) / ((Date.now() - startupTimestamp) * 1000)).toFixed(2) + "%"
				].flat().join("\n");

				dialog.showMessageBox({
					type: "info",
					buttons: ["Close", "Copy"],
					defaultId: 0,
					cancelId: 0,
					message: "Valve Region Selector",
					title: "About & Information",
					detail: "Created by github.com/BeepIsla\n\n" + detailText
				}).then((resp) => {
					if (resp.response !== 1) {
						return;
					}

					clipboard.writeText(detailText);
				}).catch(() => { });
			}
		}
	];

	if (process.argv.join(" ").includes("--inspect")) {
		menuTemplate.unshift({
			label: "Toggle Developer Tools",
			accelerator: process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
			click(item, focusedWindow) {
				if (focusedWindow) {
					focusedWindow.webContents.toggleDevTools();
				}
			}
		});
		menuTemplate.unshift({
			label: "Reload",
			accelerator: "CmdOrCtrl+R",
			click(item, focusedWindow) {
				if (focusedWindow) {
					focusedWindow.reload();
				}
			}
		});
	}

	let menu = Menu.buildFromTemplate(menuTemplate);
	Menu.setApplicationMenu(menu);

	let contextMenu = Menu.buildFromTemplate([
		{
			label: "Open",
			click: () => {
				mainWindow.show();
			}
		},
		{
			label: "Quit",
			click: () => {
				isQuitting = true;
				app.quit();
			}
		}
	]);

	tray = new Tray(path.join(isDebugging ? __dirname : process.resourcesPath, "assets", isLinux ? "256x256.png" : "icon.ico"));
	tray.setContextMenu(contextMenu);
	tray.setToolTip("Region Selector");
	tray.on("click", () => {
		if (mainWindow) {
			mainWindow.show();
		}
	});

	// Create the browser window
	mainWindow = new BrowserWindow({
		width: 770 + 16,
		height: 650 + 58,
		webPreferences: {
			preload: path.join(__dirname, "public", "js", "preload.js")
		},
		show: false,
		resizable: false,
		icon: path.join(__dirname, "assets", "icon.ico")
	});

	// Load main page
	mainWindow.loadURL(url.format({
		pathname: path.join(__dirname, "public", "html", "index.html"),
		protocol: "file:",
		slashes: true
	}));

	mainWindow.on("close", (ev) => {
		if (isQuitting) {
			return;
		}

		ev.preventDefault();
		mainWindow.hide();

		if (showedHiddenNotification) {
			return;
		}
		showedHiddenNotification = true;

		let hiddenNotification = new Notification({
			title: "Application hidden",
			body: "I am now hidden in the system tray, right-click my icon to quit.",
			silent: true,
			icon: path.join(isDebugging ? __dirname : process.resourcesPath, "assets", isLinux ? "256x256.png" : "icon.ico")
		});
		hiddenNotification.on("click", () => {
			hiddenNotification.close();
		});
		hiddenNotification.show();

		setTimeout(() => {
			hiddenNotification.close();
		}, 10000);
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	mainWindow.once("ready-to-show", () => {
		mainWindow.show();

		// Check for new releases
		new Promise((resolve, reject) => {
			request("https://raw.githubusercontent.com/BeepIsla/valve-region-selector/master/package.json", (err, res, body) => {
				if (err) {
					console.error(err);

					reject(err);
					return;
				}

				try {
					let json = typeof body === "object" ? body : JSON.parse(body);
					if (typeof json !== "object" || typeof json.version !== "string") {
						reject("Failed to check for updates.\nAPI returned invalid JSON data.");
						return;
					}

					if (json.version === app.getVersion()) {
						// Up-to-date
						resolve(true);
						return;
					}

					resolve(json.version);
				} catch (err) {
					console.error(err);

					reject("Failed to check for updates.\nAPI returned invalid JSON data.");
				}
			});
		}).then((version) => {
			if (typeof version === "string") {
				dialog.showMessageBox({
					type: "info",
					buttons: ["Close", "Open in Browser"],
					defaultId: 0,
					cancelId: 0,
					title: "Update Available!",
					detail: "A new version (" + version + ") is available!"
				}).then((resp) => {
					if (resp.response !== 1) {
						return;
					}

					shell.openExternal("https://github.com/BeepIsla/valve-region-selector/releases/latest");
				}).catch(() => { });
			}
		}).catch((err) => {
			if (typeof err === "string") {
				dialog.showMessageBox({
					type: "error",
					buttons: ["Close"],
					title: "Error",
					detail: err
				}).catch(() => { });
			} else {
				dialog.showMessageBox({
					type: "error",
					buttons: ["Close"],
					title: "Error",
					detail: err.message || err.code || err.toString()
				}).catch(() => { });
			}
		});
	});
}

app.on("ready", createWindow);

app.on("window-all-closed", async () => {
	await interceptor.stop().catch(() => { });
	interceptor.config.restoreConfigWebsockets();

	if (process.platform === "darwin") {
		return;
	}

	app.quit();
});

app.on("activate", () => {
	if (mainWindow) {
		return;
	}

	createWindow();
});

app.on("second-instance", (ev, argv, dir) => {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}

		mainWindow.focus();
	}
});

ipcMain.on("toggle", async (ev, args) => {
	if (!mainWindow) {
		return;
	}

	if (args.enabled) {
		mainWindow.webContents.send("status", {
			message: "Starting...",
			button: false
		});

		if (args.pingData) {
			interceptor.pingData = args.pingData;
		}

		await dialog.showMessageBox({
			type: "info",
			buttons: ["OK"],
			title: "Next Step",
			message: "You will now be required to select your \"" + (isLinux ? "Steam.sh" : "Steam.exe") + "\" " + (isLinux ? "file" : "") + " in your Steam installation path.",
			detail: "Do not select any shortcuts, select the \"" + (isLinux ? "Steam.sh" : "Steam.exe") + "\" " + (isLinux ? "file" : "") + " out of your Steam installation folder."
		}).catch(() => { });

		await interceptor.start(mainWindow, async () => {
			mainWindow.webContents.send("status", {
				message: "Stopping...",
				button: false
			});

			await interceptor.stop(false, true).catch(() => { });
			interceptor.config.restoreConfigWebsockets();

			mainWindow.webContents.send("status", {
				message: "Waiting",
				button: true
			});

			mainWindow.webContents.send("toggle", {
				canceled: true
			});
		});
	} else {
		mainWindow.webContents.send("status", {
			message: "Stopping...",
			button: false
		});

		await interceptor.stop(false, true);
		interceptor.config.restoreConfigWebsockets();

		mainWindow.webContents.send("status", {
			message: "Waiting",
			button: true
		});
	}
});

ipcMain.on("pings", (ev, args) => {
	if (!mainWindow || !args.pingData) {
		return;
	}

	interceptor.pingData = args.pingData;
});

ipcMain.on("openExternal", (ev, args) => {
	shell.openExternal(args.url);
});

process.on("unhandledRejection", (reason, promise) => {
	console.error(reason, promise);
});
