// index.js
const { startCapture } = require('./capture');
const { analyze } = require('./analyzer');
const { update } = require('./display');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VIDEOS_DIR = path.join(__dirname, 'videos');
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR);

const CONFIG = {
  device: process.env.ALSA_DEVICE || 'plughw:3,0',
  sampleRate: 44100,
  chunkMs: 200,
  weighting: 'A',
  calibrationFile: path.join(__dirname, 'calibration.json'),
};

let currentRound = 0;
let gameActive = false;
let ffmpegProcess = null;
let broadcast = () => {}; // injecté par main.js

function setBroadcast(fn) {
  broadcast = typeof fn === 'function' ? fn : () => {};
}

function loadCalibration() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.calibrationFile)).offset;
  } catch {
    return 0;
  }
}

function recordRound(roundNumber, durationMs) {
  const filename = path.join(VIDEOS_DIR, `round_${roundNumber}_${Date.now()}.mp4`);
  const streamUrl = `http://localhost:8080/?action=stream`;

  if (ffmpegProcess) {
    try { ffmpegProcess.kill('SIGKILL'); } catch {}
  }

  const ff = spawn('ffmpeg', [
    '-f', 'mjpeg',                 // ← IMPORTANT
    '-i', streamUrl,               // ← flux MJPEG
    '-t', String(durationMs / 1000),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-y',
    filename
  ]);
  
  
  /*const ff = spawn('ffmpeg', [
    '-f', 'v4l2',
    '-input_format', 'mjpeg',
    '-video_size', '1920x1080',
    '-framerate', '30',
    '-i', '/dev/video0',
    '-f', 'alsa',
    '-ac', '1',
    '-ar', '44100',
    '-i', 'hw:2,0',
    '-t', String(durationMs / 1000),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-profile:v', 'baseline',  // ← compatibilité QuickTime
    '-level', '3.0',           // ← compatibilité QuickTime
    '-pix_fmt', 'yuv420p',     // ← indispensable pour QuickTime
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart', // ← lecture rapide / streaming
    '-y',
    filename
  ]);*/

  ffmpegProcess = ff;

  ff.stderr.on('data', d => process.stderr.write(d));
  ff.on('close', (code) => {
    ffmpegProcess = null;
    if (code === 0) console.log(`Vidéo enregistrée : ${filename}`);
    else console.error(`ffmpeg erreur code ${code}`);
  });

  return ff;
}

function triggerRecord() {
  if (gameActive || currentRound >= 3) return;
  gameActive = true;

  // Enregistrement: 2s pre + 3s countdown + 4s cry + 2s post = 11s total
  const ff = recordRound(currentRound + 1, 11000);
  ff.on('close', () => {
    currentRound++;
    gameActive = false;
    if (currentRound >= 3) {
      setTimeout(() => { currentRound = 0; }, 10000);
    }
  });
}

function startSonometer() {
  const calibrationOffset = loadCalibration();
  if (calibrationOffset !== 0) {
    console.log(`✔ Calibration chargée : ${calibrationOffset.toFixed(2)} dB`);
  }

  console.log('Démarrage du sonomètre...');

  startCapture({
    ...CONFIG,
    onChunk: (buf) => {
      const result = analyze(buf, CONFIG.sampleRate, calibrationOffset, CONFIG.weighting);
      if (result) {
        update(result.dbSPL, result.peak, CONFIG.device, CONFIG.weighting);
        broadcast({
          type: 'level',
          dbSPL: result.dbSPL,
          peak: result.peak,
          ts: Date.now(),
        });
      }
    },
    onError: (err) => {
      console.error('Erreur capture :', err.message);
      console.error('Vérifiez le device ALSA avec : arecord -l');
      process.exit(1);
    },
  });

  process.on('SIGINT', () => {
    if (ffmpegProcess) {
      try { ffmpegProcess.kill('SIGKILL'); } catch {}
    }
    console.log('\n👋 Arrêt du sonomètre.');
    process.exit(0);
  });
}

module.exports = {
  triggerRecord,
  startSonometer,
  setBroadcast,
};
