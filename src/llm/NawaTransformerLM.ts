import fs from "node:fs";
import path from "node:path";
import { NAWA_TRAINING_CORPUS, type TrainingDialoguePair } from "./nawaCorpus.ts";

export interface TokenizerState {
  vocab: string[];
  merges: Array<[string, string]>;
}

export class NawaBpeTokenizer {
  vocab: string[];
  tokenToId: Map<string, number>;
  merges: Array<[string, string]>;
  mergeRanks: Map<string, number>;

  static readonly PAD_ID = 0;
  static readonly BOS_ID = 1;
  static readonly EOS_ID = 2;
  static readonly USR_ID = 3;
  static readonly AST_ID = 4;
  static readonly SYS_ID = 5;
  static readonly NL_ID = 6;

  static readonly SPECIAL_TOKENS = [
    "<PAD>",
    "<BOS>",
    "<EOS>",
    "<USR>",
    "<AST>",
    "<SYS>",
    "<NL>",
  ];

  constructor(state?: TokenizerState) {
    if (state) {
      this.vocab = [...state.vocab];
      this.merges = state.merges.map(([a, b]) => [a, b]);
    } else {
      this.vocab = [...NawaBpeTokenizer.SPECIAL_TOKENS];
      this.merges = [];
    }
    this.tokenToId = new Map();
    this.mergeRanks = new Map();
    this.rebuildMaps();
  }

  private rebuildMaps(): void {
    this.tokenToId.clear();
    for (let i = 0; i < this.vocab.length; i++) {
      this.tokenToId.set(this.vocab[i], i);
    }
    this.mergeRanks.clear();
    for (let i = 0; i < this.merges.length; i++) {
      this.mergeRanks.set(this.merges[i][0] + "\u0001" + this.merges[i][1], i);
    }
  }

  get vocabSize(): number {
    return this.vocab.length;
  }

  private preTokenize(text: string): string[] {
    const normalized = text.replace(/\r\n/g, "\n");
    const chunks: string[] = [];
    const lines = normalized.split("\n");
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const parts = line.match(/\s+|[^\s\w\u0600-\u06FF]+|[\w\u0600-\u06FF]+/g) || [];
      let pendingSpace = false;
      for (const p of parts) {
        if (/^\s+$/.test(p)) {
          pendingSpace = true;
        } else {
          chunks.push((pendingSpace ? "▁" : "") + p);
          pendingSpace = false;
        }
      }
      if (li < lines.length - 1) {
        chunks.push("<NL>");
      }
    }
    return chunks;
  }

  train(corpusTexts: string[], targetVocabSize = 768): void {
    this.vocab = [...NawaBpeTokenizer.SPECIAL_TOKENS];
    this.merges = [];
    const charSet = new Set<string>();
    const wordFreq = new Map<string, number>();

    for (const text of corpusTexts) {
      for (const word of this.preTokenize(text)) {
        if (word === "<NL>") continue;
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        for (const ch of word) {
          charSet.add(ch);
        }
      }
    }

    // Add ASCII/Arabic basics so unseen text can always be encoded cleanly
    const extraChars =
      "ابتثجحخدذرزسشصضطظعغفقكلمنهويىةأإآؤئءabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?()-_+*/=<>{}[]'\"`▁ ";
    for (const ch of extraChars) charSet.add(ch);

    for (const ch of Array.from(charSet).sort()) {
      if (!this.vocab.includes(ch)) this.vocab.push(ch);
    }

    // Split words into symbol arrays
    let splits = new Map<string, { syms: string[]; freq: number }>();
    for (const [word, freq] of wordFreq.entries()) {
      splits.set(word, { syms: Array.from(word), freq });
    }

    while (this.vocab.length < targetVocabSize) {
      const pairCounts = new Map<string, number>();
      for (const { syms, freq } of splits.values()) {
        for (let i = 0; i < syms.length - 1; i++) {
          const key = syms[i] + "\u0001" + syms[i + 1];
          pairCounts.set(key, (pairCounts.get(key) || 0) + freq);
        }
      }
      if (pairCounts.size === 0) break;

      let bestKey = "";
      let bestCount = 1; // require at least 2 occurrences
      for (const [k, c] of pairCounts.entries()) {
        if (c > bestCount) {
          bestCount = c;
          bestKey = k;
        }
      }
      if (!bestKey) break;

      const [a, b] = bestKey.split("\u0001");
      const merged = a + b;
      this.merges.push([a, b]);
      if (!this.vocab.includes(merged)) {
        this.vocab.push(merged);
      }

      // Apply merge across splits
      const nextSplits = new Map<string, { syms: string[]; freq: number }>();
      for (const [word, entry] of splits.entries()) {
        const syms = entry.syms;
        const updated: string[] = [];
        let i = 0;
        while (i < syms.length) {
          if (i < syms.length - 1 && syms[i] === a && syms[i + 1] === b) {
            updated.push(merged);
            i += 2;
          } else {
            updated.push(syms[i]);
            i += 1;
          }
        }
        nextSplits.set(word, { syms: updated, freq: entry.freq });
      }
      splits = nextSplits;
    }

    this.rebuildMaps();
  }

  private bpeWord(word: string): string[] {
    if (word === "<NL>") return ["<NL>"];
    let syms = Array.from(word);
    if (syms.length <= 1) return syms;

    while (syms.length > 1) {
      let bestRank = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < syms.length - 1; i++) {
        const rank = this.mergeRanks.get(syms[i] + "\u0001" + syms[i + 1]);
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;
      const merged = syms[bestIdx] + syms[bestIdx + 1];
      syms = [...syms.slice(0, bestIdx), merged, ...syms.slice(bestIdx + 2)];
    }
    return syms;
  }

  encode(text: string): number[] {
    const ids: number[] = [];
    for (const word of this.preTokenize(text)) {
      for (const tok of this.bpeWord(word)) {
        const id = this.tokenToId.get(tok);
        if (id !== undefined) {
          ids.push(id);
        } else {
          // UTF-safe single character fallback
          for (const ch of tok) {
            const cid = this.tokenToId.get(ch);
            if (cid !== undefined) ids.push(cid);
          }
        }
      }
    }
    return ids;
  }

  decode(ids: number[]): string {
    const pieces: string[] = [];
    for (const id of ids) {
      if (
        id === NawaBpeTokenizer.PAD_ID ||
        id === NawaBpeTokenizer.BOS_ID ||
        id === NawaBpeTokenizer.EOS_ID ||
        id === NawaBpeTokenizer.USR_ID ||
        id === NawaBpeTokenizer.AST_ID ||
        id === NawaBpeTokenizer.SYS_ID
      ) {
        continue;
      }
      if (id === NawaBpeTokenizer.NL_ID) {
        pieces.push("\n");
        continue;
      }
      const tok = this.vocab[id] || "";
      pieces.push(tok.replace(/▁/g, " "));
    }
    return pieces.join("").replace(/^\s+/, "");
  }

  tokenLabel(id: number): string {
    return this.vocab[id] ?? `<#${id}>`;
  }

  serialize(): TokenizerState {
    return { vocab: this.vocab, merges: this.merges };
  }
}

