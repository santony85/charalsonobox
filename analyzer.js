/**
 * Pondération A selon IEC 61672.
 * Retourne le gain linéaire à appliquer pour la fréquence f (Hz).
 */
function weightingA(f) {
  const f2 = f * f;
  const f4 = f2 * f2;
  const num = 148796129 * f4; // 12194^2 = 148796129
  const den =
	(f2 + 424.36) * // 20.6^2 = 424.36
	Math.sqrt((f2 + 11599.29) * (f2 + 544121.41)) * // 107.7^2, 737.9^2
	(f2 + 148796129);
  return num / den;
}

/**
 * Calcule le niveau SPL (dB) d'un buffer PCM S16_LE.
 *
 * @param {Buffer} pcmBuffer        - données PCM 16 bits little-endian
 * @param {number} sampleRate       - fréquence d'échantillonnage (Hz)
 * @param {number} calibrationOffset- décalage de calibration (dB), 0 par défaut
 * @param {'none'|'A'|'C'} weighting
 * @returns {{ dbSPL: number, peak: number, rms: number }}
 */
function analyze(pcmBuffer, sampleRate = 44100, calibrationOffset = 0, weighting = 'A') {
  // Sécurité : buffer vide ou taille impaire
  if (!pcmBuffer || pcmBuffer.length < 2) {
    return { dbSPL: 0, peak: 0, rms: 0 };
  }
  // S16_LE = 2 octets/sample → tronquer si impair
  const usableLength = pcmBuffer.length - (pcmBuffer.length % 2);
  const samples = usableLength / 2;
  
  const maxVal = 32768;

  // Lecture des samples S16_LE
  const pcm = new Array(samples);
  for (let i = 0; i < samples; i++) {
	pcm[i] = pcmBuffer.readInt16LE(i * 2) / maxVal;
  }

  let rmsLinear;
  let peakLinear = 0;

  if (weighting === 'none') {
	// RMS direct + find peak in one pass
	let sumSq = 0;
	for (let i = 0; i < samples; i++) {
	  const s = pcm[i];
	  const abs = s < 0 ? -s : s;
	  if (abs > peakLinear) peakLinear = abs;
	  sumSq += s * s;
	}
	rmsLinear = Math.sqrt(sumSq / samples);
  } else {
	// FFT + find peak in one pass
	rmsLinear = computeWeightedRMS(pcm, sampleRate, weighting);
	for (let i = 0; i < samples; i++) {
	  const abs = pcm[i] < 0 ? -pcm[i] : pcm[i];
	  if (abs > peakLinear) peakLinear = abs;
	}
  }

  // Référence : seuil d'audibilité (20 µPa → normalisé à 1.0 FS = ~94 dB SPL)
  // On suppose que le FS du micro correspond à ~94 dBSPL (à calibrer)
  const dbFS = 20 * Math.log10(Math.max(rmsLinear, 1e-10));
  const dbSPL = dbFS + 94 + calibrationOffset;
  
  if (rmsLinear < 1e-6 || rmsLinear > 0.99) {
    return null;
  }

  return {
	dbSPL: Math.round(dbSPL * 10) / 10,
	peak: Math.round(20 * Math.log10(Math.max(peakLinear, 1e-10)) * 10) / 10,
	rms: rmsLinear
  };
}

/**
 * Calcule le RMS pondéré (A ou C) via FFT rapide.
 */
function computeWeightedRMS(samples, sampleRate, weighting) {
  const N = nextPow2(samples.length);
  const padded = [...samples, ...new Array(N - samples.length).fill(0)];

  // FFT
  const { real, imag } = fft(padded);

  let weightedSumSq = 0;

  for (let k = 1; k < N / 2; k++) {
	const freq = (k * sampleRate) / N;
	const magnitude = Math.sqrt(real[k] ** 2 + imag[k] ** 2) / N;

	let w = 1;
	if (weighting === 'A') w = weightingA(freq);
	// Pour C (simplifié) :
	if (weighting === 'C') {
	  const f2 = freq * freq;
	  w = (12194 ** 2 * f2) / ((f2 + 20.6 ** 2) * (f2 + 12194 ** 2));
	}

	weightedSumSq += 2 * (magnitude * w) ** 2; // ×2 car spectre symétrique
  }

  return Math.sqrt(weightedSumSq);
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** FFT Cooley-Tukey itérative */
function fft(input) {
  const N = input.length;
  const real = Float64Array.from(input);
  const imag = new Float64Array(N);

  // Bit-reversal
  for (let i = 1, j = 0; i < N; i++) {
	let bit = N >> 1;
	for (; j & bit; bit >>= 1) j ^= bit;
	j ^= bit;
	if (i < j) {
	  [real[i], real[j]] = [real[j], real[i]];
	}
  }

  // Butterfly
  for (let len = 2; len <= N; len <<= 1) {
	const ang = (-2 * Math.PI) / len;
	const wReal = Math.cos(ang);
	const wImag = Math.sin(ang);
	for (let i = 0; i < N; i += len) {
	  let ur = 1, ui = 0;
	  const halfLen = len >> 1;
	  for (let k = 0; k < halfLen; k++) {
		const idx1 = i + k;
		const idx2 = i + k + halfLen;
		const tr = ur * real[idx2] - ui * imag[idx2];
		const ti = ur * imag[idx2] + ui * real[idx2];
		real[idx2] = real[idx1] - tr;
		imag[idx2] = imag[idx1] - ti;
		real[idx1] += tr;
		imag[idx1] += ti;
		const newUr = ur * wReal - ui * wImag;
		ui = ur * wImag + ui * wReal;
		ur = newUr;
	  }
	}
  }

  return { real, imag };
}

module.exports = { analyze };