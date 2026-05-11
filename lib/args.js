'use strict';

/**
 * Minimal CLI arg parser.
 * Supports: --backend <value>, --workers <n>, --gpu-batch <n>, --once
 */
function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--once') {
      result.once = true;
    } else if (arg.startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      result[arg.slice(2)] = argv[++i];
    }
  }
  return result;
}

module.exports = { parseArgs };
