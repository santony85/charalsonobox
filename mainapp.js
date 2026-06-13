// main.js
const { createServer } = require('./server');
const { triggerRecord, startSonometer, setBroadcast } = require('./index');

// Démarre le serveur HTTP + WebSocket
const { broadcast } = createServer({
  onStartRound: () => {
	console.log('▶ start_round reçu (WS)');
	triggerRecord();
  }
});

// Injecte la fonction broadcast dans le sonomètre
setBroadcast(broadcast);

// Mode calibration (optionnel)
if (process.argv.includes('--calibrate')) {
  console.log('Mode calibration non implémenté ici (à ajouter si besoin).');
  process.exit(0);
} else {
  // Démarre le sonomètre
  startSonometer();
}
