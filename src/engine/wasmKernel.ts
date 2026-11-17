/**
 * Pure TypeScript WebAssembly Binary Compiler for NawaCore Neural Kernel.
 * Emits a valid, spec-compliant .wasm binary module directly in memory
 * with zero external compiler dependencies.
 *
 * Exports:
 *  - memory: linear memory (32 pages initial = 2 MiB, 256 pages max = 16 MiB)
 *  - matvec_relu(wPtr, xPtr, bPtr, yPtr, rows, cols, relu): i32 (returns FLOPs)
 *  - bench_50m(wPtr, xPtr, vecLen, rounds): f64 (4-way independent accumulators, 8x unrolled)
 */

function encodeU32(val: number): number[] {
  const out: number[] = [];
  let v = val >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return out;
}

function encodeI32(val: number): number[] {
  const out: number[] = [];
  let v = val | 0;
  let more = true;
  while (more) {
    let byte = v & 0x7f;
    v >>= 7;
    if ((v === 0 && (byte & 0x40) === 0) || (v === -1 && (byte & 0x40) !== 0)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    out.push(byte);
  }
  return out;
}

function encodeF32(val: number): number[] {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, val, true);
  return Array.from(new Uint8Array(buf));
}

function encodeStr(str: string): number[] {
  const bytes = new TextEncoder().encode(str);
  return [...encodeU32(bytes.length), ...bytes];
}

function makeSection(id: number, payload: number[]): number[] {
  return [id, ...encodeU32(payload.length), ...payload];
}

// WASM Value Types
const I32 = 0x7f;
const F32 = 0x7d;
const F64 = 0x7c;
const VOID = 0x40;

// WASM Opcodes
const OP = {
  block: 0x02,
  loop: 0x03,
  if: 0x04,
  end: 0x0b,
  br: 0x0c,
  br_if: 0x0d,
  return: 0x0f,
  local_get: 0x20,
  local_set: 0x21,
  local_tee: 0x22,
  f32_load: 0x2a,
  f32_store: 0x38,
  i32_const: 0x41,
  f32_const: 0x43,
  i32_eqz: 0x45,
  i32_lt_s: 0x48,
  i32_ge_s: 0x4e,
  i32_add: 0x6a,
  i32_sub: 0x6b,
  i32_mul: 0x6c,
  f32_add: 0x92,
  f32_mul: 0x94,
  f32_max: 0x97,
  f64_promote_f32: 0xbb,
} as const;