export interface TransformerConfig {
  vocabSize: number;
  dModel: number;
  nLayers: number;
  nHeads: number;
  dFF: number;
  maxSeqLen: number;
}

export interface TrainingLossPoint {
  epoch: number;
  loss: number;
  perplexity: number;
  elapsedMs: number;
}

export interface TokenCandidate {
  tokenId: number;
  token: string;
  prob: number;
}

export interface NeuralGenerationResult {
  text: string;
  generatedTokens: number;
  promptTokens: number;
  inferenceMs: number;
  tokensPerSec: number;
  perplexityEstimate: number;
  topStepCandidates: Array<{ chosen: string; chosenProb: number; alternatives: TokenCandidate[] }>;
  kvCompression: {
    enabled: boolean;
    activeKvSlots: number;
    compressedKvSlots: number;
    savedRatioPct: number;
  };
}

interface LayerWeights {
  ln1G: Float32Array;
  ln1B: Float32Array;
  wq: Float32Array;
  wk: Float32Array;
  wv: Float32Array;
  wo: Float32Array;
  ln2G: Float32Array;
  ln2B: Float32Array;
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
}

function createRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randn(rng: () => number, std: number): number {
  const u1 = Math.max(1e-7, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * std;
}

function gelu(x: number): number {
  const c = 0.7978845608028654; // sqrt(2/pi)
  const t = Math.tanh(c * (x + 0.044715 * x * x * x));
  return 0.5 * x * (1 + t);
}

function geluDeriv(x: number): number {
  const c = 0.7978845608028654;
  const x3 = x * x * x;
  const inner = c * (x + 0.044715 * x3);
  const th = Math.tanh(inner);
  const sech2 = 1 - th * th;
  return 0.5 * (1 + th) + 0.5 * x * sech2 * c * (1 + 3 * 0.044715 * x * x);
}

export class NawaTransformerLM {
  config: TransformerConfig;
  tokenizer: NawaBpeTokenizer;
  tokEmb: Float32Array;
  posEmb: Float32Array;
  layers: LayerWeights[];
  lnFG: Float32Array;
  lnFB: Float32Array;
  lmBias: Float32Array;

  // AdamW state aligned with flat parameter list
  private adamM: Float32Array[];
  private adamV: Float32Array[];
  private adamStep = 0;

  trainedEpochs = 0;
  lossHistory: TrainingLossPoint[] = [];
  corpusSequences: string[] = [];

  constructor(tokenizer: NawaBpeTokenizer, config?: Partial<TransformerConfig>) {
    this.tokenizer = tokenizer;
    const dModel = config?.dModel ?? 64;
    const nLayers = config?.nLayers ?? 2;
    const nHeads = config?.nHeads ?? 4;
    const dFF = config?.dFF ?? 160;
    const maxSeqLen = config?.maxSeqLen ?? 112;
    const vocabSize = config?.vocabSize ?? tokenizer.vocabSize;

    this.config = { vocabSize, dModel, nLayers, nHeads, dFF, maxSeqLen };

    const rng = createRng(20261116);
    const std = 0.04;
    const projStd = std / Math.sqrt(2 * nLayers);

    this.tokEmb = new Float32Array(vocabSize * dModel);
    for (let i = 0; i < this.tokEmb.length; i++) this.tokEmb[i] = randn(rng, std);

    this.posEmb = new Float32Array(maxSeqLen * dModel);
    for (let i = 0; i < this.posEmb.length; i++) this.posEmb[i] = randn(rng, std);

    this.layers = [];
    for (let l = 0; l < nLayers; l++) {
      const ln1G = new Float32Array(dModel).fill(1);
      const ln1B = new Float32Array(dModel);
      const wq = new Float32Array(dModel * dModel);
      const wk = new Float32Array(dModel * dModel);
      const wv = new Float32Array(dModel * dModel);
      const wo = new Float32Array(dModel * dModel);
      for (let i = 0; i < dModel * dModel; i++) {
        wq[i] = randn(rng, std);
        wk[i] = randn(rng, std);
        wv[i] = randn(rng, std);
        wo[i] = randn(rng, projStd);
      }
      const ln2G = new Float32Array(dModel).fill(1);
      const ln2B = new Float32Array(dModel);
      const w1 = new Float32Array(dModel * dFF);
      const b1 = new Float32Array(dFF);
      const w2 = new Float32Array(dFF * dModel);
      const b2 = new Float32Array(dModel);
      for (let i = 0; i < w1.length; i++) w1[i] = randn(rng, std);
      for (let i = 0; i < w2.length; i++) w2[i] = randn(rng, projStd);
      this.layers.push({ ln1G, ln1B, wq, wk, wv, wo, ln2G, ln2B, w1, b1, w2, b2 });
    }

    this.lnFG = new Float32Array(dModel).fill(1);
    this.lnFB = new Float32Array(dModel);
    this.lmBias = new Float32Array(vocabSize);

    const params = this.allParamArrays();
    this.adamM = params.map((p) => new Float32Array(p.length));
    this.adamV = params.map((p) => new Float32Array(p.length));
  }

  private allParamArrays(): Float32Array[] {
    const list: Float32Array[] = [this.tokEmb, this.posEmb];
    for (const l of this.layers) {
      list.push(l.ln1G, l.ln1B, l.wq, l.wk, l.wv, l.wo, l.ln2G, l.ln2B, l.w1, l.b1, l.w2, l.b2);
    }
    list.push(this.lnFG, this.lnFB, this.lmBias);
    return list;
  }

  get totalParams(): number {
    return this.allParamArrays().reduce((acc, a) => acc + a.length, 0);
  }

  private layerNormForward(
    x: Float32Array,
    T: number,
    D: number,
    g: Float32Array,
    b: Float32Array
  ): { out: Float32Array; mean: Float32Array; invStd: Float32Array; xHat: Float32Array } {
    const out = new Float32Array(T * D);
    const xHat = new Float32Array(T * D);
    const mean = new Float32Array(T);
    const invStd = new Float32Array(T);
    const eps = 1e-5;

    for (let t = 0; t < T; t++) {
      const off = t * D;
      let m = 0;
      for (let d = 0; d < D; d++) m += x[off + d];
      m /= D;
      mean[t] = m;

      let v = 0;
      for (let d = 0; d < D; d++) {
        const diff = x[off + d] - m;
        v += diff * diff;
      }
      const is = 1 / Math.sqrt(v / D + eps);
      invStd[t] = is;

      for (let d = 0; d < D; d++) {
        const xh = (x[off + d] - m) * is;
        xHat[off + d] = xh;
        out[off + d] = xh * g[d] + b[d];
      }
    }
    return { out, mean, invStd, xHat };
  }

  private layerNormBackward(
    dOut: Float32Array,
    xHat: Float32Array,
    invStd: Float32Array,
    g: Float32Array,
    dG: Float32Array,
    dB: Float32Array,
    T: number,
    D: number
  ): Float32Array {
    const dX = new Float32Array(T * D);
    for (let t = 0; t < T; t++) {
      const off = t * D;
      const is = invStd[t];
      let sumDyG = 0;
      let sumDyGXhat = 0;
      for (let d = 0; d < D; d++) {
        const dy = dOut[off + d];
        const xh = xHat[off + d];
        dG[d] += dy * xh;
        dB[d] += dy;
        const dyg = dy * g[d];
        sumDyG += dyg;
        sumDyGXhat += dyg * xh;
      }
      for (let d = 0; d < D; d++) {
        const dyg = dOut[off + d] * g[d];
        dX[off + d] = (is / D) * (D * dyg - sumDyG - xHat[off + d] * sumDyGXhat);
      }
    }
    return dX;
  }

  /**
   * Computes forward + analytical backward pass for one sequence and accumulates gradients into `grads`.
   */
  private accumulateSequenceGradients(
    tokenIds: number[],
    lossStartIdx: number,
    grads: Float32Array[]
  ): { loss: number; tokensPredicted: number } {
    const { vocabSize: V, dModel: D, nLayers: L, nHeads: H, dFF, maxSeqLen } = this.config;
    const headDim = D / H;
    const seqLen = Math.min(tokenIds.length - 1, maxSeqLen);
    if (seqLen < 2) return { loss: 0, tokensPredicted: 0 };

    const T = seqLen;
    const inputs = tokenIds.slice(0, T);
    const targets = tokenIds.slice(1, T + 1);

    const x0 = new Float32Array(T * D);
    for (let t = 0; t < T; t++) {
      const tokOff = inputs[t] * D;
      const posOff = t * D;
      const outOff = t * D;
      for (let d = 0; d < D; d++) {
        x0[outOff + d] = this.tokEmb[tokOff + d] + this.posEmb[posOff + d];
      }
    }

    interface LayerCache {
      xIn: Float32Array;
      ln1: { out: Float32Array; invStd: Float32Array; xHat: Float32Array };
      q: Float32Array;
      k: Float32Array;
      v: Float32Array;
      attnProbs: Float32Array;
      attnOut: Float32Array;
      xMid: Float32Array;
      ln2: { out: Float32Array; invStd: Float32Array; xHat: Float32Array };
      ff1Pre: Float32Array;
      ff1Act: Float32Array;
    }

    const caches: LayerCache[] = [];
    let curX = x0;
    const scale = 1 / Math.sqrt(headDim);
    const scoresBuf = new Float32Array(T);
    const dPBuf = new Float32Array(T);

    for (let l = 0; l < L; l++) {
      const w = this.layers[l];
      const ln1 = this.layerNormForward(curX, T, D, w.ln1G, w.ln1B);
      const q = new Float32Array(T * D);
      const k = new Float32Array(T * D);
      const v = new Float32Array(T * D);

      for (let t = 0; t < T; t++) {
        const xOff = t * D;
        for (let o = 0; o < D; o++) {
          let sq = 0;
          let sk = 0;
          let sv = 0;
          const wRow = o * D;
          for (let i = 0; i < D; i++) {
            const xv = ln1.out[xOff + i];
            sq += w.wq[wRow + i] * xv;
            sk += w.wk[wRow + i] * xv;
            sv += w.wv[wRow + i] * xv;
          }
          q[xOff + o] = sq;
          k[xOff + o] = sk;
          v[xOff + o] = sv;
        }
      }

      const attnProbs = new Float32Array(H * T * T);
      const attnOut = new Float32Array(T * D);

      for (let h = 0; h < H; h++) {
        const hOff = h * headDim;
        const pBase = h * T * T;
        for (let tq = 0; tq < T; tq++) {
          const qBase = tq * D + hOff;
          let maxS = -1e9;
          for (let tk = 0; tk <= tq; tk++) {
            const kBase = tk * D + hOff;
            let dot = 0;
            for (let hd = 0; hd < headDim; hd++) {
              dot += q[qBase + hd] * k[kBase + hd];
            }
            const s = dot * scale;
            scoresBuf[tk] = s;
            if (s > maxS) maxS = s;
          }
          let sumExp = 0;
          for (let tk = 0; tk <= tq; tk++) {
            const e = Math.exp(scoresBuf[tk] - maxS);
            scoresBuf[tk] = e;
            sumExp += e;
          }
          const invSum = 1 / sumExp;
          const rowP = pBase + tq * T;
          for (let tk = 0; tk <= tq; tk++) {
            const p = scoresBuf[tk] * invSum;
            attnProbs[rowP + tk] = p;
            const vBase = tk * D + hOff;
            const oBase = tq * D + hOff;
            for (let hd = 0; hd < headDim; hd++) {
              attnOut[oBase + hd] += p * v[vBase + hd];
            }
          }
        }
      }

      const xMid = new Float32Array(T * D);
      for (let t = 0; t < T; t++) {
        const off = t * D;
        for (let o = 0; o < D; o++) {
          let sum = 0;
          const wRow = o * D;
          for (let i = 0; i < D; i++) {
            sum += w.wo[wRow + i] * attnOut[off + i];
          }
          xMid[off + o] = curX[off + o] + sum;
        }
      }

      const ln2 = this.layerNormForward(xMid, T, D, w.ln2G, w.ln2B);
      const ff1Pre = new Float32Array(T * dFF);
      const ff1Act = new Float32Array(T * dFF);
      for (let t = 0; t < T; t++) {
        const inOff = t * D;
        const hOff = t * dFF;
        for (let m = 0; m < dFF; m++) {
          let s = w.b1[m];
          const wRow = m * D;
          for (let i = 0; i < D; i++) {
            s += w.w1[wRow + i] * ln2.out[inOff + i];
          }
          ff1Pre[hOff + m] = s;
          ff1Act[hOff + m] = gelu(s);
        }
      }

      const xNext = new Float32Array(T * D);
      for (let t = 0; t < T; t++) {
        const off = t * D;
        const hOff = t * dFF;
        for (let o = 0; o < D; o++) {
          let s = w.b2[o];
          const wRow = o * dFF;
          for (let m = 0; m < dFF; m++) {
            s += w.w2[wRow + m] * ff1Act[hOff + m];
          }
          xNext[off + o] = xMid[off + o] + s;
        }
      }

      caches.push({ xIn: curX, ln1, q, k, v, attnProbs, attnOut, xMid, ln2, ff1Pre, ff1Act });
      curX = xNext;
    }

    const lnF = this.layerNormForward(curX, T, D, this.lnFG, this.lnFB);
    const dLnFOut = new Float32Array(T * D);
    const gTokEmb = grads[0];
    const gPosEmb = grads[1];
    const gLnFG = grads[grads.length - 3];
    const gLnFB = grads[grads.length - 2];
    const gLmBias = grads[grads.length - 1];

    let totalLoss = 0;
    let predictedCount = 0;
    const logits = new Float32Array(V);
    const probs = new Float32Array(V);

    const activeStart = Math.max(0, lossStartIdx - 1);
    for (let t = activeStart; t < T; t++) predictedCount++;
    if (predictedCount === 0) return { loss: 0, tokensPredicted: 0 };
    const invCount = 1 / predictedCount;

    for (let t = activeStart; t < T; t++) {
      const hOff = t * D;
      let maxL = -1e9;
      for (let vIdx = 0; vIdx < V; vIdx++) {
        let dot = this.lmBias[vIdx];
        const eOff = vIdx * D;
        for (let d = 0; d < D; d++) {
          dot += lnF.out[hOff + d] * this.tokEmb[eOff + d];
        }
        logits[vIdx] = dot;
        if (dot > maxL) maxL = dot;
      }

      let sumExp = 0;
      for (let vIdx = 0; vIdx < V; vIdx++) {
        const e = Math.exp(logits[vIdx] - maxL);
        probs[vIdx] = e;
        sumExp += e;
      }
      const invSum = 1 / sumExp;
      const target = targets[t];
      const targetProb = Math.max(1e-7, probs[target] * invSum);
      totalLoss += -Math.log(targetProb);

      for (let vIdx = 0; vIdx < V; vIdx++) {
        const p = probs[vIdx] * invSum;
        const dLogit = (p - (vIdx === target ? 1 : 0)) * invCount;
        if (dLogit > -1e-5 && dLogit < 1e-5) continue;
        gLmBias[vIdx] += dLogit;
        const eOff = vIdx * D;
        for (let d = 0; d < D; d++) {
          dLnFOut[hOff + d] += dLogit * this.tokEmb[eOff + d];
          gTokEmb[eOff + d] += dLogit * lnF.out[hOff + d];
        }
      }
    }

    let dCur = this.layerNormBackward(dLnFOut, lnF.xHat, lnF.invStd, this.lnFG, gLnFG, gLnFB, T, D);

    for (let l = L - 1; l >= 0; l--) {
      const w = this.layers[l];
      const c = caches[l];
      const baseGradIdx = 2 + l * 12;
      const gLn1G = grads[baseGradIdx];
      const gLn1B = grads[baseGradIdx + 1];
      const gWq = grads[baseGradIdx + 2];
      const gWk = grads[baseGradIdx + 3];
      const gWv = grads[baseGradIdx + 4];
      const gWo = grads[baseGradIdx + 5];
      const gLn2G = grads[baseGradIdx + 6];
      const gLn2B = grads[baseGradIdx + 7];
      const gW1 = grads[baseGradIdx + 8];
      const gB1 = grads[baseGradIdx + 9];
      const gW2 = grads[baseGradIdx + 10];
      const gB2 = grads[baseGradIdx + 11];

      const dFf1Act = new Float32Array(T * dFF);
      for (let t = 0; t < T; t++) {
        const off = t * D;
        const hOff = t * dFF;
        for (let o = 0; o < D; o++) {
          const dy = dCur[off + o];
          gB2[o] += dy;
          const wRow = o * dFF;
          for (let m = 0; m < dFF; m++) {
            gW2[wRow + m] += dy * c.ff1Act[hOff + m];
            dFf1Act[hOff + m] += dy * w.w2[wRow + m];
          }
        }
      }

      const dLn2Out = new Float32Array(T * D);
      for (let t = 0; t < T; t++) {
        const inOff = t * D;
        const hOff = t * dFF;
        for (let m = 0; m < dFF; m++) {
          const dPre = dFf1Act[hOff + m] * geluDeriv(c.ff1Pre[hOff + m]);
          gB1[m] += dPre;
          const wRow = m * D;
          for (let i = 0; i < D; i++) {
            gW1[wRow + i] += dPre * c.ln2.out[inOff + i];
            dLn2Out[inOff + i] += dPre * w.w1[wRow + i];
          }
        }
      }

      const dXMidFfn = this.layerNormBackward(dLn2Out, c.ln2.xHat, c.ln2.invStd, w.ln2G, gLn2G, gLn2B, T, D);
      const dXMid = new Float32Array(T * D);
      for (let i = 0; i < T * D; i++) dXMid[i] = dCur[i] + dXMidFfn[i];

      const dAttnOut = new Float32Array(T * D);
      for (let t = 0; t < T; t++) {
        const off = t * D;
        for (let o = 0; o < D; o++) {
          const dy = dXMid[off + o];
          const wRow = o * D;
          for (let i = 0; i < D; i++) {
            gWo[wRow + i] += dy * c.attnOut[off + i];
            dAttnOut[off + i] += dy * w.wo[wRow + i];
          }
        }
      }

      const dQ = new Float32Array(T * D);
      const dK = new Float32Array(T * D);
      const dV = new Float32Array(T * D);

      for (let h = 0; h < H; h++) {
        const hOff = h * headDim;
        const pBase = h * T * T;
        for (let tq = 0; tq < T; tq++) {
          const rowP = pBase + tq * T;
          let sumPdP = 0;

          for (let tk = 0; tk <= tq; tk++) {
            const p = c.attnProbs[rowP + tk];
            const vBase = tk * D + hOff;
            const oBase = tq * D + hOff;
            let dot = 0;
            for (let hd = 0; hd < headDim; hd++) {
              const dao = dAttnOut[oBase + hd];
              dot += dao * c.v[vBase + hd];
              dV[vBase + hd] += p * dao;
            }
            dPBuf[tk] = dot;
            sumPdP += p * dot;
          }

          const qBase = tq * D + hOff;
          for (let tk = 0; tk <= tq; tk++) {
            const p = c.attnProbs[rowP + tk];
            const dScore = p * (dPBuf[tk] - sumPdP) * scale;
            const kBase = tk * D + hOff;
            for (let hd = 0; hd < headDim; hd++) {
              dQ[qBase + hd] += dScore * c.k[kBase + hd];
              dK[kBase + hd] += dScore * c.q[qBase + hd];
            }
          }
        }
      }

      const dLn1Out = new Float32Array(T * D);
      for (let t = 0; t < T; t++) {
        const xOff = t * D;
        for (let o = 0; o < D; o++) {
          const dq = dQ[xOff + o];
          const dk = dK[xOff + o];
          const dv = dV[xOff + o];
          const wRow = o * D;
          for (let i = 0; i < D; i++) {
            const xv = c.ln1.out[xOff + i];
            gWq[wRow + i] += dq * xv;
            gWk[wRow + i] += dk * xv;
            gWv[wRow + i] += dv * xv;
            dLn1Out[xOff + i] += dq * w.wq[wRow + i] + dk * w.wk[wRow + i] + dv * w.wv[wRow + i];
          }
        }
      }

      const dXInAttn = this.layerNormBackward(dLn1Out, c.ln1.xHat, c.ln1.invStd, w.ln1G, gLn1G, gLn1B, T, D);
      const dPrev = new Float32Array(T * D);
      for (let i = 0; i < T * D; i++) dPrev[i] = dXMid[i] + dXInAttn[i];
      dCur = dPrev;
    }

    for (let t = 0; t < T; t++) {
      const tokOff = inputs[t] * D;
      const posOff = t * D;
      const dOff = t * D;
      for (let d = 0; d < D; d++) {
        const g = dCur[dOff + d];
        gTokEmb[tokOff + d] += g;
        gPosEmb[posOff + d] += g;
      }
    }

    return { loss: totalLoss / predictedCount, tokensPredicted: predictedCount };
  }

  private applyAdamW(grads: Float32Array[], batchCount: number, lr: number, weightDecay = 0.01): void {
    const invBatch = 1 / Math.max(1, batchCount);
    let normSq = 0;
    for (const gArr of grads) {
      for (let i = 0; i < gArr.length; i++) {
        gArr[i] *= invBatch;
        normSq += gArr[i] * gArr[i];
      }
    }
    const totalNorm = Math.sqrt(normSq);
    const clipScale = totalNorm > 1.0 ? 1.0 / totalNorm : 1.0;

    this.adamStep += 1;
    const beta1 = 0.9;
    const beta2 = 0.999;
    const eps = 1e-8;
    const bc1 = 1 - Math.pow(beta1, this.adamStep);
    const bc2 = 1 - Math.pow(beta2, this.adamStep);
    const params = this.allParamArrays();
    const D = this.config.dModel;

    for (let pIdx = 0; pIdx < params.length; pIdx++) {
      const p = params[pIdx];
      const g = grads[pIdx];
      const m = this.adamM[pIdx];
      const v = this.adamV[pIdx];
      const decay = pIdx >= 2 && p.length > D ? weightDecay : 0;
      for (let i = 0; i < p.length; i++) {
        const gi = g[i] * clipScale;
        const mi = beta1 * m[i] + (1 - beta1) * gi;
        const vi = beta2 * v[i] + (1 - beta2) * gi * gi;
        m[i] = mi;
        v[i] = vi;
        const mHat = mi / bc1;
        const vHat = vi / bc2;
        if (decay > 0) p[i] *= 1 - lr * decay;
        p[i] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
        g[i] = 0;
      }
    }
  }

  trainSequence(
    tokenIds: number[],
    lossStartIdx: number,
    lr: number,
    weightDecay = 0.01
  ): { loss: number; tokensPredicted: number } {
    const grads = this.allParamArrays().map((a) => new Float32Array(a.length));
    const res = this.accumulateSequenceGradients(tokenIds, lossStartIdx, grads);
    if (res.tokensPredicted > 0) {
      this.applyAdamW(grads, 1, lr, weightDecay);
    }
    return res;
  }

  /**
   * Trains over a list of prompt/response pairs using mini-batch AdamW accumulation.
   */
  trainCorpus(
    pairs: Array<{ prompt: string; response: string }>,
    epochs = 24,
    baseLr = 0.012,
    batchSize = 6
  ): TrainingLossPoint[] {
    const encodedPairs = pairs.map((p) => {
      const promptIds = [
        NawaBpeTokenizer.BOS_ID,
        NawaBpeTokenizer.USR_ID,
        ...this.tokenizer.encode(p.prompt),
        NawaBpeTokenizer.AST_ID,
      ];
      const respIds = [...this.tokenizer.encode(p.response), NawaBpeTokenizer.EOS_ID];
      return {
        full: [...promptIds, ...respIds].slice(0, this.config.maxSeqLen),
        lossStart: promptIds.length,
      };
    });

    const rng = createRng(991 + this.trainedEpochs);
    const order = encodedPairs.map((_, i) => i);
    const grads = this.allParamArrays().map((a) => new Float32Array(a.length));

    for (let ep = 1; ep <= epochs; ep++) {
      const t0 = performance.now();
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }

      const progress = ep / Math.max(1, epochs);
      const lr = baseLr * (0.2 + 0.8 * 0.5 * (1 + Math.cos(Math.PI * progress)));

      let sumLoss = 0;
      let count = 0;
      let inBatch = 0;

      for (let k = 0; k < order.length; k++) {
        const item = encodedPairs[order[k]];
        const res = this.accumulateSequenceGradients(item.full, item.lossStart, grads);
        if (res.tokensPredicted > 0) {
          sumLoss += res.loss;
          count += 1;
          inBatch += 1;
        }
        if (inBatch >= batchSize || k === order.length - 1) {
          if (inBatch > 0) {
            this.applyAdamW(grads, inBatch, lr);
            inBatch = 0;
          }
        }
      }

      const avgLoss = count > 0 ? sumLoss / count : 0;
      this.trainedEpochs += 1;
      const point: TrainingLossPoint = {
        epoch: this.trainedEpochs,
        loss: Number(avgLoss.toFixed(4)),
        perplexity: Number(Math.exp(Math.min(10, avgLoss)).toFixed(2)),
        elapsedMs: Number((performance.now() - t0).toFixed(1)),
      };
      this.lossHistory.push(point);
      if (this.lossHistory.length > 80) {
        this.lossHistory = this.lossHistory.slice(-80);
      }
    }

    return this.lossHistory;
  }

  /**
   * Single-token causal forward step using real KV-Cache (with optional KV-Cache Activity Compression).
   */
  private forwardStepWithKvCache(
    tokenId: number,
    posIndex: number,
    kCaches: Float32Array[][],
    vCaches: Float32Array[][]
  ): Float32Array {
    const { vocabSize: V, dModel: D, nLayers: L, nHeads: H, dFF, maxSeqLen } = this.config;
    const headDim = D / H;
    const scale = 1 / Math.sqrt(headDim);
    const pos = Math.min(posIndex, maxSeqLen - 1);

    const x = new Float32Array(D);
    const tokOff = tokenId * D;
    const posOff = pos * D;
    for (let d = 0; d < D; d++) {
      x[d] = this.tokEmb[tokOff + d] + this.posEmb[posOff + d];
    }

    const lnVec = (vec: Float32Array, g: Float32Array, b: Float32Array) => {
      let m = 0;
      for (let d = 0; d < D; d++) m += vec[d];
      m /= D;
      let v = 0;
      for (let d = 0; d < D; d++) {
        const diff = vec[d] - m;
        v += diff * diff;
      }
      const is = 1 / Math.sqrt(v / D + 1e-5);
      const out = new Float32Array(D);
      for (let d = 0; d < D; d++) out[d] = ((vec[d] - m) * is) * g[d] + b[d];
      return out;
    };

    let cur = x;
    for (let l = 0; l < L; l++) {
      const w = this.layers[l];
      const n1 = lnVec(cur, w.ln1G, w.ln1B);

      const q = new Float32Array(D);
      const k = new Float32Array(D);
      const v = new Float32Array(D);
      for (let o = 0; o < D; o++) {
        let sq = 0;
        let sk = 0;
        let sv = 0;
        const row = o * D;
        for (let i = 0; i < D; i++) {
          const xi = n1[i];
          sq += w.wq[row + i] * xi;
          sk += w.wk[row + i] * xi;
          sv += w.wv[row + i] * xi;
        }
        q[o] = sq;
        k[o] = sk;
        v[o] = sv;
      }

      kCaches[l].push(k);
      vCaches[l].push(v);

      const cacheLen = kCaches[l].length;
      const attnOut = new Float32Array(D);
      const scores = new Float32Array(cacheLen);

      for (let h = 0; h < H; h++) {
        const hOff = h * headDim;
        let maxS = -1e9;
        for (let tk = 0; tk < cacheLen; tk++) {
          const kt = kCaches[l][tk];
          let dot = 0;
          for (let hd = 0; hd < headDim; hd++) {
            dot += q[hOff + hd] * kt[hOff + hd];
          }
          const s = dot * scale;
          scores[tk] = s;
          if (s > maxS) maxS = s;
        }
        let sumExp = 0;
        for (let tk = 0; tk < cacheLen; tk++) {
          const e = Math.exp(scores[tk] - maxS);
          scores[tk] = e;
          sumExp += e;
        }
        const invSum = 1 / sumExp;
        for (let tk = 0; tk < cacheLen; tk++) {
          const p = scores[tk] * invSum;
          const vt = vCaches[l][tk];
          for (let hd = 0; hd < headDim; hd++) {
            attnOut[hOff + hd] += p * vt[hOff + hd];
          }
        }
      }

      const mid = new Float32Array(D);
      for (let o = 0; o < D; o++) {
        let s = 0;
        const row = o * D;
        for (let i = 0; i < D; i++) s += w.wo[row + i] * attnOut[i];
        mid[o] = cur[o] + s;
      }

      const n2 = lnVec(mid, w.ln2G, w.ln2B);
      const ffHidden = new Float32Array(dFF);
      for (let m = 0; m < dFF; m++) {
        let s = w.b1[m];
        const row = m * D;
        for (let i = 0; i < D; i++) s += w.w1[row + i] * n2[i];
        ffHidden[m] = gelu(s);
      }

      const next = new Float32Array(D);
      for (let o = 0; o < D; o++) {
        let s = w.b2[o];
        const row = o * dFF;
        for (let m = 0; m < dFF; m++) s += w.w2[row + m] * ffHidden[m];
        next[o] = mid[o] + s;
      }
      cur = next;
    }

    const nf = lnVec(cur, this.lnFG, this.lnFB);
    const logits = new Float32Array(V);
    for (let vIdx = 0; vIdx < V; vIdx++) {
      let s = this.lmBias[vIdx];
      const eOff = vIdx * D;
      for (let d = 0; d < D; d++) s += nf[d] * this.tokEmb[eOff + d];
      logits[vIdx] = s;
    }
    return logits;
  }

  /**
   * Activity Compression on the live Transformer KV-Cache:
   * Retains initial attention sink tokens (first 4) + pools evicted middle KV pairs into
   * a single condensed KV state + retains the most recent sliding window, bounding attention O(1).
   */
  private compressKvCache(kCaches: Float32Array[][], vCaches: Float32Array[][], limit = 44): number {
    const D = this.config.dModel;
    let evictedCount = 0;
    for (let l = 0; l < this.config.nLayers; l++) {
      const kc = kCaches[l];
      const vc = vCaches[l];
      if (kc.length <= limit) continue;

      const sinkKeep = 4;
      const tailKeep = limit - sinkKeep - 1;
      const evictEnd = kc.length - tailKeep;
      const midCount = evictEnd - sinkKeep;
      if (midCount <= 1) continue;

      if (l === 0) evictedCount = midCount - 1;

      const pooledK = new Float32Array(D);
      const pooledV = new Float32Array(D);
      for (let idx = sinkKeep; idx < evictEnd; idx++) {
        for (let d = 0; d < D; d++) {
          pooledK[d] += kc[idx][d] / midCount;
          pooledV[d] += vc[idx][d] / midCount;
        }
      }
      kCaches[l] = [...kc.slice(0, sinkKeep), pooledK, ...kc.slice(evictEnd)];
      vCaches[l] = [...vc.slice(0, sinkKeep), pooledV, ...vc.slice(evictEnd)];
    }
    return evictedCount;
  }

  generate(
    promptText: string,
    options?: {
      maxNewTokens?: number;
      temperature?: number;
      topK?: number;
      repetitionPenalty?: number;
      compressionEnabled?: boolean;
    }
  ): NeuralGenerationResult {
    const maxNewTokens = options?.maxNewTokens ?? 96;
    const temperature = options?.temperature ?? 0.25;
    const topK = options?.topK ?? 8;
    const repPenalty = options?.repetitionPenalty ?? 1.12;
    const compressionEnabled = options?.compressionEnabled ?? true;

    const promptIds = [
      NawaBpeTokenizer.BOS_ID,
      NawaBpeTokenizer.USR_ID,
      ...this.tokenizer.encode(promptText),
      NawaBpeTokenizer.AST_ID,
    ];

    const kCaches: Float32Array[][] = Array.from({ length: this.config.nLayers }, () => []);
    const vCaches: Float32Array[][] = Array.from({ length: this.config.nLayers }, () => []);

    const t0 = performance.now();
    let logits: Float32Array = new Float32Array(this.config.vocabSize);
    let compressedKvSlots = 0;

    for (let i = 0; i < promptIds.length; i++) {
      logits = this.forwardStepWithKvCache(promptIds[i], i, kCaches, vCaches);
      if (compressionEnabled) {
        compressedKvSlots += this.compressKvCache(kCaches, vCaches, 88);
      }
    }

    const generatedIds: number[] = [];
    const stepCandidates: NeuralGenerationResult["topStepCandidates"] = [];
    let nllSum = 0;
    const rng = createRng((Date.now() & 0xfffffff) ^ promptIds.length);

    for (let step = 0; step < maxNewTokens; step++) {
      // Apply repetition penalty to recently generated tokens
      const recentSet = new Set(generatedIds.slice(-16));
      const adjusted = new Float32Array(logits.length);
      for (let i = 0; i < logits.length; i++) {
        let val = logits[i];
        if (recentSet.has(i)) {
          val = val > 0 ? val / repPenalty : val * repPenalty;
        }
        adjusted[i] = val;
      }

      // Compute full probability distribution for Perplexity + Top-K inspection
      const temp = Math.max(0.05, temperature);
      let maxL = -1e9;
      for (let i = 0; i < adjusted.length; i++) {
        const scaled = adjusted[i] / temp;
        if (scaled > maxL) maxL = scaled;
      }

      const probs = new Float32Array(adjusted.length);
      let sumExp = 0;
      for (let i = 0; i < adjusted.length; i++) {
        const e = Math.exp(adjusted[i] / temp - maxL);
        probs[i] = e;
        sumExp += e;
      }
      const invSum = 1 / sumExp;
      for (let i = 0; i < probs.length; i++) probs[i] *= invSum;

      // Top-K filtering
      const indexed = Array.from({ length: probs.length }, (_, idx) => ({ idx, prob: probs[idx] }))
        .filter((x) => x.idx !== NawaBpeTokenizer.PAD_ID && x.idx !== NawaBpeTokenizer.USR_ID)
        .sort((a, b) => b.prob - a.prob)
        .slice(0, Math.max(1, topK));

      const topSum = indexed.reduce((a, b) => a + b.prob, 0) || 1;
      let chosen = indexed[0];
      if (temperature > 0.12) {
        let r = rng() * topSum;
        for (const cand of indexed) {
          r -= cand.prob;
          if (r <= 0) {
            chosen = cand;
            break;
          }
        }
      }

      if (chosen.idx === NawaBpeTokenizer.EOS_ID || chosen.idx === NawaBpeTokenizer.BOS_ID) {
        break;
      }

      generatedIds.push(chosen.idx);
      nllSum += -Math.log(Math.max(1e-7, chosen.prob));

      if (stepCandidates.length < 8) {
        stepCandidates.push({
          chosen: this.tokenizer.tokenLabel(chosen.idx).replace(/▁/g, " "),
          chosenProb: Number((chosen.prob * 100).toFixed(1)),
          alternatives: indexed.slice(0, 4).map((c) => ({
            tokenId: c.idx,
            token: this.tokenizer.tokenLabel(c.idx).replace(/▁/g, " "),
            prob: Number((c.prob * 100).toFixed(1)),
          })),
        });
      }

      const absPos = promptIds.length + step;
      logits = this.forwardStepWithKvCache(chosen.idx, absPos, kCaches, vCaches);
      if (compressionEnabled) {
        compressedKvSlots += this.compressKvCache(kCaches, vCaches, 88);
      }
    }

    const inferenceMs = Math.max(0.1, performance.now() - t0);
    const activeKvSlots = kCaches[0]?.length || 0;
    const totalSeenKv = activeKvSlots + compressedKvSlots;
    const savedRatioPct = totalSeenKv > 0 ? Math.round((compressedKvSlots / totalSeenKv) * 100) : 0;

    return {
      text: this.tokenizer.decode(generatedIds),
      generatedTokens: generatedIds.length,
      promptTokens: promptIds.length,
      inferenceMs: Number(inferenceMs.toFixed(2)),
      tokensPerSec: Number(((Math.max(1, generatedIds.length) / inferenceMs) * 1000).toFixed(1)),
      perplexityEstimate: Number(
        Math.exp(Math.min(10, nllSum / Math.max(1, generatedIds.length))).toFixed(2)
      ),
      topStepCandidates: stepCandidates,
      kvCompression: {
        enabled: compressionEnabled,
        activeKvSlots,
        compressedKvSlots,
        savedRatioPct,
      },
    };
  }

  /**
   * Exports genuine binary checkpoint `nawa_llm.bin`:
   * [Magic "NAWALM01" (8B)] [Header JSON length (4B)] [Header JSON (config + tokenizer + lossHistory)] [All Float32 weights]
   */
  exportBinary(): Uint8Array {
    const headerObj = {
      config: this.config,
      tokenizer: this.tokenizer.serialize(),
      trainedEpochs: this.trainedEpochs,
      lossHistory: this.lossHistory,
    };
    const headerBytes = new TextEncoder().encode(JSON.stringify(headerObj));
    const params = this.allParamArrays();
    const totalFloats = params.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(8 + 4 + headerBytes.length + totalFloats * 4);
    const magic = new TextEncoder().encode("NAWALM01");
    out.set(magic, 0);
    new DataView(out.buffer).setUint32(8, headerBytes.length, true);
    out.set(headerBytes, 12);

    let byteOffset = 12 + headerBytes.length;
    for (const arr of params) {
      const srcBytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      out.set(srcBytes, byteOffset);
      byteOffset += srcBytes.byteLength;
    }
    return out;
  }

  static loadBinary(raw: Uint8Array): NawaTransformerLM {
    const magic = new TextDecoder().decode(raw.slice(0, 8));
    if (magic !== "NAWALM01") {
      throw new Error("Invalid nawa_llm.bin checkpoint header");
    }
    const headerLen = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(8, true);
    const headerJson = new TextDecoder().decode(raw.slice(12, 12 + headerLen));
    const header = JSON.parse(headerJson) as {
      config: TransformerConfig;
      tokenizer: TokenizerState;
      trainedEpochs: number;
      lossHistory: TrainingLossPoint[];
    };
    const tokenizer = new NawaBpeTokenizer(header.tokenizer);
    const lm = new NawaTransformerLM(tokenizer, header.config);
    lm.trainedEpochs = header.trainedEpochs || 0;
    lm.lossHistory = header.lossHistory || [];

    let byteOffset = 12 + headerLen;
    const params = lm.allParamArrays();
    for (const arr of params) {
      const byteLen = arr.length * 4;
      const aligned = new Uint8Array(byteLen);
      aligned.set(raw.subarray(byteOffset, byteOffset + byteLen));
      arr.set(new Float32Array(aligned.buffer));
      byteOffset += byteLen;
    }
    return lm;
  }

  saveToDisk(filePath = path.resolve(process.cwd(), "nawa_llm.bin")): number {
    const bin = this.exportBinary();
    fs.writeFileSync(filePath, bin);
    return bin.byteLength;
  }

  getModelInfo() {
    const binPath = path.resolve(process.cwd(), "nawa_llm.bin");
    const checkpointBytes = fs.existsSync(binPath) ? fs.statSync(binPath).size : this.exportBinary().byteLength;
    const latest = this.lossHistory[this.lossHistory.length - 1];
    return {
      name: "NawaLM-Transformer",
      config: this.config,
      totalParams: this.totalParams,
      checkpointBytes,
      trainedEpochs: this.trainedEpochs,
      latestLoss: latest?.loss ?? null,
      latestPerplexity: latest?.perplexity ?? null,
      lossHistory: this.lossHistory,
      sampleTokens: this.tokenizer.vocab.slice(7, 45),
    };
  }
}

