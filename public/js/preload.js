const { ipcRenderer } = require("electron");
const tzdb = require("@vvo/tzdb");
const cities = require("all-the-cities");

// Pass modules down to the page
window.ipcRenderer = ipcRenderer;
window.isLinux = !["win32", "darwin"].includes(process.platform);
window.fixedNames = require("../data/SdrFixedNames.json");
window.tzdb = tzdb;
window.cities = cities;
