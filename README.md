# EQM CLI Miner

GPU-accelerated CLI miner untuk **EQM token** di Solana Mainnet menggunakan **NVIDIA CUDA**.

- **Mint**: `1MhvZzEe8gQ8Rb9CrT3Dn26Gkn9QRErzLMGkkTwveqm`
- **Chain**: Solana Mainnet
- **Hash**: SHA-256 (GPU-accelerated via CUDA)
- **Fallback**: CPU multi-thread (worker_threads)

---

## Peringatan

- Mining memakai Solana mainnet dan butuh SOL untuk transaction fee.
- **Jangan pakai private key wallet utama.** Buat wallet khusus mining.
- Jangan commit file `.env`.
- Verifikasi program ID sendiri di [Solscan](https://solscan.io) sebelum menggunakannya.

---

## Struktur Repo

```
eqm-mine/
├── miner.js          # Entry point utama
├── check-state.js    # Cek on-chain state sebelum mining
├── lib/
│   ├── solana.js     # Fetch challenge + submit nonce via @solana/web3.js
│   ├── cuda-worker.js # Spawn native CUDA binary, parse stdout
│   ├── cpu-worker.js  # CPU fallback (worker_threads)
│   ├── args.js        # CLI arg parser
│   └── logger.js      # Colored console logger
├── native/
│   └── eqm_cuda.cu   # CUDA kernel source (SHA-256, mining loop)
├── scripts/
│   ├── build-cuda.sh  # Build script Linux/Mac
│   └── build-cuda.ps1 # Build script Windows
├── bin/               # Compiled CUDA binary output (gitignored)
├── .env.example
└── package.json
```

---

## Install Cepat

```bash
git clone https://github.com/hadijayyy/eqm-miner
cd eqm-miner
npm install
cp .env.example .env
nano .env
```

Isi minimal di `.env`:

```env
RPC_URL=https://api.mainnet-beta.solana.com
PRIVATE_KEY=YOUR_BASE58_PRIVATE_KEY
PROGRAM_ID=11111111111111111111111111111111
MINER_BACKEND=auto
PRIORITY_FEE_MICRO_LAMPORTS=50000
```

Cek kontrak dulu:

```bash
npm run check
```

Jalankan miner:

```bash
npm start
```

---

## Mode CPU (tanpa GPU)

Tidak perlu CUDA atau driver GPU:

```bash
npm run start:cpu
```

Opsional di `.env`:

```env
CPU_WORKERS=8
CPU_BATCH_SIZE=100000
```

---

## Mode CUDA (GPU NVIDIA)

### 1. Install CUDA Toolkit

Download dari: https://developer.nvidia.com/cuda-downloads

Cek instalasi:

```bash
nvcc --version
nvidia-smi
```

### 2. Build binary

**Ubuntu / Debian:**

```bash
# Install build tools
sudo apt update && sudo apt install -y build-essential

# Build (default sm_75 = RTX 20xx / GTX 16xx)
npm run build:cuda

# Atau tentukan arsitektur GPU kamu:
CUDA_ARCH=sm_86 npm run build:cuda   # RTX 30xx
CUDA_ARCH=sm_89 npm run build:cuda   # RTX 40xx
CUDA_ARCH=sm_61 npm run build:cuda   # GTX 10xx
CUDA_ARCH=sm_100 npm run build:cuda   # RTX 50xx
```

**Windows:**

```powershell
npm run build:cuda:win
```

### 3. Jalankan

```bash
npm run start:cuda
```

---

## Arsitektur CUDA (`CUDA_ARCH`)

| Nilai    | Arsitektur | GPU               |
|----------|------------|-------------------|
| `sm_61`  | Pascal     | GTX 10xx          |
| `sm_70`  | Volta      | V100              |
| `sm_75`  | Turing     | RTX 20xx, GTX 16xx |
| `sm_80`  | Ampere     | A100              |
| `sm_86`  | Ampere     | RTX 30xx          |
| `sm_89`  | Ada        | RTX 40xx          |
| `sm_90`  | Hopper     | H100              |

---

## Opsi CLI

```bash
node miner.js --backend auto
node miner.js --backend cpu --workers 8
node miner.js --backend cuda --gpu-batch 67108864
node miner.js --once        # mine sekali lalu keluar
```

Semua environment variable yang berguna:

```env
MINER_BACKEND=auto
CPU_WORKERS=8
CPU_BATCH_SIZE=100000
GPU_BATCH_SIZE=134217728
CUDA_MINER_BIN=./bin/eqm-cuda
CUDA_ARCH=sm_75
PRIORITY_FEE_MICRO_LAMPORTS=50000
KEEP_MINING=true
```

---

## Error Umum

### `CUDA binary not found`

Build dulu:

```bash
npm run build:cuda
```

### `CUDA binary exited with code 1`

- Cek `nvidia-smi` — pastikan GPU terdeteksi.
- Pastikan `CUDA_ARCH` sesuai GPU kamu.
- Rebuild dengan arsitektur yang benar: `CUDA_ARCH=sm_86 npm run build:cuda`.

### `PROGRAM_ID not set`

Set `PROGRAM_ID` di `.env` dengan address program EQM on-chain.

### `State account not found`

Program belum di-deploy atau `PROGRAM_ID` salah. Verifikasi di [Solscan](https://solscan.io).

### `insufficient lamports` / `Transaction simulation failed`

Wallet tidak punya cukup SOL untuk fee. Top up wallet mining kamu.

### `Transaction expired` / nonce kalah

Epoch/challenge berubah sebelum tx masuk. Naikkan `PRIORITY_FEE_MICRO_LAMPORTS`. Miner akan otomatis refresh challenge dan mining ulang.

---

## Cara Kerja

1. `check-state.js` / `miner.js` fetch challenge (32 byte) dan difficulty (u64) dari state PDA on-chain.
2. Miner cari nonce `n` sehingga: `SHA256(challenge || nonce_le)[0..8] < difficulty`
3. Setelah nonce ketemu, submit ke program via instruksi `mine(nonce)`.
4. Kalau menang: program mint EQM reward ke wallet kamu.
5. Loop ulang untuk challenge berikutnya.

---

## License

MIT
