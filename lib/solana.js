'use strict';

const { Connection, PublicKey, Keypair, Transaction,
        TransactionInstruction, sendAndConfirmTransaction,
        ComputeBudgetProgram } = require('@solana/web3.js');
const bs58   = require('bs58');
const crypto = require('crypto');
const { log } = require('./logger');

const RPC_URL     = process.env.RPC_URL     || 'https://api.mainnet-beta.solana.com';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const PROGRAM_ID  = process.env.PROGRAM_ID  || '';  // EQM mining program
const MINT        = '1MhvZzEe8gQ8Rb9CrT3Dn26Gkn9QRErzLMGkkTwveqm';
const PRIORITY_FEE_MICRO_LAMPORTS = parseInt(process.env.PRIORITY_FEE_MICRO_LAMPORTS || '50000', 10);

let _connection;
let _keypair;

function getConnection() {
  if (!_connection) {
    _connection = new Connection(RPC_URL, 'confirmed');
  }
  return _connection;
}

function getKeypair() {
  if (!_keypair) {
    if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');
    const raw = PRIVATE_KEY.startsWith('[')
      ? Uint8Array.from(JSON.parse(PRIVATE_KEY))
      : bs58.decode(PRIVATE_KEY);
    _keypair = Keypair.fromSecretKey(raw);
    log('info', `Wallet: ${_keypair.publicKey.toBase58()}`);
  }
  return _keypair;
}

/**
 * Fetches the current mining challenge and difficulty from the EQM on-chain state account.
 * The state layout (bytes):
 *   [0..7]   discriminator / version
 *   [8..39]  challenge (32 bytes)
 *   [40..47] difficulty (u64 le)
 *   [48..55] epoch (u64 le)
 */
async function fetchChallenge() {
  if (!PROGRAM_ID) throw new Error('PROGRAM_ID not set in .env');
  const conn = getConnection();
  const statePda = await deriveStatePda();
  const info = await conn.getAccountInfo(statePda);
  if (!info) throw new Error(`State account ${statePda.toBase58()} not found`);

  const data       = info.data;
  const challenge  = data.slice(8, 40);                     // 32 bytes
  const difficulty = data.readBigUInt64LE(40);              // u64

  return { challenge, difficulty };
}

/**
 * Submits a valid nonce to the EQM mining program.
 * Instruction layout: [0x01 (mine discriminator), nonce (8 bytes le)]
 */
async function submitNonce(nonce) {
  if (!PROGRAM_ID) throw new Error('PROGRAM_ID not set in .env');
  const conn    = getConnection();
  const keypair = getKeypair();
  const statePda = await deriveStatePda();

  const data = Buffer.alloc(9);
  data.writeUInt8(0x01, 0);              // mine instruction
  data.writeBigUInt64LE(BigInt(nonce), 1);

  const ix = new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: keypair.publicKey, isSigner: true,  isWritable: true  },
      { pubkey: statePda,          isSigner: false, isWritable: true  },
      { pubkey: new PublicKey(MINT), isSigner: false, isWritable: true },
    ],
    data,
  });

  const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: PRIORITY_FEE_MICRO_LAMPORTS,
  });

  const tx = new Transaction().add(priorityIx, ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [keypair], {
    commitment: 'confirmed',
  });
  return sig;
}

async function deriveStatePda() {
  const [pda] = await PublicKey.findProgramAddressSync(
    [Buffer.from('state'), new PublicKey(MINT).toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
  return pda;
}

module.exports = { fetchChallenge, submitNonce };
