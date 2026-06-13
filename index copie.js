const { startCapture } = require('./capture');
const { analyze } = require('./analyzer');
const { update } = require('./display');
const { broadcast } = require('./server');

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { execSync } = require('child_process');

const VIDEOS_DIR = path.join(__dirname, 'videos');
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR);

let currentRound = 0;
let gameActive = false;
let ffmpegProcess = null;

// ── État du jeu ────────────────────────────────────────────────
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

// ── Configuration ──────────────────────────────────────────────
const CONFIG = {
  device: process.env.ALSA_DEVICE || 'hw:3,0',  // ajuster si besoin
  sampleRate: 44100,
  chunkMs: 200,          // mesure toutes les 125 ms (8 Hz)
  weighting: 'A',        // 'A', 'C', ou 'none'
  calibrationFile: path.join(__dirname, 'calibration.json'),
};

// ── Calibration ────────────────────────────────────────────────
function loadCalibration() {
  try {
	return JSON.parse(fs.readFileSync(CONFIG.calibrationFile)).offset;
  } catch {
	return 0;
  }
}

function readGpio(pin) {
  const out = execSync(`gpioget gpiochip0 ${pin}`).toString().trim();
  return out === "1" ? 1 : 0;
}

function recordRound(roundNumber, durationMs) {
  const filename = path.join(VIDEOS_DIR, `round_${roundNumber}_${Date.now()}.mp4`);

  const ff = spawn('ffmpeg', [
    // Webcam
    '-f', 'v4l2',
    '-input_format', 'mjpeg',
    '-video_size', '1920x1080',
    '-framerate', '30',
    '-i', '/dev/video0',
    // Micro
    '-f', 'alsa',
    '-ac', '1',
    '-ar', '44100',
    '-i', 'hw:2,0',
    // Durée
    '-t', String(durationMs / 1000),
    // Encodage rapide
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

async function runCalibration() {
  console.log('\n🎙  MODE CALIBRATION');
  console.log('══════════════════════════════════════════');
  console.log('Placez une source sonore calibrée à 94 dB SPL (ex: pistonphone)');
  console.log('ou utilisez une application mobile de référence.');
  console.log('');
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
	  const result = analyze(buf, CONFIG.sampleRate, calibrationOffset, CONFIG.weighting);
	  if (result) {
	    update(result.dbSPL, result.peak, CONFIG.device, CONFIG.weighting);
		broadcast({dbSPL: result.dbSPL,peak: result.peak,ts: Date.now(),});
		process.stdout.write(`broadcast: ${result.dbSPL}\n`); // ← temporaire
		console.log(result.dbSPL);
	  }
	},
	onError: console.error,
  });

  await new Promise(r => setTimeout(r, 3000));
  stop();

  const measured = samples.reduce((a, b) => a + b, 0) / samples.length;
  const offset = reference - measured;

  fs.writeFileSync(CONFIG.calibrationFile, JSON.stringify({ offset, date: new Date() }));
  console.log(`\n✅ Calibration terminée. Offset : ${offset.toFixed(2)} dB`);
  console.log('Relancez avec : node index.js');
  process.exit(0);
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  if (process.argv.includes('--calibrate')) {
	return runCalibration();
  }

  const calibrationOffset = loadCalibration();
  if (calibrationOffset !== 0) {
	console.log(`✔  Calibration chargée : ${calibrationOffset.toFixed(2)} dB`);
	await new Promise(r => setTimeout(r, 1000));
  }

  console.log('Démarrage du sonomètre...');

  startCapture({
	...CONFIG,
	onChunk: (buf) => {
	  const result = analyze(buf, CONFIG.sampleRate, calibrationOffset, CONFIG.weighting);
	  if (result) {
		update(result.dbSPL, result.peak, CONFIG.device, CONFIG.weighting);
		broadcast({dbSPL: result.dbSPL,peak: result.peak,ts: Date.now(),});
		process.stdout.write(`broadcast: ${result.dbSPL}\n`); // ← temporaire
		console.log(result.dbSPL);
	  }
	},
	onError: (err) => {
	  console.error('Erreur capture :', err.message);
	  console.error('Vérifiez le device ALSA avec : arecord -l');
	  console.error(`Puis modifiez CONFIG.device dans index.js ou : ALSA_DEVICE=hw:X,0 node index.js`);
	  process.exit(1);
	},
  });
  
  

  
  process.on('SIGINT', () => {
    button.unexport();
    led.unexport();
    //spawnSync('gpioset', ['--chip=0', '27=0']);
	console.log('\n👋 Arrêt du sonomètre.');
	process.exit(0);
  });
}

main();