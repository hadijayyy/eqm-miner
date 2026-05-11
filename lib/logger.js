'use strict';

const COLORS = {
  info:    '\x1b[36m',   // cyan
  success: '\x1b[32m',   // green
  warn:    '\x1b[33m',   // yellow
  error:   '\x1b[31m',   // red
  gpu:     '\x1b[35m',   // magenta
  reset:   '\x1b[0m',
};

function log(level, msg) {
  const ts    = new Date().toISOString().slice(11, 23);
  const color = COLORS[level] || COLORS.info;
  const tag   = `[${level.toUpperCase().padEnd(7)}]`;
  console.log(`${color}${ts} ${tag}${COLORS.reset} ${msg}`);
}

module.exports = { log };
