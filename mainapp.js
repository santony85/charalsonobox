// main.js
const { createServer } = require('./server');
const { triggerRecord, startSonometer, setBroadcast } = require('./index');
const arduino = require('./arduino');

// 🔥 Buzzer ON au démarrage de l'application


// Démarre le serveur HTTP + WebSocket
const { broadcast } = createServer({
  onStartRound: () => {
    console.log('▶ start_round reçu (WS)');
    triggerRecord();
    arduino.ledOn();   // buzzer ON pour lancer un essai
  }
});


setTimeout(() => {
  arduino.ledOn();
}, 2500);

arduino.on("ready", () => {
  console.log("Arduino prêt → buzzer ON au démarrage");

});

// Bouton Arduino → startRecord
arduino.on("button", pressed => {
  if (pressed) {
    console.log("▶ Bouton Arduino → triggerRecord()");
    //triggerRecord();
    broadcast({ type: "button_press" });
    arduino.ledOff();  // buzzer OFF dès que le joueur appuie
  }
});

// LED OFF quand la vidéo est terminée
process.on("message", msg => {
  if (msg.type === "recordingFinished") {
    console.log("⏹ Enregistrement terminé → LED OFF");
    arduino.ledOn();
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
