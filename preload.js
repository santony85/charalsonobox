const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("capture", {
  get: () => ipcRenderer.invoke("get-screen-sources")
});

/*contextBridge.exposeInMainWorld("debug", {
  openDevTools: () => ipcRenderer.send("open-devtools")
});*/

contextBridge.exposeInMainWorld("screamer", {
  onStartRecording: cb => ipcRenderer.on("startRecording", cb),
  recordingFinished: () => ipcRenderer.send("recordingFinished"),
  qrcodeValidated: () => ipcRenderer.send("qrcodeValidated")
});

contextBridge.exposeInMainWorld("electron", {
  saveVideo: (arrayBuffer, filename) =>
	ipcRenderer.send("save-video", { arrayBuffer, filename })
});