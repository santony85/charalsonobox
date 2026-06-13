const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const VIDEOS_DIR = path.join(__dirname, 'videos');

const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(__dirname, 'public', 'index.html')).pipe(res);
    return;
  }

  if (req.url === '/videos') {
    const files = fs.readdirSync(VIDEOS_DIR)
      .filter(f => f.endsWith('.mp4'))
      .map(f => ({ name: f, url: `/videos/${f}` }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(files));
    return;
  }

  if (req.url.startsWith('/videos/')) {
    const file = path.join(VIDEOS_DIR, req.url.replace('/videos/', ''));
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'video/mp4' });
    fs.createReadStream(file).pipe(res);
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Client connecté, total :', clients.size + 1);
  clients.add(ws);
  // Écouter les messages du client
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'start_round') {
        // Importer et déclencher l'enregistrement
        const { triggerRecord } = require('./index');
        triggerRecord();
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client déconnecté, total :', clients.size);
  });
});

function broadcast(data) {
  if (clients.size === 0) return;
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} déjà utilisé — retry dans 3s...`);
    setTimeout(() => { httpServer.close(); httpServer.listen(PORT, '0.0.0.0'); }, 3000);
  }
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur web : http://localhost:${PORT}`);
});

module.exports = { broadcast };