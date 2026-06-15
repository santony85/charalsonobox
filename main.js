const { 
  app, 
  BrowserWindow, 
  globalShortcut, 
  ipcMain, 
  desktopCapturer 
} = require("electron");

const path = require("path");
const fs = require("fs");

const { spawn } = require("child_process");

// IP WireGuard du VPS
const VPS_WG_IP = "10.8.0.1";
const PUBLIC_BASE_URL = "https://snt-savary.fr:3000/videos/";


// --- Forcer X11 (Raspberry Pi) ---
app.commandLine.appendSwitch("ozone-platform", "x11");

// --- Désactiver GPU (stabilité Pi) ---
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");

// --- Forcer rendu CPU SwiftShader ---
app.commandLine.appendSwitch("use-gl", "swiftshader");

// --- Autoriser capture écran ---
app.commandLine.appendSwitch("enable-usermedia-screen-capturing");
app.commandLine.appendSwitch("auto-select-desktop-capture-source", "Charal Screamer");

function createWindow() {
  
  // Lance ton serveur Node
  const backend = spawn('node', ['mainapp.js'], {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  backend.on('close', (code) => {
    console.log('Backend exited with code', code);
  });
  const win = new BrowserWindow({
	fullscreen: true,
	autoHideMenuBar: true,
	webPreferences: {
	  preload: path.join(__dirname, "preload.js"),
	  nodeIntegration: false,
	  contextIsolation: true,
	  sandbox: false,
	  webSecurity: false,
	  allowRunningInsecureContent: true
	}
  });

  // Raccourci pour quitter
  globalShortcut.register("Control+Q", () => app.quit());

  // Raccourci pour ouvrir DevTools
  globalShortcut.register("Control+Shift+I", () => {
	win.webContents.openDevTools({ mode: "detach" });
  });

  // Charger ton serveur local en HTTP
  const url = "http://localhost:3000";

  const tryLoad = () => {
	win.loadURL(url).catch(() => {
	  console.log("Serveur pas prêt, retry...");
	  setTimeout(tryLoad, 1000);
	});
  };

  tryLoad();
  
  // Créer une fenêtre DevTools séparée
  /*const devWin = new BrowserWindow({
	width: 900,
	height: 700,
	alwaysOnTop: true,       // DevTools reste au-dessus
	autoHideMenuBar: false
  });
  
  // Associer DevTools à cette fenêtre
  win.webContents.setDevToolsWebContents(devWin.webContents);
  
  // Ouvrir DevTools dans cette fenêtre
  win.webContents.openDevTools({ mode: "detach" });*/

  // Quand la page est prête → déclencher la capture
  win.webContents.on("did-frame-finish-load", () => {
	console.log("Page chargée → démarrage capture");
	win.webContents.send("start-capture");
  });


}

// --- API IPC pour la capture écran ---
ipcMain.handle("get-screen-sources", async () => {
  const sources = await desktopCapturer.getSources({
	types: ["screen"],
	thumbnailSize: { width: 0, height: 0 }
  });
  return sources;
});

ipcMain.on("save-video", async (event, { arrayBuffer, filename }) => {
  const savePath = path.join(__dirname, "videos", filename);
  const buffer = Buffer.from(arrayBuffer); // conversion ici
  
  console.log("➡ Upload vers VPS :", filename);
  
  const res = await fetch(`http://${VPS_WG_IP}:3000/upload?name=${filename}`, {
	method: "POST",
	headers: { "Content-Type": "video/webm" },
	body: buffer
  });
  
  if (!res.ok) {
	console.error("❌ Erreur upload VPS :", res.status);
	event.reply("video-uploaded", { success: false });
	return;
  }
  
  console.log("✅ Upload réussi :", filename);
  
  // URL publique accessible par les joueurs en 4G
  const publicUrl = PUBLIC_BASE_URL + filename;
  
  // Renvoi au front
  event.reply("video-uploaded", {
	success: true,
	url: publicUrl
  });
  
  
  //local
  fs.writeFile(savePath, buffer, err => {
	if (err) console.error("Erreur sauvegarde vidéo :", err);
	else console.log("Vidéo enregistrée :", savePath);
  });
  
  
  
});


app.whenReady().then(createWindow);
