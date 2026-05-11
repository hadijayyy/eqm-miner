#!/usr/bin/env node
/**
 * check-state.js — inspect the current EQM mining state on Solana Mainnet
 */
'use strict';

require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { log } = require('./lib/logger');

const RPC_URL   = process.env.RPC_URL   || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = process.env.PROGRAM_ID || '';
const MINT      = '1MhvZzEe8gQ8Rb9CrT3Dn26Gkn9QRErzLMGkkTwveqm';

(async () => {
  if (!PROGRAM_ID) {
    log('error', 'PROGRAM_ID is not set in .env');
    process.exit(1);
  }

  const conn = new Connection(RPC_URL, 'confirmed');

  log('info', `RPC      : ${RPC_URL}`);
  log('info', `Program  : ${PROGRAM_ID}`);
  log('info', `Mint     : ${MINT}`);

  // Derive state PDA
  const [statePda] = await PublicKey.findProgramAddressSync(
    [Buffer.from('state'), new PublicKey(MINT).toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
  log('info', `State PDA: ${statePda.toBase58()}`);

  const info = await conn.getAccountInfo(statePda);
  if (!info) {
    log('error', `State account not found — program may not be deployed yet`);
    process.exit(1);
  }

  const data = info.data;
  const challenge  = data.slice(8, 40).toString('hex');
  const difficulty = data.readBigUInt64LE(40);
  const epoch      = data.readBigUInt64LE(48);

  log('success', `State account found (${data.length} bytes)`);
  log('info', `Challenge : ${challenge}`);
  log('info', `Difficulty: ${difficulty.toString()}`);
  log('info', `Epoch     : ${epoch.toString()}`);
  log('success', 'Contract looks good — you can start mining.');
})().catch(err => {
  log('error', err.message);
  process.exit(1);
});
