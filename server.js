// server.js
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { triggerRecord } = require('./index');
const { spawn } = require('child_process');
const zlib = require('zlib');
const QRCode = require("qrcode");

const PORT = 3000;
const VIDEOS_DIR = path.join(__dirname, 'videos');
const PUBLIC_DIR = path.join(__dirname, 'public');

const CACHE = { files: {}, videoList: null, videoListTime: 0 };
const CACHE_TTL = 30000; // 30s for video list

function createServer({ onStartRound }) {

  function requestHandler(req, res) {
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const shouldCompress = /gzip/.test(acceptEncoding) && req.method === 'GET';

    // Page principale
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      return fs.createReadStream(path.join(PUBLIC_DIR, 'index.html')).pipe(res);
    }

    // Proxy MJPEG
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
    
    //generateur qrcode
    if (req.url.startsWith("/qr")) {
        const urlObj = new URL(req.url, `https://${req.headers.host}`);
        const filename = urlObj.searchParams.get("file");
    
        if (!filename) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            return res.end("Missing file");
        }
    
        // URL publique de la vidéo
        const videoUrl = `https://snt-savary.fr:3000/videos/${filename}`;
    
        QRCode.toBuffer(videoUrl, { type: "png" })
            .then(buffer => {
                res.writeHead(200, { "Content-Type": "image/png" });
                res.end(buffer);
            })
            .catch(err => {
                console.error("QR error:", err);
                res.writeHead(500, { "Content-Type": "text/plain" });
                res.end("QR generation error");
            });
    
        return; // IMPORTANT
    }

    // Liste des vidéos avec cache
    if (req.url === '/videos') {
      const now = Date.now();
      if (CACHE.videoList && now - CACHE.videoListTime < CACHE_TTL) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=30'
        });
        return res.end(CACHE.videoList);
      }

      const files = fs.readdirSync(VIDEOS_DIR)
        .filter(f => f.endsWith('.mp4'))
        .map(f => ({ name: f, url: `/videos/${f}` }));

      const json = JSON.stringify(files);
      CACHE.videoList = json;
      CACHE.videoListTime = now;

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=30'
      });
      return res.end(json);
    }

    // Lecture vidéo
    if (req.url.startsWith('/videos/')) {
      const file = path.join(VIDEOS_DIR, req.url.replace('/videos/', ''));
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'max-age=86400'
      });
      return fs.createReadStream(file).pipe(res);
    }

    // Fichiers statiques avec cache
    if (req.url.startsWith('/public/')) {
      const file = path.join(PUBLIC_DIR, req.url.replace('/public/', ''));
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        return res.end();
      }

      const mimeTypes = {
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.html': 'text/html',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
      };
      const ext = path.extname(file).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      const cacheKey = file;
      if (CACHE.files[cacheKey]) {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'max-age=3600'
        });
        return res.end(CACHE.files[cacheKey]);
      }

      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end();
        }

        CACHE.files[cacheKey] = data;

        if (shouldCompress && data.length > 1024) {
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Encoding': 'gzip',
            'Cache-Control': 'max-age=3600'
          });
          return zlib.gzip(data, (err, compressed) => {
            if (err) return res.end(data);
            res.end(compressed);
          });
        }

        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'max-age=3600'
        });
        res.end(data);
      });
      return;
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
        console.log("->"+msg.type);
        if (msg.type === 'start_round' && typeof onStartRound === 'function') {
          triggerRecord();
          onStartRound();
        }
        if(msg.type === 'button_press' && typeof onStartRound === 'function'){
          console.log('button_press');
          //triggerRecord();
          //onStartRound();
          //broadcast({ type: "button_press" });
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
    console.log(`Serveur HTTP : http://charalbox.local:${PORT}`);
  });

  return { broadcast };
}

module.exports = { createServer };