let transformerSingleton: NawaTransformerLM | null = null;
let runtimeCorpus: TrainingDialoguePair[] = [...NAWA_TRAINING_CORPUS];

export function getRuntimeTransformerCorpus(): TrainingDialoguePair[] {
  return runtimeCorpus;
}

export function getNawaTransformerLM(): NawaTransformerLM {
  if (transformerSingleton) return transformerSingleton;

  const checkpointPath = path.resolve(process.cwd(), "nawa_llm.bin");
  if (fs.existsSync(checkpointPath)) {
    try {
      const raw = fs.readFileSync(checkpointPath);
      transformerSingleton = NawaTransformerLM.loadBinary(raw);
      return transformerSingleton;
    } catch {
      // Fall through to fresh pre-training if checkpoint is corrupt
    }
  }

  const tokenizer = new NawaBpeTokenizer();
  tokenizer.train(
    runtimeCorpus.flatMap((p) => [p.prompt, p.response]),
    680
  );
  const lm = new NawaTransformerLM(tokenizer, {
    dModel: 64,
    nLayers: 2,
    nHeads: 4,
    dFF: 160,
    maxSeqLen: 112,
  });
  lm.trainCorpus(runtimeCorpus, 40, 0.016, 4);
  lm.saveToDisk(checkpointPath);
  transformerSingleton = lm;
  return transformerSingleton;
}

export function fineTuneNawaTransformer(
  prompt: string,
  response: string,
  topic = "custom",
  epochs = 14
): {
  modelInfo: ReturnType<NawaTransformerLM["getModelInfo"]>;
  recentHistory: TrainingLossPoint[];
} {
  const lm = getNawaTransformerLM();
  const cleanPrompt = prompt.trim();
  const cleanResp = response.trim();
  runtimeCorpus.push({ topic, prompt: cleanPrompt, response: cleanResp });

  // Full-corpus experience replay prevents catastrophic forgetting during live backpropagation
  const mix = [
    { topic, prompt: cleanPrompt, response: cleanResp },
    { topic, prompt: cleanPrompt, response: cleanResp },
    { topic, prompt: cleanPrompt, response: cleanResp },
    ...runtimeCorpus,
  ];
  lm.trainCorpus(mix, Math.min(Math.max(epochs, 4), 16), 0.01, 6);
  lm.saveToDisk();
  return {
    modelInfo: lm.getModelInfo(),
    recentHistory: lm.lossHistory.slice(-10),
  };
}