function buildMatvecReluBody(): number[] {
  // Params:
  // 0: wPtr (i32)
  // 1: xPtr (i32)
  // 2: bPtr (i32)
  // 3: yPtr (i32)
  // 4: rows (i32)
  // 5: cols (i32)
  // 6: applyRelu (i32)
  // Locals:
  // 7: i (i32), 8: j (i32), 9: rowWPtr (i32), 10: cols4Limit (i32), 11: elemAddrW (i32), 12: elemAddrX (i32)
  // 13: sum (f32)
  const locals = [
    ...encodeU32(2), // 2 local groups
    ...encodeU32(6), I32, // 6 x i32 (indices 7..12)
    ...encodeU32(1), F32, // 1 x f32 (index 13)
  ];

  const code: number[] = [
    // cols4Limit = cols - 4
    OP.local_get, 5,
    OP.i32_const, ...encodeI32(4),
    OP.i32_sub,
    OP.local_set, 10,

    // i = 0
    OP.i32_const, ...encodeI32(0),
    OP.local_set, 7,

    // block $outer_break
    OP.block, VOID,
      // loop $outer_loop
      OP.loop, VOID,
        // if i >= rows break
        OP.local_get, 7,
        OP.local_get, 4,
        OP.i32_ge_s,
        OP.br_if, 1,

        // sum = f32.load(bPtr + i * 4)
        OP.local_get, 2,
        OP.local_get, 7,
        OP.i32_const, ...encodeI32(4),
        OP.i32_mul,
        OP.i32_add,
        OP.f32_load, 0x02, 0x00,
        OP.local_set, 13,

        // rowWPtr = wPtr + (i * cols) * 4
        OP.local_get, 0,
        OP.local_get, 7,
        OP.local_get, 5,
        OP.i32_mul,
        OP.i32_const, ...encodeI32(4),
        OP.i32_mul,
        OP.i32_add,
        OP.local_set, 9,

        // j = 0
        OP.i32_const, ...encodeI32(0),
        OP.local_set, 8,

        // 4x unrolled inner loop
        OP.block, VOID,
          OP.loop, VOID,
            // if j >= cols4Limit + 1 (i.e. j > cols - 4 -> cols - 4 < j -> wait: if j >= cols - 3)
            // safer: if (j + 4) > cols, break -> i.e., if (cols4Limit < j) break
            OP.local_get, 10,
            OP.local_get, 8,
            OP.i32_lt_s,
            OP.br_if, 1,

            // elemAddrW = rowWPtr + j * 4
            OP.local_get, 9,
            OP.local_get, 8,
            OP.i32_const, ...encodeI32(4),
            OP.i32_mul,
            OP.i32_add,
            OP.local_set, 11,

            // elemAddrX = xPtr + j * 4
            OP.local_get, 1,
            OP.local_get, 8,
            OP.i32_const, ...encodeI32(4),
            OP.i32_mul,
            OP.i32_add,
            OP.local_set, 12,

            // sum += w[0]*x[0] + w[1]*x[1] + w[2]*x[2] + w[3]*x[3]
            OP.local_get, 13,
            OP.local_get, 11, OP.f32_load, 0x02, 0x00,
            OP.local_get, 12, OP.f32_load, 0x02, 0x00,
            OP.f32_mul,
            OP.f32_add,

            OP.local_get, 11, OP.f32_load, 0x02, 0x04,
            OP.local_get, 12, OP.f32_load, 0x02, 0x04,
            OP.f32_mul,
            OP.f32_add,

            OP.local_get, 11, OP.f32_load, 0x02, 0x08,
            OP.local_get, 12, OP.f32_load, 0x02, 0x08,
            OP.f32_mul,
            OP.f32_add,

            OP.local_get, 11, OP.f32_load, 0x02, 0x0c,
            OP.local_get, 12, OP.f32_load, 0x02, 0x0c,
            OP.f32_mul,
            OP.f32_add,

            OP.local_set, 13,

            // j += 4
            OP.local_get, 8,
            OP.i32_const, ...encodeI32(4),
            OP.i32_add,
            OP.local_set, 8,
            OP.br, 0,
          OP.end,
        OP.end,

        // Tail scalar loop for remaining elements
        OP.block, VOID,
          OP.loop, VOID,
            OP.local_get, 8,
            OP.local_get, 5,
            OP.i32_ge_s,
            OP.br_if, 1,

            OP.local_get, 13,
            OP.local_get, 9,
            OP.local_get, 8,
            OP.i32_const, ...encodeI32(4),
            OP.i32_mul,
            OP.i32_add,
            OP.f32_load, 0x02, 0x00,

            OP.local_get, 1,
            OP.local_get, 8,
            OP.i32_const, ...encodeI32(4),
            OP.i32_mul,
            OP.i32_add,
            OP.f32_load, 0x02, 0x00,

            OP.f32_mul,
            OP.f32_add,
            OP.local_set, 13,

            OP.local_get, 8,
            OP.i32_const, ...encodeI32(1),
            OP.i32_add,
            OP.local_set, 8,
            OP.br, 0,
          OP.end,
        OP.end,

        // if applyRelu != 0 -> sum = f32.max(sum, 0.0)
        OP.local_get, 6,
        OP.i32_eqz,
        OP.if, VOID,
        0x05, // else
          OP.local_get, 13,
          OP.f32_const, ...encodeF32(0),
          OP.f32_max,
          OP.local_set, 13,
        OP.end,

        // y[i] = sum
        OP.local_get, 3,
        OP.local_get, 7,
        OP.i32_const, ...encodeI32(4),
        OP.i32_mul,
        OP.i32_add,
        OP.local_get, 13,
        OP.f32_store, 0x02, 0x00,

        // i += 1
        OP.local_get, 7,
        OP.i32_const, ...encodeI32(1),
        OP.i32_add,
        OP.local_set, 7,
        OP.br, 0,
      OP.end,
    OP.end,

    // return rows * cols * 2 + rows
    OP.local_get, 4,
    OP.local_get, 5,
    OP.i32_mul,
    OP.i32_const, ...encodeI32(2),
    OP.i32_mul,
    OP.local_get, 4,
    OP.i32_add,
    OP.end,
  ];

  const body = [...locals, ...code];
  return [...encodeU32(body.length), ...body];
}

