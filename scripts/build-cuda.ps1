# scripts/build-cuda.ps1 — Build CUDA binary on Windows
$ErrorActionPreference = "Stop"

$Root   = Split-Path $PSScriptRoot -Parent
$Src    = Join-Path $Root "native\eqm_cuda.cu"
$OutDir = Join-Path $Root "bin"
$Out    = Join-Path $OutDir "eqm-cuda.exe"

Write-Host "==> Checking for nvcc..." -ForegroundColor Cyan
if (-not (Get-Command nvcc -ErrorAction SilentlyContinue)) {
    Write-Error "nvcc not found. Install CUDA Toolkit: https://developer.nvidia.com/cuda-downloads"
}

$nvccVer = nvcc --version | Select-String "release"
Write-Host "==> $nvccVer" -ForegroundColor Green

$Arch = if ($env:CUDA_ARCH) { $env:CUDA_ARCH } else { "sm_75" }
Write-Host "==> Target architecture: $Arch" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "==> Compiling → $Out" -ForegroundColor Cyan
nvcc -O3 -arch=$Arch --ptxas-options=-v -o $Out $Src

Write-Host ""
Write-Host "==> Build complete: $Out" -ForegroundColor Green
Write-Host "==> Run miner with: npm run start:cuda" -ForegroundColor Green
