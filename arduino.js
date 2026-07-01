// arduino.js
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const EventEmitter = require("events");

class ArduinoGPIO extends EventEmitter {
  constructor() {
	super();

	this.port = new SerialPort({
	  path: "/dev/ttyUSB0",
	  baudRate: 115200
	});
	
	this.port.on("open", () => {
	  console.log("Port série Arduino ouvert");
	  this.emit("ready");
	});

	this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));

	// Lecture bouton
	this.parser.on("data", line => {
	  if (line.startsWith("BTN_PRESS")) {
		//const state = line.split(":")[1].trim();
		const state = "0";
		this.emit("button", state === "0"); // true = appuyé
	  }
	});
  }

  // Sortie ON
  ledOn() {
	this.port.write("1");
  }

  // Sortie OFF
  ledOff() {
	this.port.write("0");
  }
}

module.exports = new ArduinoGPIO();
