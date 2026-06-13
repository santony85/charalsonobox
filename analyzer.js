/**
 * Pondération A selon IEC 61672.
 * Retourne le gain linéaire à appliquer pour la fréquence f (Hz).
 */
function weightingA(f) {
  const f2 = f * f;
  const f4 = f2 * f2;
  const num = 12194 ** 2 * f4;
  const den =
	(f2 + 20.6 ** 2) *
	Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
	(f2 + 12194 ** 2);
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

  if (weighting === 'none') {
	// RMS direct
	const sumSq = pcm.reduce((acc, s) => acc + s * s, 0);
	rmsLinear = Math.sqrt(sumSq / samples);
  } else {
	// FFT maison (Cooley-Tukey) pour pondération fréquentielle
	rmsLinear = computeWeightedRMS(pcm, sampleRate, weighting);
  }

  const peak = Math.max(...pcm.map(Math.abs));

  // Référence : seuil d'audibilité (20 µPa → normalisé à 1.0 FS = ~94 dB SPL)
  // On suppose que le FS du micro correspond à ~94 dBSPL (à calibrer)
  const dbFS = 20 * Math.log10(Math.max(rmsLinear, 1e-10));
  const dbSPL = dbFS + 94 + calibrationOffset;
  
  if (rmsLinear < 1e-6 || rmsLinear > 0.99) {
    return null;
  }

  return {
	dbSPL: Math.round(dbSPL * 10) / 10,
	peak: Math.round(20 * Math.log10(Math.max(peak, 1e-10)) * 10) / 10,
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
  let j = 0;
  for (let i = 1; i < N; i++) {
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
	  for (let k = 0; k < len / 2; k++) {
		const tr = ur * real[i + k + len / 2] - ui * imag[i + k + len / 2];
		const ti = ur * imag[i + k + len / 2] + ui * real[i + k + len / 2];
		real[i + k + len / 2] = real[i + k] - tr;
		imag[i + k + len / 2] = imag[i + k] - ti;
		real[i + k] += tr;
		imag[i + k] += ti;
		const newUr = ur * wReal - ui * wImag;
		ui = ur * wImag + ui * wReal;
		ur = newUr;
	  }
	}
  }

  return { real, imag };
}

module.exports = { analyze };