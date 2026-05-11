'use strict';

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const crypto = require('crypto');
const os     = require('os');
const { log } = require('./logger');

const CPU_WORKERS   = parseInt(process.env.CPU_WORKERS   || String(os.cpus().length), 10);
const CPU_BATCH_SIZE = parseInt(process.env.CPU_BATCH_SIZE || '100000', 10);

/**
 * Main-thread entry: spawns N worker threads, each searching a different nonce range.
 */
async function runCpuMiner(challenge, difficulty, args) {
  const workers = parseInt(args.workers || CPU_WORKERS, 10);
  log('info', `CPU mining with ${workers} threads — batch ${CPU_BATCH_SIZE}`);

  return new Promise((resolve, reject) => {
    let found = false;
    let baseNonce = BigInt(0);
    const range = BigInt(CPU_BATCH_SIZE);

    const threads = [];
    for (let i = 0; i < workers; i++) {
      const start = baseNonce + range * BigInt(i);
      const w = spawnWorker(challenge, difficulty, start, range, workers);
      threads.push(w);

      w.on('message', msg => {
        if (msg.type === 'found' && !found) {
          found = true;
          threads.forEach(t => t.terminate());
          resolve(msg.nonce);
        } else if (msg.type === 'exhausted' && !found) {
          // advance this worker's range
          baseNonce += range * BigInt(workers);
          const newStart = baseNonce + range * BigInt(i);
          w.postMessage({ type: 'next', start: newStart.toString() });
        }
      });
      w.on('error', reject);
    }
  });
}

function spawnWorker(challenge, difficulty, start, range, totalWorkers) {
  return new Worker(__filename, {
    workerData: {
      challenge: challenge.toString('hex'),
      difficulty: difficulty.toString(),
      start: start.toString(),
      range: range.toString(),
    },
  });
}

// ---------- Worker thread ----------
if (!isMainThread) {
  const { challenge: chalHex, difficulty: diffStr, start: startStr, range: rangeStr } = workerData;
  const challenge   = Buffer.from(chalHex, 'hex');
  const difficulty  = BigInt(diffStr);
  const batchSize   = BigInt(rangeStr);

  function search(startNonce) {
    let nonce = BigInt(startNonce);
    const end = nonce + batchSize;

    while (nonce < end) {
      const buf = Buffer.alloc(40);
      challenge.copy(buf, 0);
      buf.writeBigUInt64LE(nonce, 32);

      const hash = crypto.createHash('sha256').update(buf).digest();
      const hashVal = hash.readBigUInt64LE(0);   // first 8 bytes as LE u64

      if (hashVal < difficulty) {
        parentPort.postMessage({ type: 'found', nonce: nonce.toString() });
        return;
      }
      nonce++;
    }
    parentPort.postMessage({ type: 'exhausted' });
  }

  search(startStr);

  parentPort.on('message', msg => {
    if (msg.type === 'next') search(msg.start);
  });
}

module.exports = { runCpuMiner };
