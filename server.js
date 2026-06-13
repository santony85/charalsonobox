// server.js
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { triggerRecord } = require('./index');
const { spawn } = require('child_process');

const PORT = 3000;
const VIDEOS_DIR = path.join(__dirname, 'videos');
const PUBLIC_DIR = path.join(__dirname, 'public');

function createServer({ onStartRound }) {

  // --- HANDLER HTTP ---
  function requestHandler(req, res) {

    // Page principale
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(path.join(PUBLIC_DIR, 'index.html')).pipe(res);
    }

    // Proxy MJPEG (rotation possible)
    if (req.url === '/stream') {
      http.get('http://localhost:8080/?action=stream', (camRes) => {
        res.writeHead(200, {
          'Content-Type': camRes.headers['content-type'],
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        });
        camRes.pipe(res);
      });
      return;
    }

    // Liste des vidéos
    if (req.url === '/videos') {
      const files = fs.readdirSync(VIDEOS_DIR)
        .filter(f => f.endsWith('.mp4'))
        .map(f => ({ name: f, url: `/videos/${f}` }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(files));
    }

    // Lecture vidéo
    if (req.url.startsWith('/videos/')) {
      const file = path.join(VIDEOS_DIR, req.url.replace('/videos/', ''));
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'video/mp4' });
      return fs.createReadStream(file).pipe(res);
    }

    // Fichiers statiques
    if (req.url.startsWith('/public/')) {
      const file = path.join(PUBLIC_DIR, req.url.replace('/public/', ''));
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200);
      return fs.createReadStream(file).pipe(res);
    }

    res.writeHead(404);
    res.end();
  }

  // --- SERVEUR HTTP ---
  const httpServer = http.createServer(requestHandler);

  // --- WEBSOCKET ---
  const wss = new WebSocketServer({ server: httpServer });
  const clients = new Set();

  wss.on('connection', (ws) => {
    clients.add(ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'start_round' && typeof onStartRound === 'function') {
          triggerRecord();
          onStartRound();
        }
      } catch (e) {
        console.error('WS message error:', e.message);
      }
    });

    ws.on('close', () => clients.delete(ws));
    ws.on('error', (err) => console.error('WS error:', err.message));
  });

  function broadcast(data) {
    if (!clients.size) return;
    const msg = JSON.stringify(data);
    for (const c of clients) {
      if (c.readyState === 1) c.send(msg);
    }
  }

  // --- LANCEMENT ---
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur HTTP : http://192.168.1.118:${PORT}`);
  });

  return { broadcast };
}

module.exports = { createServer };
