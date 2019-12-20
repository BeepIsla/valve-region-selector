// Modules
const { app, BrowserWindow, Menu, ipcMain, dialog, clipboard } = require("electron");
const path = require("path");
const url = require("url");
const Interceptor = require("./components/Interceptor.js");

// Global variables
let mainWindow = null;
let interceptor = new Interceptor();
let startupCpuUsage = process.cpuUsage();
let startupTimestamp = Date.now();

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
					"Arch: " + process.arch,
					"Platform: " + process.platform,
					"Process ID: " + process.pid,
					"Uptime: " + (process.uptime() / 60).toFixed(2) + "m",
					"Debugging: " + (process.argv.join(" ").includes("--inspect") ? "True" : "False"),
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
					title: "About & Information",
					detail: detailText
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

	// Create the browser window
	mainWindow = new BrowserWindow({
		width: 770 + 16,
		height: 600 + 58,
		webPreferences: {
			preload: path.join(__dirname, "public", "js", "preload.js")
		},
		show: false,
		resizable: false
	});

	// Load main page
	mainWindow.loadURL(url.format({
		pathname: path.join(__dirname, "public", "html", "index.html"),
		protocol: "file:",
		slashes: true
	}));

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	mainWindow.once("ready-to-show", () => {
		mainWindow.show();
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
			message: "You will now be required to select your \"Steam.exe\" in your Steam installation path.",
			detail: "Do not select any shortcuts, select the \"Steam.exe\" out of your Steam installation folder."
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

process.on("unhandledRejection", (reason, promise) => {
	console.error(reason, promise);
});
