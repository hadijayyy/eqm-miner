/**
 * eqm_cuda.cu — NVIDIA CUDA kernel for EQM token mining on Solana
 *
 * Hash algorithm: SHA-256
 * Input layout (40 bytes): challenge[32] || nonce[8] (little-endian u64)
 * Win condition: first 8 bytes of SHA-256 output (LE u64) < difficulty
 *
 * Protocol (stdin/stdout):
 *   stdin:  "<challenge_hex_64chars> <difficulty_u64> <batch_size>\n"
 *   stdout: "FOUND <nonce>\n"  or  "EXHAUSTED\n"
 *
 * Build:
 *   nvcc -O3 -arch=sm_75 -o bin/eqm-cuda native/eqm_cuda.cu
 */

#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <cuda_runtime.h>

// ---------- SHA-256 device implementation ----------

__constant__ uint32_t K[64] = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,
  0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
  0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,
  0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,
  0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
  0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,
  0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,
  0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
  0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
};

#define ROTR32(x,n) (((x)>>(n))|((x)<<(32-(n))))
#define CH(e,f,g)   (((e)&(f))^(~(e)&(g)))
#define MAJ(a,b,c)  (((a)&(b))^((a)&(c))^((b)&(c)))
#define EP0(a)      (ROTR32(a,2)^ROTR32(a,13)^ROTR32(a,22))
#define EP1(e)      (ROTR32(e,6)^ROTR32(e,11)^ROTR32(e,25))
#define SIG0(x)     (ROTR32(x,7)^ROTR32(x,18)^((x)>>3))
#define SIG1(x)     (ROTR32(x,17)^ROTR32(x,19)^((x)>>10))

__device__ __forceinline__ void sha256_40(const uint8_t *in, uint32_t *out_words) {
  // Build message schedule for 40-byte input with padding
  // Padded to 64 bytes: input[40] + 0x80 + zeros + length (40*8=320 = 0x140)
  uint32_t w[64];

  // Load first 10 words (40 bytes) big-endian
  for (int i = 0; i < 10; i++) {
    w[i] = ((uint32_t)in[4*i]   << 24)
           | ((uint32_t)in[4*i+1] << 16)
           | ((uint32_t)in[4*i+2] <<  8)
           |  (uint32_t)in[4*i+3];
  }
  // Padding
  w[10] = 0x80000000u;
  for (int i = 11; i < 15; i++) w[i] = 0;
  w[15] = 320;   // bit length of 40 bytes

  for (int i = 16; i < 64; i++)
    w[i] = SIG1(w[i-2]) + w[i-7] + SIG0(w[i-15]) + w[i-16];

  uint32_t a = 0x6a09e667u, b = 0xbb67ae85u, c = 0x3c6ef372u, d = 0xa54ff53au;
  uint32_t e = 0x510e527fu, f = 0x9b05688cu, g = 0x1f83d9abu, h = 0x5be0cd19u;

  for (int i = 0; i < 64; i++) {
    uint32_t t1 = h + EP1(e) + CH(e,f,g) + K[i] + w[i];
    uint32_t t2 = EP0(a) + MAJ(a,b,c);
    h=g; g=f; f=e; e=d+t1;
    d=c; c=b; b=a; a=t1+t2;
  }

  out_words[0] = 0x6a09e667u + a;
  out_words[1] = 0xbb67ae85u + b;
  // Only first 8 bytes needed for comparison, but output 8 words for full hash
  out_words[2] = 0x3c6ef372u + c;
  out_words[3] = 0xa54ff53au + d;
  out_words[4] = 0x510e527fu + e;
  out_words[5] = 0x9b05688cu + f;
  out_words[6] = 0x1f83d9abu + g;
  out_words[7] = 0x5be0cd19u + h;
}

// ---------- Mining kernel ----------

__global__ void mine_kernel(
    const uint8_t * __restrict__ challenge,  // 32 bytes
    uint64_t difficulty,
    uint64_t nonce_base,
    uint64_t batch,
    uint64_t *result_nonce,
    int      *found_flag
) {
  uint64_t idx   = (uint64_t)blockIdx.x * blockDim.x + threadIdx.x;
  uint64_t nonce = nonce_base + idx;
  if (idx >= batch) return;
  if (*found_flag) return;

  // Build 40-byte input: challenge[32] || nonce_le[8]
  uint8_t input[40];
  for (int i = 0; i < 32; i++) input[i] = challenge[i];
  // Write nonce little-endian
  for (int i = 0; i < 8; i++) input[32+i] = (uint8_t)(nonce >> (8*i));

  uint32_t hash[8];
  sha256_40(input, hash);

  // Re-interpret first 8 bytes of hash as LE u64
  // hash[0] is big-endian word; swap to get byte order matching LE read
  uint64_t h0 = ((uint64_t)__byte_perm(hash[0], 0, 0x0123)) |
                (((uint64_t)__byte_perm(hash[1], 0, 0x0123)) << 32);

  if (h0 < difficulty) {
    if (atomicCAS(found_flag, 0, 1) == 0) {
      *result_nonce = nonce;
    }
  }
}

// ---------- Host helpers ----------

static uint8_t hex_nibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return 0;
}

static void hex_to_bytes(const char *hex, uint8_t *out, int len) {
  for (int i = 0; i < len; i++)
    out[i] = (hex_nibble(hex[2*i]) << 4) | hex_nibble(hex[2*i+1]);
}

int main(void) {
  char   challenge_hex[65] = {0};
  uint64_t difficulty = 0;
  uint64_t batch_size = 0;

  if (scanf("%64s %llu %llu", challenge_hex, &difficulty, &batch_size) != 3) {
    fprintf(stderr, "eqm-cuda: bad input\n");
    return 1;
  }

  uint8_t challenge[32];
  hex_to_bytes(challenge_hex, challenge, 32);

  // Allocate device memory
  uint8_t  *d_challenge;
  uint64_t *d_result;
  int      *d_found;

  cudaMalloc(&d_challenge, 32);
  cudaMalloc(&d_result,    sizeof(uint64_t));
  cudaMalloc(&d_found,     sizeof(int));

  cudaMemcpy(d_challenge, challenge, 32, cudaMemcpyHostToDevice);

  int threads = 256;
  uint64_t nonce_base = 0;

  while (1) {
    uint64_t h_found = 0;
    uint64_t h_nonce = 0;
    cudaMemset(d_found,  0, sizeof(int));
    cudaMemset(d_result, 0, sizeof(uint64_t));

    uint64_t blocks = (batch_size + threads - 1) / threads;
    mine_kernel<<<(uint32_t)blocks, threads>>>(
        d_challenge, difficulty, nonce_base, batch_size, d_result, d_found);
    cudaDeviceSynchronize();

    cudaMemcpy(&h_found, d_found,  sizeof(int),      cudaMemcpyDeviceToHost);
    cudaMemcpy(&h_nonce, d_result, sizeof(uint64_t), cudaMemcpyDeviceToHost);

    if (h_found) {
      printf("FOUND %llu\n", (unsigned long long)h_nonce);
      fflush(stdout);
      break;
    }

    nonce_base += batch_size;

    // Signal JS host to refresh challenge after 8 batches with no result
    // (challenge may have advanced on-chain)
    static int iterations = 0;
    if (++iterations >= 8) {
      printf("EXHAUSTED\n");
      fflush(stdout);
      break;
    }
  }

  cudaFree(d_challenge);
  cudaFree(d_result);
  cudaFree(d_found);
  return 0;
}
