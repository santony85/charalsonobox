const arduino = require("./arduino");



setInterval(() => {
  arduino.ledOn();
  setTimeout(() => arduino.ledOff(), 1000);
}, 2000);