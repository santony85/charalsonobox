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
function startCapture({ sampleRate = 44100, channels = 1, device = 'hw:1,0', chunkMs = 125, onChunk, onError }) {
  const bytesPerSample = 2; // S16_LE
  const chunkSize = Math.floor((sampleRate * channels * bytesPerSample * chunkMs) / 1000);


  
  const rec = spawn('arecord', [
    '-D', 'hw:1,0',   // ← ICI : plughw au lieu de hw
    '-f', 'S16_LE',
    '-r', String(sampleRate),
    '-c', "1",
    '--buffer-size=8192',
    '-t', 'raw',
    '-'
  ]);

  const ringBuffer = Buffer.alloc(chunkSize * 4); // Circular buffer
  let writePos = 0;

  rec.stdout.on('data', (data) => {
	for (let i = 0; i < data.length; i++) {
	  ringBuffer[writePos] = data[i];
	  writePos = (writePos + 1) % ringBuffer.length;

	  if (writePos % chunkSize === 0) {
		const startPos = (writePos - chunkSize + ringBuffer.length) % ringBuffer.length;
		let chunk;
		if (startPos + chunkSize <= ringBuffer.length) {
		  chunk = ringBuffer.slice(startPos, startPos + chunkSize);
		} else {
		  chunk = Buffer.alloc(chunkSize);
		  const part1Len = ringBuffer.length - startPos;
		  ringBuffer.copy(chunk, 0, startPos, ringBuffer.length);
		  ringBuffer.copy(chunk, part1Len, 0, chunkSize - part1Len);
		}
		if (chunk.length >= 2) onChunk(chunk);
	  }
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
