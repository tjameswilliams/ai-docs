// Minimal preload — context bridge for future use
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
});