function buildBench50mBody(): number[] {
  // Params:
  // 0: wPtr (i32)
  // 1: xPtr (i32)
  // 2: vecLen (i32) - must be multiple of 8
  // 3: rounds (i32)
  // Locals:
  // 4: r (i32), 5: i (i32), 6: byteLimit (i32), 7: curW (i32), 8: curX (i32)
  // 9: acc0 (f32), 10: acc1 (f32), 11: acc2 (f32), 12: acc3 (f32)
  const locals = [
    ...encodeU32(2),
    ...encodeU32(5), I32, // 4..8
    ...encodeU32(4), F32, // 9..12
  ];

  const code: number[] = [
    // acc0..acc3 = 0.0f
    OP.f32_const, ...encodeF32(0), OP.local_set, 9,
    OP.f32_const, ...encodeF32(0), OP.local_set, 10,
    OP.f32_const, ...encodeF32(0), OP.local_set, 11,
    OP.f32_const, ...encodeF32(0), OP.local_set, 12,

    // byteLimit = vecLen * 4
    OP.local_get, 2,
    OP.i32_const, ...encodeI32(4),
    OP.i32_mul,
    OP.local_set, 6,

    // r = 0
    OP.i32_const, ...encodeI32(0),
    OP.local_set, 4,

    OP.block, VOID,
      OP.loop, VOID,
        OP.local_get, 4,
        OP.local_get, 3,
        OP.i32_ge_s,
        OP.br_if, 1,

        // i = 0
        OP.i32_const, ...encodeI32(0),
        OP.local_set, 5,

        OP.block, VOID,
          OP.loop, VOID,
            // if i >= byteLimit break
            OP.local_get, 5,
            OP.local_get, 6,
            OP.i32_ge_s,
            OP.br_if, 1,

            // curW = wPtr + i
            OP.local_get, 0,
            OP.local_get, 5,
            OP.i32_add,
            OP.local_set, 7,

            // curX = xPtr + i
            OP.local_get, 1,
            OP.local_get, 5,
            OP.i32_add,
            OP.local_set, 8,

            // 8 elements = 32 bytes per iteration -> 4 independent accumulators (2x each = 16 FLOPs)
            // acc0 += w[0]*x[0] + w[4]*x[4]
            OP.local_get, 9,
            OP.local_get, 7, OP.f32_load, 0x02, 0x00,
            OP.local_get, 8, OP.f32_load, 0x02, 0x00,
            OP.f32_mul,
            OP.f32_add,
            OP.local_get, 7, OP.f32_load, 0x02, 0x10,
            OP.local_get, 8, OP.f32_load, 0x02, 0x10,
            OP.f32_mul,
            OP.f32_add,
            OP.local_set, 9,

            // acc1 += w[1]*x[1] + w[5]*x[5]
            OP.local_get, 10,
            OP.local_get, 7, OP.f32_load, 0x02, 0x04,
            OP.local_get, 8, OP.f32_load, 0x02, 0x04,
            OP.f32_mul,
            OP.f32_add,
            OP.local_get, 7, OP.f32_load, 0x02, 0x14,
            OP.local_get, 8, OP.f32_load, 0x02, 0x14,
            OP.f32_mul,
            OP.f32_add,
            OP.local_set, 10,

            // acc2 += w[2]*x[2] + w[6]*x[6]
            OP.local_get, 11,
            OP.local_get, 7, OP.f32_load, 0x02, 0x08,
            OP.local_get, 8, OP.f32_load, 0x02, 0x08,
            OP.f32_mul,
            OP.f32_add,
            OP.local_get, 7, OP.f32_load, 0x02, 0x18,
            OP.local_get, 8, OP.f32_load, 0x02, 0x18,
            OP.f32_mul,
            OP.f32_add,
            OP.local_set, 11,

            // acc3 += w[3]*x[3] + w[7]*x[7]
            OP.local_get, 12,
            OP.local_get, 7, OP.f32_load, 0x02, 0x0c,
            OP.local_get, 8, OP.f32_load, 0x02, 0x0c,
            OP.f32_mul,
            OP.f32_add,
            OP.local_get, 7, OP.f32_load, 0x02, 0x1c,
            OP.local_get, 8, OP.f32_load, 0x02, 0x1c,
            OP.f32_mul,
            OP.f32_add,
            OP.local_set, 12,

            // i += 32
            OP.local_get, 5,
            OP.i32_const, ...encodeI32(32),
            OP.i32_add,
            OP.local_set, 5,
            OP.br, 0,
          OP.end,
        OP.end,

        // r += 1
        OP.local_get, 4,
        OP.i32_const, ...encodeI32(1),
        OP.i32_add,
        OP.local_set, 4,
        OP.br, 0,
      OP.end,
    OP.end,

    // return f64(acc0 + acc1 + acc2 + acc3)
    OP.local_get, 9,
    OP.local_get, 10,
    OP.f32_add,
    OP.local_get, 11,
    OP.f32_add,
    OP.local_get, 12,
    OP.f32_add,
    OP.f64_promote_f32,
    OP.end,
  ];

  const body = [...locals, ...code];
  return [...encodeU32(body.length), ...body];
}

