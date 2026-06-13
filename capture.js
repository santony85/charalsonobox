const { spawn } = require('child_process');

/**
 * Lance sox en continu et émet des buffers PCM bruts.
 * @param {object} opts
 * @param {number} opts.sampleRate   - Hz (ex: 44100)
 * @param {number} opts.channels     - 1 = mono
 * @param {string} opts.device       - ALSA device (ex: "hw:1,0")
 * @param {number} opts.chunkMs      - durée d'un chunk en ms (ex: 125)
 * @param {function} opts.onChunk    - callback(Buffer)
 * @param {function} opts.onError    - callback(Error)
 */
function startCapture({ sampleRate = 44100, channels = 1, device = 'plughw:3,0', chunkMs = 125, onChunk, onError }) {
  const bytesPerSample = 2; // S16_LE
  const chunkSize = Math.floor((sampleRate * channels * bytesPerSample * chunkMs) / 1000);

  /*const rec = spawn('arecord', [
	'-D', device,
	'-f', 'S16_LE',
	'-r', String(sampleRate),
	'-c', String(channels),
	'--buffer-size=8192',
	'-t', 'raw',   // sortie PCM brut, sans header WAV
	'-'
  ]);*/
  
  const rec = spawn('arecord', [
    '-D', 'plughw:3,0',   // ← ICI : plughw au lieu de hw
    '-f', 'S16_LE',
    '-r', String(sampleRate),
    '-c', "1",
    '--buffer-size=8192',
    '-t', 'raw',
    '-'
  ]);

  let buffer = Buffer.alloc(0);

  rec.stdout.on('data', (data) => {
	buffer = Buffer.concat([buffer, data]);
	while (buffer.length >= chunkSize) {
	  const chunk = buffer.slice(0, chunkSize);
	  buffer = buffer.slice(chunkSize);
	  if (chunk.length >= 2) onChunk(chunk);
	}
  });

  rec.stderr.on('data', (d) => {
	const msg = d.toString();
	if (!msg.includes('Recording')) onError?.(new Error(msg));
  });

  rec.on('close', (code) => {
	if (code !== 0) onError?.(new Error(`arecord exited with code ${code}`));
  });

  return () => rec.kill(); // retourne une fonction stop()
}

module.exports = { startCapture };