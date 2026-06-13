const { startCapture } = require('./capture');
const { analyze } = require('./analyzer');
const { update } = require('./display');
const { broadcast } = require('./server');
const { Gpio } = require('onoff');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Vidéos ─────────────────────────────────────────────────────
const VIDEOS_DIR = path.join(__dirname, 'videos');
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR);

// ── Config ─────────────────────────────────────────────────────
const CONFIG = {
  device: process.env.ALSA_DEVICE || 'hw:2,0',
  sampleRate: 44100,
  chunkMs: 200,
  weighting: 'A',
  calibrationFile: path.join(__dirname, 'calibration.json'),
};

// ── Calibration ────────────────────────────────────────────────
function loadCalibration() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.calibrationFile)).offset;
  } catch { return 0; }
}

// ── Enregistrement vidéo ───────────────────────────────────────
function recordRound(roundNumber, durationMs) {
  const filename = path.join(VIDEOS_DIR, `round_${roundNumber}_${Date.now()}.mp4`);

  const ff = spawn('ffmpeg', [
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
    '-c:a', 'aac',
    '-b:a', '128k',
    '-y',
    filename
  ]);

  ff.stderr.on('data', (d) => process.stderr.write(d));
  ff.on('close', (code) => {
    if (code === 0) console.log(`Vidéo enregistrée : ${filename}`);
    else console.error(`ffmpeg erreur code ${code}`);
  });

  return ff;
}

// ── État du jeu ────────────────────────────────────────────────
let currentRound = 0;
let gameActive = false;

function triggerRecord() {
  if (gameActive || currentRound >= 3) return;
  gameActive = true;

  // Attendre la fin du compte à rebours client (3s) puis enregistrer 3s
  setTimeout(() => {
    const ff = recordRound(currentRound + 1, 3000);
    ff.on('close', () => {
      currentRound++;
      gameActive = false;
      if (currentRound >= 3) {
        // Reset après 10s (temps d'afficher le résultat)
        setTimeout(() => { currentRound = 0; }, 10000);
      }
    });
  }, 3000);
}
module.exports = { triggerRecord };

// ── GPIO ───────────────────────────────────────────────────────
const button = new Gpio(17, 'in', 'rising', { debounceTimeout: 50 });
const led = new Gpio(27, 'out');
led.writeSync(1);

button.watch((err) => {
  if (err) return;
  broadcast({ type: 'button_press' });
  triggerRecord();
});

// ── Main ───────────────────────────────────────────────────────
async function main() {
  if (process.argv.includes('--calibrate')) {
    return runCalibration();
  }

  const calibrationOffset = loadCalibration();
  if (calibrationOffset !== 0) {
    console.log(`✔  Calibration chargée : ${calibrationOffset.toFixed(2)} dB`);
  }

  console.log('Démarrage du sonomètre...');

  startCapture({
    ...CONFIG,
    onChunk: (buf) => {
      const result = analyze(buf, CONFIG.sampleRate, calibrationOffset, CONFIG.weighting);
      if (!result) return;
      update(result.dbSPL, result.peak, CONFIG.device, CONFIG.weighting);
      broadcast({ dbSPL: result.dbSPL, peak: result.peak, ts: Date.now() });
    },
    onError: (err) => {
      console.error('Erreur capture :', err.message);
      process.exit(1);
    },
  });

  process.on('SIGINT', () => {
    led.unexport();
    button.unexport();
    console.log('\nArrêt.');
    process.exit(0);
  });
}

// ── Calibration ────────────────────────────────────────────────
async function runCalibration() {
  console.log('\n🎙  MODE CALIBRATION');
  process.stdout.write('Entrez le niveau de référence mesuré (ex: 94.0) : ');
  const reference = await new Promise(res => {
    process.stdin.resume();
    process.stdin.once('data', d => res(parseFloat(d.toString().trim())));
  });
  console.log('\nCapture de 3 secondes...');
  const samples = [];
  const stop = startCapture({
    ...CONFIG,
    onChunk: (buf) => {
      const r = analyze(buf, CONFIG.sampleRate, 0, CONFIG.weighting);
      if (r) samples.push(r.dbSPL);
    },
    onError: console.error,
  });
  await new Promise(r => setTimeout(r, 3000));
  stop();
  const measured = samples.reduce((a, b) => a + b, 0) / samples.length;
  const offset = reference - measured;
  fs.writeFileSync(CONFIG.calibrationFile, JSON.stringify({ offset, date: new Date() }));
  console.log(`\n✅ Offset : ${offset.toFixed(2)} dB`);
  process.exit(0);
}

main();