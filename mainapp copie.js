// main.js
const { createServer } = require('./server');
const { triggerRecord, startSonometer, setBroadcast } = require('./index');
const arduino = require('./arduino');

// Démarre le serveur HTTP + WebSocket
const { broadcast } = createServer({
  onStartRound: () => {
    console.log('▶ start_round reçu (WS)');
    triggerRecord();
    arduino.ledOn();
  }
});

// Bouton Arduino → startRecord
arduino.on("button", pressed => {
  if (pressed) {
    console.log("▶ Bouton Arduino → triggerRecord()");
    stopBuzzer();  
    triggerRecord();
    arduino.ledOn();
  }
});

let buzzerActive = false;

// Allume le buzzer en continu
function startBuzzer() {
  if (buzzerActive) return;
  buzzerActive = true;
  arduino.ledOff();   // buzzer ON
}

// Éteint le buzzer
function stopBuzzer() {
  buzzerActive = false;
  arduino.ledOff();  // buzzer OFF
}

// LED OFF quand la vidéo est terminée
process.on("message", msg => {
  if (msg.type === "recordingFinished") {
    console.log("⏹ Enregistrement terminé → LED OFF");
    arduino.ledOff();
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
