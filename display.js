const chalk = require('chalk');

const HISTORY_SIZE = 60; // 60 mesures gardées pour Leq
const history = [];

function getColor(db) {
  if (db < 55) return chalk.green;
  if (db < 70) return chalk.yellow;
  if (db < 85) return chalk.hex('#FFA500');
  return chalk.red;
}

function drawBar(db, min = 30, max = 110) {
  const width = 40;
  const normalized = Math.max(0, Math.min(1, (db - min) / (max - min)));
  const filled = Math.round(normalized * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return getColor(db)(bar);
}

/**
 * Leq (niveau équivalent) sur la fenêtre history
 */
function computeLeq(dbValues) {
  if (!dbValues.length) return 0;
  const sumPow = dbValues.reduce((acc, db) => acc + Math.pow(10, db / 10), 0);
  return 10 * Math.log10(sumPow / dbValues.length);
}

function update(dbSPL, peak, device, weighting) {
  if (dbSPL === null) return; // chunk invalide, on skip	
  history.push(dbSPL);
  if (history.length > HISTORY_SIZE) history.shift();

  const leq = Math.round(computeLeq(history) * 10) / 10;
  const max = Math.max(...history);
  const min = Math.min(...history);

  const color = getColor(dbSPL);
  const lines = [];

  lines.push(chalk.bold.cyan('═══════════════════════════════════════════════════'));
  lines.push(chalk.bold.cyan('           🎙  SONOMÈTRE — Raspberry Pi 5          '));
  lines.push(chalk.bold.cyan('═══════════════════════════════════════════════════'));
  lines.push(`  Appareil : ${chalk.white(device)}   Pondération : ${chalk.white(weighting)}`);
  lines.push('');
  lines.push(`  Niveau instantané : ${color.bold(dbSPL.toFixed(1) + ' dB' + weighting)}`);
  lines.push(`  ${drawBar(dbSPL)}`);
  lines.push('');
  lines.push(`  Leq (${HISTORY_SIZE} mesures)  : ${chalk.cyan(leq.toFixed(1))} dBSPL`);
  lines.push(`  Max observé        : ${chalk.red(max.toFixed(1))} dBSPL`);
  lines.push(`  Min observé        : ${chalk.green(min.toFixed(1))} dBSPL`);
  lines.push(`  Pic instantané     : ${chalk.magenta(peak.toFixed(1))} dBFS`);
  lines.push('');

  const sparkline = history.slice(-30).map(db => {
	if (db < 50) return chalk.green('▁');
	if (db < 60) return chalk.green('▃');
	if (db < 70) return chalk.yellow('▅');
	if (db < 80) return chalk.hex('#FFA500')('▇');
	return chalk.red('█');
  }).join('');
  lines.push(`  Historique : ${sparkline}`);
  lines.push('');
  lines.push(chalk.gray('  Ctrl+C pour quitter | --calibrate pour calibrer'));
  lines.push(chalk.cyan('═══════════════════════════════════════════════════'));

  // Aller en haut du terminal sans effacer, puis écrire d'un coup
  process.stdout.write('\x1B[H' + lines.join('\n') + '\n');
}

module.exports = { update };