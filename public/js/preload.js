const { ipcRenderer } = require("electron");

// Pass modules down to the page
window.ipcRenderer = ipcRenderer;
