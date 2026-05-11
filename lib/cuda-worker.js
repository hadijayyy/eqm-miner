'use strict';

const { spawn } = require('child_process');
const path      = require('path');
const { log }   = require('./logger');

const CUDA_MINER_BIN = process.env.CUDA_MINER_BIN
  || path.join(__dirname, '..', 'bin', 'eqm-cuda');

const GPU_BATCH_SIZE = parseInt(process.env.GPU_BATCH_SIZE || '134217728', 10); // 2^27

/**
 * Runs the native CUDA binary with challenge+difficulty, parses its stdout
 * for the winning nonce. The binary protocol:
 *   stdin:  "<challenge_hex> <difficulty_u64> <batch_size>\n"
 *   stdout: "FOUND <nonce>\n"  or  "EXHAUSTED\n"
 */
async function runCudaMiner(challenge, difficulty, args) {
  const batchSize = parseInt(args['gpu-batch'] || GPU_BATCH_SIZE, 10);
  log('info', `CUDA mining — batch ${batchSize} hashes/kernel`);

  return new Promise((resolve, reject) => {
    const proc = spawn(CUDA_MINER_BIN, [], { stdio: ['pipe', 'pipe', 'inherit'] });

    proc.on('error', err => {
      if (err.code === 'ENOENT') {
        reject(new Error(
          `CUDA binary not found at ${CUDA_MINER_BIN}. Run: sh scripts/build-cuda.sh`
        ));
      } else {
        reject(err);
      }
    });

    // Send parameters to the binary
    const msg = `${challenge.toString('hex')} ${difficulty.toString()} ${batchSize}\n`;
    proc.stdin.write(msg);

    let buf = '';
    proc.stdout.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('FOUND')) {
          const nonce = trimmed.split(' ')[1];
          proc.kill();
          resolve(nonce);
        } else if (trimmed === 'EXHAUSTED') {
          proc.kill();
          resolve(null);   // caller will refresh challenge
        } else if (trimmed) {
          log('gpu', trimmed);
        }
      }
    });

    proc.on('close', code => {
      if (code !== 0 && code !== null) {
        reject(new Error(`CUDA binary exited with code ${code}`));
      }
    });
  });
}

module.exports = { runCudaMiner };
