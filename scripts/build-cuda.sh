#!/usr/bin/env bash
# scripts/build-cuda.sh — Build the NVIDIA CUDA miner binary for EQM
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
SRC="$ROOT/native/eqm_cuda.cu"
OUT="$ROOT/bin/eqm-cuda"

echo "==> Checking for nvcc..."
if ! command -v nvcc &>/dev/null; then
  echo "ERROR: nvcc not found."
  echo "Install CUDA Toolkit: https://developer.nvidia.com/cuda-downloads"
  exit 1
fi

NVCC_VER=$(nvcc --version | grep "release" | awk '{print $6}' | tr -d ',')
echo "==> nvcc found: $NVCC_VER"

# Detect GPU compute capability (default sm_75 = Turing / RTX 20xx+)
ARCH=${CUDA_ARCH:-sm_75}
echo "==> Target architecture: $ARCH  (override with CUDA_ARCH env var)"

mkdir -p "$ROOT/bin"

echo "==> Compiling $SRC → $OUT"
nvcc -O3 -arch="$ARCH" \
     --ptxas-options=-v \
     -o "$OUT" "$SRC"

echo "==> Build complete: $OUT"
echo ""
echo "Common CUDA_ARCH values:"
echo "  sm_61  Pascal    GTX 10xx"
echo "  sm_70  Volta     V100"
echo "  sm_75  Turing    RTX 20xx / GTX 16xx"
echo "  sm_80  Ampere    A100 / RTX 30xx"
echo "  sm_86  Ampere    RTX 30xx (consumer)"
echo "  sm_89  Ada       RTX 40xx"
echo "  sm_90  Hopper    H100"
echo ""
echo "Run miner with: npm run start:cuda"
