const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("capture", {
  get: () => ipcRenderer.invoke("get-screen-sources")
});

/*contextBridge.exposeInMainWorld("debug", {
  openDevTools: () => ipcRenderer.send("open-devtools")
});*/

contextBridge.exposeInMainWorld("electron", {
  saveVideo: (arrayBuffer, filename) =>
	ipcRenderer.send("save-video", { arrayBuffer, filename })
});