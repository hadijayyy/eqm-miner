#!/usr/bin/env node
/**
 * EQM CLI Miner — GPU-accelerated (NVIDIA CUDA) miner for EQM token on Solana Mainnet
 * Mint: 1MhvZzEe8gQ8Rb9CrT3Dn26Gkn9QRErzLMGkkTwveqm
 */

'use strict';

require('dotenv').config();
const { parseArgs }     = require('./lib/args');
const { runCpuMiner }   = require('./lib/cpu-worker');
const { runCudaMiner }  = require('./lib/cuda-worker');
const { fetchChallenge, submitNonce } = require('./lib/solana');
const { log }           = require('./lib/logger');

const args = parseArgs(process.argv.slice(2));

const BACKEND     = args.backend    || process.env.MINER_BACKEND   || 'auto';
const KEEP_MINING = args.once ? false : (process.env.KEEP_MINING !== 'false');

async function mine() {
  log('info', `EQM Miner starting — backend: ${BACKEND}`);
  log('info', `Mint: 1MhvZzEe8gQ8Rb9CrT3Dn26Gkn9QRErzLMGkkTwveqm`);

  while (true) {
    let challenge, difficulty;
    try {
      ({ challenge, difficulty } = await fetchChallenge());
      log('info', `Challenge: ${challenge.toString('hex').slice(0, 16)}… | Difficulty: ${difficulty}`);
    } catch (err) {
      log('error', `Failed to fetch challenge: ${err.message}`);
      await sleep(5000);
      continue;
    }

    let nonce;
    try {
      if (BACKEND === 'cuda' || (BACKEND === 'auto' && cudaAvailable())) {
        nonce = await runCudaMiner(challenge, difficulty, args);
      } else {
        nonce = await runCpuMiner(challenge, difficulty, args);
      }
    } catch (err) {
      log('error', `Mining error: ${err.message}`);
      await sleep(2000);
      continue;
    }

    if (nonce === null) {
      log('warn', 'Challenge expired before nonce found — refreshing');
      continue;
    }

    log('success', `Nonce found: ${nonce} — submitting…`);
    try {
      const sig = await submitNonce(nonce);
      log('success', `Submitted! Tx: ${sig}`);
      log('success', `Explorer: https://solscan.io/tx/${sig}`);
    } catch (err) {
      log('error', `Submit failed: ${err.message}`);
    }

    if (!KEEP_MINING) break;
    log('info', 'Restarting mining loop…');
  }
}

function cudaAvailable() {
  const fs   = require('fs');
  const path = require('path');
  const bin  = process.env.CUDA_MINER_BIN || path.join(__dirname, 'bin', 'eqm-cuda');
  return fs.existsSync(bin);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

mine().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
