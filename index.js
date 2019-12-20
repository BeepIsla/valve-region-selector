// Modules
const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const url = require("url");
const Interceptor = require("./components/Interceptor.js");

// Global variables
let mainWindow = null;
let interceptor = new Interceptor();

async function createWindow() {
	// Setup menu
	let menuTemplate = [];
	if (process.argv.join(" ").includes("--inspect")) {
		menuTemplate.push({
			label: "Reload",
			accelerator: "CmdOrCtrl+R",
			click(item, focusedWindow) {
				if (focusedWindow) {
					focusedWindow.reload();
				}
			}
		});
		menuTemplate.push({
			label: "Toggle Developer Tools",
			accelerator: process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
			click(item, focusedWindow) {
				if (focusedWindow) {
					focusedWindow.webContents.toggleDevTools();
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