export function compileNawaWasmBinary(): Uint8Array {
  const magicAndVersion = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

  // Type section:
  // 0: (i32, i32, i32, i32, i32, i32, i32) -> i32
  // 1: (i32, i32, i32, i32) -> f64
  const typeSection = makeSection(1, [
    ...encodeU32(2),
    0x60, ...encodeU32(7), I32, I32, I32, I32, I32, I32, I32, ...encodeU32(1), I32,
    0x60, ...encodeU32(4), I32, I32, I32, I32, ...encodeU32(1), F64,
  ]);

  // Function section: func 0 -> type 0, func 1 -> type 1
  const funcSection = makeSection(3, [
    ...encodeU32(2),
    ...encodeU32(0),
    ...encodeU32(1),
  ]);

  // Memory section: 1 memory, min 32 pages (2 MiB), max 256 pages (16 MiB)
  const memorySection = makeSection(5, [
    ...encodeU32(1),
    0x01, ...encodeU32(32), ...encodeU32(256),
  ]);

  // Export section: memory, matvec_relu, bench_50m
  const exportSection = makeSection(7, [
    ...encodeU32(3),
    ...encodeStr("memory"), 0x02, ...encodeU32(0),
    ...encodeStr("matvec_relu"), 0x00, ...encodeU32(0),
    ...encodeStr("bench_50m"), 0x00, ...encodeU32(1),
  ]);

  // Code section
  const codeSection = makeSection(10, [
    ...encodeU32(2),
    ...buildMatvecReluBody(),
    ...buildBench50mBody(),
  ]);

  return new Uint8Array([
    ...magicAndVersion,
    ...typeSection,
    ...funcSection,
    ...memorySection,
    ...exportSection,
    ...codeSection,
  ]);
}

export interface WasmKernelInstance {
  wasmBytes: Uint8Array;
  memory: WebAssembly.Memory;
  matvecRelu: (
    wPtr: number,
    xPtr: number,
    bPtr: number,
    yPtr: number,
    rows: number,
    cols: number,
    applyRelu: number
  ) => number;
  bench50m: (wPtr: number, xPtr: number, vecLen: number, rounds: number) => number;
  runBenchmark: (targetOps?: number) => BenchmarkResult;
}

export interface BenchmarkResult {
  totalOps: number;
  elapsedMs: number;
  opsPerSecond: number;
  checksum: number;
  vecLen: number;
  rounds: number;
  wasmSizeBytes: number;
  target50MReached: boolean;
  speedupVs50M: number;
}

let cachedPromise: Promise<WasmKernelInstance> | null = null;

export async function getWasmKernel(): Promise<WasmKernelInstance> {
  if (cachedPromise) return cachedPromise;
  cachedPromise = (async () => {
    const wasmBytes = compileNawaWasmBinary();
    const copy = new Uint8Array(wasmBytes.byteLength);
    copy.set(wasmBytes);
    const { instance } = await WebAssembly.instantiate(copy.buffer);
    const exports = instance.exports as {
      memory: WebAssembly.Memory;
      matvec_relu: (
        wPtr: number,
        xPtr: number,
        bPtr: number,
        yPtr: number,
        rows: number,
        cols: number,
        applyRelu: number
      ) => number;
      bench_50m: (wPtr: number, xPtr: number, vecLen: number, rounds: number) => number;
    };

    const runBenchmark = (targetOps = 50_000_000): BenchmarkResult => {
      // Reserve scratch space at offset 1048576 (1 MiB) so model weights + activations at 0..600KiB remain untouched
      const vecLen = 65536; // 65,536 float32 = 256 KiB (L2-resident)
      const wPtr = 1048576;
      const xPtr = wPtr + vecLen * 4;
      const f32View = new Float32Array(exports.memory.buffer);
      const wBase = wPtr >>> 2;
      const xBase = xPtr >>> 2;

      for (let i = 0; i < vecLen; i++) {
        f32View[wBase + i] = ((i % 97) - 48) * 0.015625;
        f32View[xBase + i] = ((i % 61) - 30) * 0.03125;
      }

      // Warm up JIT/TurboFan briefly (1M ops)
      exports.bench_50m(wPtr, xPtr, vecLen, 8);

      const opsPerRound = vecLen * 2; // 1 mul + 1 add per element
      const rounds = Math.max(1, Math.ceil(targetOps / opsPerRound));
      const totalOps = rounds * opsPerRound;

      const t0 = performance.now();
      const checksum = exports.bench_50m(wPtr, xPtr, vecLen, rounds);
      const t1 = performance.now();

      const elapsedMs = Math.max(0.05, t1 - t0);
      const opsPerSecond = Math.round((totalOps / elapsedMs) * 1000);

      return {
        totalOps,
        elapsedMs: Number(elapsedMs.toFixed(3)),
        opsPerSecond,
        checksum: Number(checksum.toFixed(4)),
        vecLen,
        rounds,
        wasmSizeBytes: wasmBytes.byteLength,
        target50MReached: opsPerSecond >= 50_000_000,
        speedupVs50M: Number((opsPerSecond / 50_000_000).toFixed(2)),
      };
    };

    return {
      wasmBytes,
      memory: exports.memory,
      matvecRelu: exports.matvec_relu,
      bench50m: exports.bench_50m,
      runBenchmark,
    };
  })();
  return cachedPromise;
}
