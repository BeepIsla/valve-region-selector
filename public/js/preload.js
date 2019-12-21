const { ipcRenderer } = require("electron");

// Pass modules down to the page
window.ipcRenderer = ipcRenderer;
window.isLinux = !["win32", "darwin"].includes(process.platform);
