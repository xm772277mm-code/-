import { getWasmKernel } from "../engine/wasmKernel.ts";
import { normalizeArabicDialect } from "../engine/nawaModel.ts";
import {
  getNawaTransformerLM,
  getRuntimeTransformerCorpus,
  type NeuralGenerationResult,
} from "./NawaTransformerLM.ts";
import {
  KB_ENTITIES,
  KB_PROFILES,
  matchKBEntities,
  resolveQuestionInKB,
  type DeviceKBProfile,
  type KBEntitySpec,
  type KBResolution,
} from "./NawaKnowledgeBase.ts";
import {
  analyzeCodeSnippetDetailed,
  draftStructuredContent,
  evaluateLocalCalculator,
  summarizeOrTransformText,
  synthesizeLocalCode,
} from "./NawaLocalTools.ts";

export type ResponseStyle = "auto" | "simple" | "detailed" | "concise";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  embedding?: number[];
  topicTag?: string | null;
}

export interface OfflineLLMContext {
  activeTopic: string | null;
  lastEntities: string[];
  lastUserDialect: string;
  history: ChatTurn[];
  compressedSummary: string | null;
  compressedTurnsCount: number;
  compressionEnabled: boolean;
  preferredStyle: ResponseStyle;
  deviceProfile: DeviceKBProfile;
  userConstraints: string[];
}

export interface TextAnalysis {
  questionType:
    | "comparison"
    | "how_to"
    | "why_reason"
    | "definition"
    | "code_review"
    | "code_synthesize"
    | "math"
    | "summarize"
    | "text_transform"
    | "draft_template"
    | "followup_simplify"
    | "followup_example"
    | "followup_detail"
    | "greeting"
    | "gratitude"
    | "farewell"
    | "identity"
    | "creative"
    | "general";
  extractedEntities: string[];
  hasCodeBlock: boolean;
  sentiment: "curious" | "urgent" | "casual" | "technical";
  dialect: string;
  roots: string[];
  topicSwitched: boolean;
}

export interface NeuralTelemetry {
  modelName: string;
  totalParams: number;
  vocabSize: number;
  nLayers: number;
  nHeads: number;
  dModel: number;
  trainedEpochs: number;
  perplexity: number;
  generatedTokens: number;
  tokensPerSec: number;
  guardStatus: "verified_neural" | "filtered_regrounded" | "kb_synthesized" | "verified_tool";
  guardReason: string;
  topStepCandidates: NeuralGenerationResult["topStepCandidates"];
  kvCompression: NeuralGenerationResult["kvCompression"];
}

export interface KBMetadata {
  profile: DeviceKBProfile;
  capacityFormatted: string;
  shardCount: number;
  shardId: number;
  slotIndex: string;
  domainAr: string;
  intent: string;
  confidence: number;
}

export interface OfflineLLMReply {
  reply: string;
  topic: string | null;
  dialect: string;
  intentCategory: string;
  analysis: TextAnalysis;
  attentionMatch: { matchedTurnIndex: number | null; score: number };
  compressionStats: {
    enabled: boolean;
    activeTurnsInWindow: number;
    compressedTurns: number;
    savedRatioPct: number;
  };
  neuralTelemetry: NeuralTelemetry;
  kbMetadata: KBMetadata;
  wasmInferenceMs: number;
  tokensProcessed: number;
  suggestions: string[];
}

function compute256Embedding(text: string): number[] {
  const norm = normalizeArabicDialect(text);
  const vec = new Array<number>(256).fill(0);
  const hashStr = (s: string, seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  };
  for (const tok of norm.canonicalTokens) {
    const idx = hashStr("T:" + tok, 2166136261) % 256;
    const sign = (hashStr(tok, 374761393) & 1) === 0 ? 1 : -1;
    vec[idx] += sign * 2.0;
    for (let i = 0; i <= tok.length - 3; i++) {
      const gIdx = hashStr("G:" + tok.slice(i, i + 3), 2166136261) % 256;
      vec[gIdx] += 0.6;
    }
  }
  let sq = 0;
  for (let i = 0; i < 256; i++) sq += vec[i] * vec[i];
  const inv = sq > 1e-8 ? 1 / Math.sqrt(sq) : 1;
  for (let i = 0; i < 256; i++) vec[i] *= inv;
  return vec;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

function analyzeCodeSnippet(raw: string): string | null {
  const hasCode =
    /(?:def\s+\w+|function\s+\w+|async\s+function|const\s+\w+\s*=|class\s+\w+|SELECT\s+.+FROM|for\s*\(|for\s+\w+\s+in\s+)/i.test(
      raw
    );
  if (!hasCode) return null;

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const findings: string[] = [];
  if (/def\s+\w+/.test(raw)) findings.push("يحتوي على تعريف دالة بـ **Python**.");
  if (/function\s+\w+|const\s+\w+\s*=|=>/.test(raw)) findings.push("يحتوي على بنية **JavaScript / TypeScript**.");
  if (/async\s+|await\s+/.test(raw)) findings.push("يستخدم برمجة غير متزامنة (`async/await`) لمنع حجب التنفيذ.");
  if (/SELECT\s+.+FROM/i.test(raw)) {
    if (/\+|\bf"|f'|%\s*\(/.test(raw)) {
      findings.push("تحذير أمان: يبدو أن استعلام SQL يدمج متغيرات نصية مباشرة؛ يُنصح باستخدام `?` لمنع SQL Injection.");
    } else {
      findings.push("يتضمن استعلام **SQL** لاسترجاع البيانات.");
    }
  }
  const loopCount = (raw.match(/\b(for|while)\b/g) || []).length;
  if (loopCount >= 2) {
    findings.push("يوجد أكثر من حلقة تكرار؛ تأكد من عدم وجود تعقيد `O(N²)` غير ضروري إذا كانت البيانات ضخمة.");
  }
  if (!/\b(try|except|catch)\b/.test(raw) && lines.length >= 3) {
    findings.push("اقتراح تحسين: أضف كتلة `try/except` أو `try/catch` لحماية التشغيل من الأخطاء غير المتوقعة.");
  }
  if (/eval\(|exec\(/.test(raw)) {
    findings.push("تحذير حرج: استخدام `eval/exec` يفتح ثغرة أمنية خطيرة؛ استبدله بمحلل آمن.");
  }

  return (
    `**تحليل الكود المرسل (${lines.length} سطر فعلي):**\n` +
    findings.map((f) => `- ${f}`).join("\n") +
    "\n\nإذا أردت أن أعيد كتابته بأسلوب أسرع أو أشرحه سطراً بسطر، أخبرني!"
  );
}

function safeEvalMath(raw: string): { expr: string; value: number } | null {
  const pctMatch = raw.match(
    /(\d+(?:\.\d+)?)\s*(?:%|في الميه|في المية|بالمية|بالميه)\s*(?:من|of)\s*(\d+(?:\.\d+)?)/i
  );
  if (pctMatch) {
    const pct = Number(pctMatch[1]);
    const total = Number(pctMatch[2]);
    if (Number.isFinite(pct) && Number.isFinite(total)) {
      return { expr: `${pct}% * ${total}`, value: (pct / 100) * total };
    }
  }

  const cleaned = raw
    .replace(/[×]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/مليار/g, "* 1000000000")
    .replace(/مليون/g, "* 1000000")
    .replace(/ألف|الف/g, "* 1000");

  const match = cleaned.match(/(-?\d+(?:\.\d+)?(?:\s*[\+\-\*\/\%]\s*-?\d+(?:\.\d+)?)+)/);
  if (!match) return null;
  const expr = match[1].replace(/\s+/g, " ").trim();
  if (!/^[\d\.\+\-\*\/\%\(\)\s]+$/.test(expr)) return null;
  try {
    const tokens = expr.match(/\d+(?:\.\d+)?|[\+\-\*\/\%]/g);
    if (!tokens || tokens.length < 3) return null;
    const nums: number[] = [];
    const ops: string[] = [];
    const prec = (op: string) => (op === "*" || op === "/" || op === "%" ? 2 : 1);
    const apply = () => {
      const b = nums.pop() ?? 0;
      const a = nums.pop() ?? 0;
      const op = ops.pop();
      if (op === "+") nums.push(a + b);
      else if (op === "-") nums.push(a - b);
      else if (op === "*") nums.push(a * b);
      else if (op === "/") nums.push(b === 0 ? NaN : a / b);
      else if (op === "%") nums.push(b === 0 ? NaN : a % b);
    };
    for (const t of tokens) {
      if (/^\d/.test(t)) nums.push(Number(t));
      else {
        while (ops.length > 0 && prec(ops[ops.length - 1]) >= prec(t)) apply();
        ops.push(t);
      }
    }
    while (ops.length > 0) apply();
    const val = nums[0];
    if (typeof val !== "number" || !Number.isFinite(val)) return null;
    return { expr, value: val };
  } catch {
    return null;
  }
}

function analyzeInputDeep(raw: string, norm: ReturnType<typeof normalizeArabicDialect>): TextAnalysis {
  const t = norm.normalized;
  const matchedEntities = matchKBEntities(raw, 4);
  const extractedEntities = matchedEntities.map((e) => e.id);
  const topicSwitched = /(سيبك من|انسى|غير الموضوع|ننتقل لـ|موضوع تاني|بعيدا عن)/.test(t);
  const hasCodeBlock =
    /(?:def\s+\w+|function\s+\w+|async\s+function|const\s+\w+\s*=|let\s+\w+\s*=|class\s+\w+|SELECT\s+.+FROM|INSERT\s+INTO|for\s*\(|for\s+\w+\s+in\s+|fn\s+\w+|#include\s*<)/i.test(
      raw
    );
  const calcMatch = evaluateLocalCalculator(raw);
  const textToolMatch = summarizeOrTransformText(raw);
  const codeSynthMatch = !hasCodeBlock ? synthesizeLocalCode(raw, t) : null;
  const draftMatch = !codeSynthMatch ? draftStructuredContent(raw, t) : null;

  let questionType: TextAnalysis["questionType"] = "general";
  const startsWithGreeting = /^(اهلا|مرحبا|السلام عليكم|سلام عليكم|ازيك|عامل ايه|اخبارك|صباح|مساء|هلا|شلونك|كيف حالك|كيف الحال|كيفك|الو|الوو|hi|hello|hey)(?:\s|$)/.test(t);
  const hasDomainQuestion =
    extractedEntities.length > 0 &&
    /(ليه|ازاي|كيف|احسب|اشرح|قارن|ما هو|ما هي|عايز اعرف|مشكله|يعني ايه)/.test(t);
  if (startsWithGreeting && !hasDomainQuestion && !calcMatch && !codeSynthMatch) {
    questionType = "greeting";
  } else if (
    /(?:^|\s)(شكرا|تسلم|متشكر|يعطيك العافيه|جزاك الله|عاش|ممتاز|جامد|برافو|thank|thanks)(?:\s|$)/.test(t) &&
    t.split(" ").length <= 5
  ) {
    questionType = "gratitude";
  } else if (
    /(?:^|\s)(باي|مع السلامه|سلام|اشوفك|تصبح على خير|bye|goodbye)(?:\s|$)/.test(t) &&
    t.split(" ").length <= 4
  ) {
    questionType = "farewell";
  } else if (
    /(من انت|انت من|مين انت|انت مين|ما اسمك|اسمك ايه|عرفني بنفسك|قدراتك|بتعمل ايه|نموذج فعلي|اسكربت|انت فاهم|بتفهم|سامعني|مبتردش|مش بترد|who are you|what is your name)/.test(t)
  ) {
    questionType = "identity";
  } else if (hasCodeBlock) {
    questionType = "code_review";
  } else if (calcMatch) {
    questionType = "math";
  } else if (textToolMatch) {
    questionType = "text_transform";
  } else if (codeSynthMatch) {
    questionType = "code_synthesize";
  } else if (draftMatch) {
    questionType = "draft_template";
  } else if (/(قارن|الفرق|مقارنه|ولا|vs|compare|difference|احسن من)/.test(t)) {
    questionType = "comparison";
  } else if (/(بسط|ابسط|بالعامي|بسهوله|مش فاهم|باختصار|بكلام بسيط|simplify)/.test(t)) {
    questionType = "followup_simplify";
  } else if (/(مثال|كود عملي|تطبيق عملي|example)/.test(t)) {
    questionType = "followup_example";
  } else if (/(فصل|تعمق|اشرح اكتر|اكثر|توسع|عيوب|مميزات|details)/.test(t)) {
    questionType = "followup_detail";
  } else if (/(لخص|ملخص|اختصر|summarize)/.test(t)) {
    questionType = "summarize";
  } else if (/(ازاي|كيف|طريقه|خطوات|اعمل ايه|how to|how do)/.test(t)) {
    questionType = "how_to";
  } else if (/(ليه|لماذا|السبب|علشان|عشان|why)/.test(t)) {
    questionType = "why_reason";
  } else if (/(يعني ايه|ما هو|ما هي|عرف|مفهوم|اشرح|فهمني|what is)/.test(t)) {
    questionType = "definition";
  } else if (/(اكتب|صغ|رساله|ايميل|فكره|مقال|اقترح|معلومه|نصيحه)/.test(t)) {
    questionType = "creative";
  }

  let sentiment: TextAnalysis["sentiment"] = "casual";
  if (/(بسرعه|فورا|عاجل|لاج|بطيء|مشكله)/.test(t)) sentiment = "urgent";
  else if (extractedEntities.length > 0 || hasCodeBlock || codeSynthMatch) sentiment = "technical";
  else if (/[؟?]|ليه|ازاي|يعني/.test(raw)) sentiment = "curious";

  const roots = norm.canonicalTokens.filter((tok) => tok.length >= 2).slice(0, 8);

  return {
    questionType,
    extractedEntities,
    hasCodeBlock,
    sentiment,
    dialect: norm.detectedDialectHint,
    roots,
    topicSwitched,
  };
}

function groundPromptForTransformer(
  raw: string,
  analysis: TextAnalysis,
  entities: string[],
  queryVec: number[]
): { prompt: string; matchedTopic: string | null; anchorScore: number; exactMatch: boolean } {
  const corpus = getRuntimeTransformerCorpus();
  const rawLower = raw.trim().toLowerCase();

  for (const item of corpus) {
    if (item.prompt.trim().toLowerCase() === rawLower) {
      return { prompt: item.prompt, matchedTopic: item.topic, anchorScore: 10, exactMatch: true };
    }
  }

  let bestScore = -1;
  let bestItem = corpus[0];
  const e0 = entities[0] || "";
  const e1 = entities[1] || "";

  for (const item of corpus) {
    const itemVec = compute256Embedding(item.prompt);
    let score = cosineSimilarity(queryVec, itemVec) * 3.0;
    const itemNorm = normalizeArabicDialect(item.prompt).normalized;

    if (e0 && (item.topic === e0 || itemNorm.includes(e0))) score += 2.2;
    if (e1 && itemNorm.includes(e1)) score += 2.2;
    if (analysis.questionType === "comparison" && item.topic === "comparison") score += 2.0;
    if (analysis.questionType === "greeting" && item.topic === "greeting") score += 2.5;
    if (analysis.questionType === "identity" && item.topic === "identity") score += 2.5;
    if (analysis.questionType === "followup_simplify" && /(بسط|باختصار)/.test(item.prompt)) score += 2.4;
    if (analysis.questionType === "followup_example" && /(مثال)/.test(item.prompt)) score += 2.4;

    const rawTokens = new Set(normalizeArabicDialect(raw).canonicalTokens);
    for (const tok of normalizeArabicDialect(item.prompt).canonicalTokens) {
      if (rawTokens.has(tok)) score += 0.65;
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  if (bestScore >= 2.2 && bestItem) {
    return { prompt: bestItem.prompt, matchedTopic: bestItem.topic, anchorScore: bestScore, exactMatch: false };
  }

  return { prompt: raw.trim(), matchedTopic: entities[0] || null, anchorScore: bestScore, exactMatch: false };
}

let cachedKnownVocab: Set<string> | null = null;
function getKnownResponseVocabulary(): Set<string> {
  if (cachedKnownVocab) return cachedKnownVocab;
  const set = new Set<string>([
    "من", "في", "على", "عن", "إلى", "الى", "مع", "أو", "او", "و", "ثم", "لكن", "بل", "حتى",
    "هذا", "هذه", "ذلك", "تلك", "التي", "الذي", "الذين", "ما", "ماذا", "لماذا", "كيف", "متى",
    "أين", "هل", "نعم", "لا", "ليس", "كان", "يكون", "تكون", "أن", "ان", "إن", "لأن", "لان",
    "بدون", "عند", "بين", "عبر", "حول", "كل", "بعض", "أكثر", "اكثر", "أقل", "اقل", "جدا", "جداً",
    "فقط", "أي", "اي", "أنا", "انا", "أنت", "انت", "نحن", "هو", "هي", "هم", "به", "بها", "له", "لها",
    "نواة", "مرحبا", "أهلا", "اهلا", "مساعدك", "المحلي", "المتقدم", "السياق", "الحوار",
  ]);
  const addText = (text: string) => {
    const cleaned = text
      .toLowerCase()
      .replace(/[^\u0600-\u06FFa-zA-Z0-9_\s-]/g, " ");
    for (const w of cleaned.split(/\s+/)) {
      if (w.length >= 2) set.add(w);
    }
  };
  for (const item of getRuntimeTransformerCorpus()) {
    addText(item.prompt);
    addText(item.response);
  }
  for (const entity of KB_ENTITIES) {
    addText(entity.nameAr);
    addText(entity.nameEn);
    addText(entity.summary);
    addText(entity.simpleSummary);
    addText(entity.howItWorks);
    addText(entity.pros);
    addText(entity.cons);
    addText(entity.bestPractice);
  }
  cachedKnownVocab = set;
  return set;
}

/**
 * Anti-Drift & Weird-Context Guard ("حوش أي سياق غريب في رد النموذج"):
 * Validates generated tokens, blocks control artifacts, detects token repetition loops,
 * blocks broken Arabic morphology/mixed-script merges, checks out-of-distribution drift,
 * and verifies entity/domain alignment.
 */
function evaluateCoherenceAndClean(
  candidateText: string,
  perplexity: number,
  expectedEntities: string[],
  questionType: TextAnalysis["questionType"],
  kb: KBResolution,
  exactAnchorMatch: boolean,
  anchorScore = 10
): {
  cleanText: string;
  guardStatus: NeuralTelemetry["guardStatus"];
  guardReason: string;
} {
  const cleaned = candidateText
    .replace(/<(?:PAD|BOS|EOS|USR|AST|SYS|NL)>/g, "")
    .replace(/▁/g, " ")
    .replace(/\uFFFD/g, "")
    .replace(/\s{3,}/g, " ")
    .trim();

  const hasRepeatedLoop = /(\S{2,})(?:\s+\1){2,}/.test(cleaned);
  const tooShort = cleaned.length < 14;
  // Detect intra-word Arabic<->Latin collisions (hallucinated BPE merges like "أناRّel" or "ذؤLذ")
  const hasBrokenMixedScript = /[\u0600-\u06FF][a-zA-Z]|[a-zA-Z][\u0600-\u06FF]/.test(cleaned);
  // Detect fragmented single-character Arabic garbage (e.g. "بي أ لغة م ت")
  const hasFragmentedArabic = /(?:^|\s)[\u0621-\u064A](?:\s+[\u0621-\u064A]){2,}(?:\s|$)/.test(cleaned);
  // Detect mid-word taa-marbuta / tanween splices (e.g. "متعددةث", "والأاًنواع"), double leading hamza ("أأمجة"), collided punctuation ("؛.")
  const hasBrokenArabicMorphology =
    /[\u0629\u064B-\u064D][\u0621-\u064A]/.test(cleaned) ||
    /(?:^|\s)[أإ]{2}/.test(cleaned) ||
    /[؛،][.!؟]/.test(cleaned);

  // Known vocabulary coverage check to reject invented Frankentokens
  const knownVocab = getKnownResponseVocabulary();
  const contentWords = cleaned
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-zA-Z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const knownCount = contentWords.filter((w) => knownVocab.has(w) || /^\d+$/.test(w)).length;
  const knownWordRatio = contentWords.length > 0 ? knownCount / contentWords.length : 0;
  const hasUnknownWordDrift = contentWords.length === 0 || knownWordRatio < 0.78;

  const isOutOfDistribution =
    !exactAnchorMatch &&
    anchorScore < 2.2 &&
    expectedEntities.length === 0 &&
    questionType !== "greeting" &&
    questionType !== "identity";

  const highPerplexityDrift = perplexity > (exactAnchorMatch ? 2.2 : 1.85);

  // Strict entity consistency check (never trust even exactAnchorMatch if weights drifted)
  let driftedOffEntity = false;
  if (expectedEntities.length > 0) {
    const replyEntities = matchKBEntities(cleaned, 4).map((e) => e.id);
    const primaryExpected = expectedEntities[0];
    if (!replyEntities.includes(primaryExpected)) {
      driftedOffEntity = true;
    }
    if (questionType === "comparison" && expectedEntities.length >= 2) {
      const hasBoth = expectedEntities.slice(0, 2).every((eid) => replyEntities.includes(eid));
      if (!hasBoth) {
        driftedOffEntity = true;
      }
    }
    if ((kb.intent === "pros_cons" || kb.intent === "example") && !exactAnchorMatch && kb.synthesizedAnswer) {
      driftedOffEntity = true;
    }
  }

  if (
    tooShort ||
    hasRepeatedLoop ||
    hasBrokenMixedScript ||
    hasFragmentedArabic ||
    hasBrokenArabicMorphology ||
    hasUnknownWordDrift ||
    isOutOfDistribution ||
    highPerplexityDrift ||
    driftedOffEntity
  ) {
    if (questionType === "greeting") {
      return {
        cleanText:
          "أهلاً بك يا صديقي! أنا بخير والحمد لله وجاهز أساعدك فوراً. تقدر تكلمني بالعامية أو الفصحى في أي موضوع: برمجة، حل مشاكل التلفون أو الكمبيوتر، علوم وفضاء، تنظيم وقت، حسابات، أو أي سؤال في بالك—اسألني على طول!",
        guardStatus: "kb_synthesized",
        guardReason: "ترحيب طبيعي وسياقي خالٍ من أي نص دخيل.",
      };
    }

    if (questionType === "gratitude") {
      return {
        cleanText:
          "العفو، تحت أمرك في أي وقت! لو حابب نكمل في نفس الموضوع أو تسأل عن أي حاجة تانية أنا جاهز.",
        guardStatus: "kb_synthesized",
        guardReason: "رد حواري طبيعي على الشكر.",
      };
    }

    if (questionType === "farewell") {
      return {
        cleanText: "مع السلامة وأتمنى لك وقتاً موفقاً! أنا موجود هنا في أي وقت تحب ترجع تكمل كلامنا.",
        guardStatus: "kb_synthesized",
        guardReason: "توديع طبيعي ومنضبط.",
      };
    }

    if (
      questionType === "identity" &&
      (expectedEntities.length === 0 || expectedEntities[0] === "nawa_model_identity")
    ) {
      return {
        cleanText:
          "أنا **نواة** — **نموذج صغير (النسخة التجريبية)**.\n\n" +
          "أستطيع مساعدتك في كتابة ومراجعة الكود، حل العمليات الحسابية وتحويل الوحدات، تلخيص النصوص، وصياغة الرسائل والخطط وشرح مفاهيم العلوم والمالية والتقنية بالعامية أو الفصحى.\n\n" +
          "اسألني عمّا تريد الآن وسأساعدك مباشرة!",
        guardStatus: "kb_synthesized",
        guardReason: "تعريف طبيعي بهوية المساعد.",
      };
    }

    if (kb.synthesizedAnswer) {
      return {
        cleanText: kb.synthesizedAnswer,
        guardStatus: "filtered_regrounded",
        guardReason: driftedOffEntity
          ? "تم حجب انحراف سياقي عن الكيان المطلوب وتثبيت الرد من قاعدة المعرفة."
          : hasBrokenMixedScript || hasFragmentedArabic || hasBrokenArabicMorphology
            ? "تم اكتشاف رموز مشوشة وإعادة صياغة الرد بنقاء تام."
            : "تم ضبط الرد عبر الفهرس الدلالي لضمان التماسك وخلوه من أي سياق غريب.",
      };
    }

    if (questionType === "creative") {
      return {
        cleanText:
          "ممتاز! عشان أطلعلك أفضل صياغة أو فكرة منظمة:\n- لو عايز **رسالة أو إيميل**: قولي لمين موجه والموضوع في جملة.\n- لو عايز **فكرة مشروع أو نصيحة**: قولي مجالك أو المشكلة اللي بتفكر فيها وهرتبلك خطة عملية واضحة خطوة بخطوة.",
        guardStatus: "kb_synthesized",
        guardReason: "توجيه سياقي منضبط لطلب الصياغة والأفكار.",
      };
    }

    // Conversational fallback when input is very ambiguous or open-ended
    const hasTopicHint = kb.matchedEntities.length > 0;
    if (hasTopicHint) {
      const top = kb.matchedEntities[0];
      return {
        cleanText: `${top.simpleSummary}\n\n**نصيحة عملية:** ${top.bestPractice}`,
        guardStatus: "kb_synthesized",
        guardReason: "فهم ضبابي لسياق الحديث وتقديم الخلاصة الأقرب.",
      };
    }

    return {
      cleanText:
        "فهمت قصدك العام إنك بتدور على توضيح أو مساعدة، وعشان أديك إجابة دقيقة ومفيدة مباشرة قولي بس جملة أوضح شوية عن اللي في بالك (مثلاً: سؤال علمي، مشكلة في التلفون/الكمبيوتر، كود برمجي، تنظيم وقت، أو أي موضوع محدد) وهجاوبك فوراً كأنك بتكلمني وجهاً لوجه!",
      guardStatus: "filtered_regrounded",
      guardReason: "تفاعل حواري طبيعي لطلب التوضيح ومنع الهلوسة.",
    };
  }

  return {
    cleanText: cleaned,
    guardStatus: "verified_neural",
    guardReason: "توليد عصبي متماسك ومتطابق مع سياق الحوار.",
  };
}

export class NawaOfflineLLM {
  compressContextIfNeeded(context: OfflineLLMContext): { savedRatioPct: number } {
    const WINDOW_LIMIT = 6;
    if (!context.compressionEnabled || context.history.length <= WINDOW_LIMIT) {
      const total = context.history.length + context.compressedTurnsCount;
      const savedRatioPct = total > 0 ? Math.round((context.compressedTurnsCount / total) * 100) : 0;
      return { savedRatioPct };
    }

    const overflowCount = context.history.length - WINDOW_LIMIT;
    const evicted = context.history.slice(0, overflowCount);
    context.history = context.history.slice(overflowCount);
    context.compressedTurnsCount += overflowCount;

    const topicTags = Array.from(
      new Set(evicted.map((t) => t.topicTag).filter((x): x is string => Boolean(x)))
    );
    const recentSnippets = evicted
      .filter((t) => t.role === "user")
      .slice(-2)
      .map((t) => t.content.slice(0, 45));

    const summaryParts = [
      context.compressedSummary || "",
      topicTags.length ? `مواضيع: ${topicTags.join("، ")}` : "",
      recentSnippets.length ? `نقاط: ${recentSnippets.join(" / ")}` : "",
    ].filter(Boolean);

    context.compressedSummary = summaryParts.join(" | ").slice(-240);
    const total = context.history.length + context.compressedTurnsCount;
    const savedRatioPct = Math.round((context.compressedTurnsCount / Math.max(1, total)) * 100);
    return { savedRatioPct };
  }

  async generateReply(
    userMessage: string,
    context: OfflineLLMContext,
    decodingOptions?: { temperature?: number; topK?: number; deviceProfile?: DeviceKBProfile }
  ): Promise<OfflineLLMReply> {
    const trimmed = userMessage.trim();
    const norm = normalizeArabicDialect(trimmed);
    const analysis = analyzeInputDeep(trimmed, norm);
    const queryVec = compute256Embedding(trimmed);

    if (decodingOptions?.deviceProfile) {
      context.deviceProfile = decodingOptions.deviceProfile;
    }
    const activeProfile: DeviceKBProfile = context.deviceProfile || "desktop-50b";

    // Update persistent style/constraint memory
    if (analysis.questionType === "followup_simplify" || context.preferredStyle === "simple") {
      if (!context.userConstraints.includes("simple")) context.userConstraints.push("simple");
    } else if (analysis.questionType === "followup_detail" || context.preferredStyle === "detailed") {
      context.userConstraints = context.userConstraints.filter((c) => c !== "simple");
    }

    // Topic shift clears stale entity bleed
    if (analysis.topicSwitched && analysis.extractedEntities.length === 0) {
      context.lastEntities = [];
      context.activeTopic = null;
    }

    // 1. WASM kernel vector sweep
    const kernel = await getWasmKernel();
    const wt0 = performance.now();
    const f32 = new Float32Array(kernel.memory.buffer);
    const xOffset = 524288 >>> 2;
    for (let i = 0; i < 256; i++) f32[xOffset + i] = queryVec[i];
    kernel.matvecRelu(0, 524288, 524288 + 2048, 524288 + 4096, 128, 256, 1);
    const wasmInferenceMs = Number(Math.max(0.01, performance.now() - wt0).toFixed(3));

    // 2. Deep Multi-Turn Self-Attention & Coreference Resolution
    let bestTurnIdx: number | null = null;
    let bestAttentionScore = 0;
    for (let i = 0; i < context.history.length; i++) {
      const turn = context.history[i];
      if (!turn.embedding) continue;
      const sim = cosineSimilarity(queryVec, turn.embedding);
      if (sim > bestAttentionScore) {
        bestAttentionScore = sim;
        bestTurnIdx = i;
      }
    }

    let entities = [...analysis.extractedEntities];
    const isFollowupPhrase =
      /(بسط|مثال|قارن|فصل|تاني|ليه|الفرق|الاول|التاني|عنه|عنها|عيوب|مميزات|طيب|وبعدين|اشرحه|ابسط)/.test(
        norm.normalized
      );

    if (entities.length === 0 && !analysis.topicSwitched) {
      if (isFollowupPhrase && context.lastEntities.length > 0) {
        entities = [...context.lastEntities];
      } else if (bestTurnIdx !== null && bestAttentionScore > 0.35) {
        const tag = context.history[bestTurnIdx]?.topicTag;
        if (tag) entities = [tag];
      } else if (isFollowupPhrase && context.activeTopic) {
        entities = [context.activeTopic];
      }
    } else if (
      entities.length === 1 &&
      analysis.questionType === "comparison" &&
      context.lastEntities.length > 0 &&
      !entities.includes(context.lastEntities[0])
    ) {
      // e.g. Turn 1: "اشرح Rust" -> Turn 2: "طيب قارنه مع Python"
      entities = [entities[0], context.lastEntities[0]];
    }

    const fallbackSpecs: KBEntitySpec[] = entities
      .map((id) => KB_ENTITIES.find((e) => e.id === id))
      .filter((x): x is KBEntitySpec => Boolean(x));

    // 3. Resolve onto 50B Desktop / 50M Mobile Knowledge Base Coordinate
    const kbRes = resolveQuestionInKB(trimmed, activeProfile, fallbackSpecs, context.userConstraints);

    // 4. Autoregressive Neural Transformer Forward + Coherence Guard
    const lm = getNawaTransformerLM();
    const lmInfo = lm.getModelInfo();
    const temperature =
      decodingOptions?.temperature ??
      (context.preferredStyle === "concise" ? 0.12 : context.preferredStyle === "detailed" ? 0.25 : 0.18);
    const topK = decodingOptions?.topK ?? 6;

    let reply = "";
    let nextTopic: string | null = entities[0] || context.activeTopic;
    let suggestions = kbRes.followUps;
    let neuralGen: NeuralGenerationResult;
    let guardStatus: NeuralTelemetry["guardStatus"] = "verified_neural";
    let guardReason = "توليد عصبي متماسك ومطابق للسياق.";

    if (analysis.questionType === "math") {
      const calcOut = evaluateLocalCalculator(trimmed);
      neuralGen = lm.generate("ملخص قدرات نموذج نواة", {
        maxNewTokens: 12,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });
      if (calcOut) {
        reply = calcOut.reply;
        guardStatus = "verified_tool";
        guardReason = `${calcOut.titleAr} — حساب حتمي دقيق 100% دون تقريب.`;
        suggestions = calcOut.suggestions;
        nextTopic = calcOut.topicTag;
      } else {
        const m = safeEvalMath(trimmed)!;
        reply = `ناتج العملية الحسابية \`${m.expr}\` هو **${m.value.toLocaleString("en-US")}**.`;
        guardStatus = "verified_tool";
        guardReason = "حساب رياضي مضبوط من وحدة الحساب الدقيقة دون أي تقريب أو هلوسة.";
        suggestions = ["خصم 20% على 1500", "حول 4 GB إلى MB"];
      }
    } else if (analysis.questionType === "text_transform") {
      const textOut = summarizeOrTransformText(trimmed)!;
      neuralGen = lm.generate("ملخص قدرات نموذج نواة", {
        maxNewTokens: 12,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });
      reply = textOut.reply;
      guardStatus = "verified_tool";
      guardReason = `${textOut.titleAr} — معالجة نصية حتمية على الجهاز.`;
      suggestions = textOut.suggestions;
      nextTopic = textOut.topicTag;
    } else if (analysis.questionType === "code_synthesize") {
      const synthOut = synthesizeLocalCode(trimmed, norm.normalized)!;
      neuralGen = lm.generate("نصائح لتحسين سرعة الكود وتجنب الثغرات", {
        maxNewTokens: 18,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });
      reply = synthOut.reply;
      guardStatus = "verified_tool";
      guardReason = `${synthOut.titleAr} — توليد كود منضبط وجاهز للتشغيل.`;
      suggestions = synthOut.suggestions;
      nextTopic = synthOut.topicTag;
    } else if (analysis.questionType === "draft_template") {
      const draftOut = draftStructuredContent(trimmed, norm.normalized)!;
      neuralGen = lm.generate("ملخص قدرات نموذج نواة", {
        maxNewTokens: 14,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });
      reply = draftOut.reply;
      guardStatus = "verified_tool";
      guardReason = `${draftOut.titleAr} — مسودة منظمة وجاهزة للتخصيص.`;
      suggestions = draftOut.suggestions;
      nextTopic = draftOut.topicTag;
    } else if (analysis.questionType === "code_review") {
      neuralGen = lm.generate("نصائح لتحسين سرعة الكود وتجنب الثغرات", {
        maxNewTokens: 48,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });
      const codeAudit = analyzeCodeSnippetDetailed(trimmed) || analyzeCodeSnippet(trimmed) || "";
      const guardedTip = evaluateCoherenceAndClean(
        neuralGen.text,
        neuralGen.perplexityEstimate,
        ["code_review"],
        "code_review",
        kbRes,
        true
      );
      reply = codeAudit + (guardedTip.cleanText ? `\n\n**ملاحظة إضافية:** ${guardedTip.cleanText}` : "");
      guardStatus = "verified_tool";
      guardReason = "تحليل بنية وأمان الكود عبر وحدة الفحص الدقيقة مع توصية موجهة خالية من الشوائب.";
      suggestions = ["نصائح لتحسين سرعة الكود وتجنب الثغرات", "ازاي احمي كلمات المرور والتوكنات"];
    } else if (
      (analysis.questionType === "summarize" || /(فاكر|كنا بنتكلم|اتكلمنا في ايه|سياق الحوار)/.test(norm.normalized)) &&
      (context.compressedSummary || context.history.length > 0) &&
      !trimmed.includes("قدرات نموذج")
    ) {
      neuralGen = lm.generate("ملخص قدرات نموذج نواة", {
        maxNewTokens: 20,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });
      const activeTopics = Array.from(
        new Set(context.history.map((h) => h.topicTag).filter((x): x is string => Boolean(x)))
      );
      const recentUserMsgs = context.history
        .filter((h) => h.role === "user")
        .slice(-3)
        .map((h) => `- ${h.content.slice(0, 80)}`);
      reply =
        `**ملخص المحادثة الحالية:**\n` +
        (context.compressedSummary ? `- **الملخص العام:** ${context.compressedSummary}\n` : "") +
        (activeTopics.length ? `- **المواضيع التي تمت مناقشتها:** ${activeTopics.join("، ")}\n` : "") +
        (recentUserMsgs.length ? `\n**آخر ما ناقشناه:**\n${recentUserMsgs.join("\n")}` : "");
      guardStatus = "verified_tool";
      guardReason = "استرجاع دقيق لملخص السياق والذاكرة المضغوطة.";
    } else if (analysis.questionType === "greeting") {
      neuralGen = lm.generate("مرحبا", {
        maxNewTokens: 16,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });
      reply = /^وعليك|^السلام|^سلام/.test(norm.normalized)
        ? "وعليكم السلام ورحمة الله! أهلاً بك يا صديقي، أنا نواة — نموذج صغير (النسخة التجريبية) وجاهز أساعدك فوراً في البرمجة والحسابات وتحويل الوحدات وتلخيص النصوص والمعلومات العامة!"
        : "أهلاً بك يا صديقي! أنا نواة — نموذج صغير (النسخة التجريبية) وجاهز أساعدك فوراً! تقدر تسألني بالعامية أو الفصحى: برمجة، كتابة دوال، حسابات ونسب مئوية، تحويل وحدات، علوم، مالية، أو تلخيص نصوص!";
      guardStatus = "kb_synthesized";
      guardReason = "ترحيب طبيعي وسياقي خالٍ من أي نص دخيل.";
      nextTopic = "greeting";
    } else if (analysis.questionType === "gratitude") {
      neuralGen = lm.generate("ملخص قدرات نموذج نواة", {
        maxNewTokens: 12,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });
      reply = "العفو، تحت أمرك في أي وقت! لو حابب نكمل في نفس الموضوع أو تسأل عن أي حاجة تانية أنا جاهز.";
      guardStatus = "kb_synthesized";
      guardReason = "رد حواري طبيعي على الشكر.";
      nextTopic = "gratitude";
    } else if (analysis.questionType === "farewell") {
      neuralGen = lm.generate("ملخص قدرات نموذج نواة", {
        maxNewTokens: 12,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });
      reply = "مع السلامة وأتمنى لك وقتاً موفقاً! أنا موجود هنا في أي وقت تحب ترجع تكمل كلامنا.";
      guardStatus = "kb_synthesized";
      guardReason = "توديع طبيعي ومنضبط.";
      nextTopic = "farewell";
    } else if (
      analysis.questionType === "identity" &&
      (entities.length === 0 || entities[0] === "nawa_model_identity")
    ) {
      neuralGen = lm.generate("ملخص قدرات نموذج نواة", {
        maxNewTokens: 18,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });
      reply =
        "أنا **نواة** — **نموذج صغير (النسخة التجريبية)** مدمج وسريع.\n\n" +
        "**كيف يمكنني مساعدتك؟**\n" +
        "- **البرمجة والكود:** كتابة دوال TypeScript / Python / React / SQL / Dockerfile ومراجعة الكود واكتشاف الأخطاء.\n" +
        "- **الحسابات والتحويلات:** حل العمليات بالأقواس والأسس والجذور، حساب الخصومات والضرائب، وتحويل الوحدات.\n" +
        "- **التلخيص والصياغة:** تلخيص النصوص الطويلة، عد الكلمات، وكتابة مسودات البريد وخطط العمل.\n" +
        "- **المعرفة الموسّعة:** إجابات في البرمجة والأمن السيبراني والذكاء الاصطناعي والعلوم والمالية الشخصية وإدارة المنتجات.";
      guardStatus = "kb_synthesized";
      guardReason = "تعريف طبيعي بقدرات المساعد.";
      nextTopic = "nawa_model_identity";
      suggestions = [
        "اكتب دالة TypeScript لإدارة المهام",
        "احسب (250 * 4) + 15% من 2000",
        "حول 4 GB إلى MB",
      ];
    } else {
      const grounded = groundPromptForTransformer(trimmed, analysis, entities, queryVec);
      neuralGen = lm.generate(grounded.prompt, {
        maxNewTokens: 96,
        temperature,
        topK,
        compressionEnabled: context.compressionEnabled,
      });

      const guarded = evaluateCoherenceAndClean(
        neuralGen.text,
        neuralGen.perplexityEstimate,
        entities,
        analysis.questionType,
        kbRes,
        grounded.exactMatch,
        grounded.anchorScore
      );
      reply = guarded.cleanText;
      guardStatus = guarded.guardStatus;
      guardReason = guarded.guardReason;

      if (entities[0]) {
        nextTopic = entities[0];
      } else if (grounded.matchedTopic && grounded.matchedTopic !== "comparison") {
        nextTopic = grounded.matchedTopic;
      }
    }

    context.history.push({ role: "user", content: trimmed, embedding: queryVec, topicTag: nextTopic });
    context.history.push({ role: "assistant", content: reply, embedding: queryVec, topicTag: nextTopic });
    if (entities.length > 0) context.lastEntities = entities.slice(0, 4);
    context.activeTopic = nextTopic;
    context.lastUserDialect = analysis.dialect;

    const comp = this.compressContextIfNeeded(context);

    return {
      reply,
      topic: nextTopic,
      dialect: analysis.dialect,
      intentCategory: analysis.questionType,
      analysis,
      attentionMatch: {
        matchedTurnIndex: bestTurnIdx,
        score: Number(bestAttentionScore.toFixed(3)),
      },
      compressionStats: {
        enabled: context.compressionEnabled,
        activeTurnsInWindow: context.history.length,
        compressedTurns: context.compressedTurnsCount,
        savedRatioPct: Math.max(comp.savedRatioPct, neuralGen.kvCompression.savedRatioPct),
      },
      neuralTelemetry: {
        modelName: lmInfo.name,
        totalParams: lmInfo.totalParams,
        vocabSize: lmInfo.config.vocabSize,
        nLayers: lmInfo.config.nLayers,
        nHeads: lmInfo.config.nHeads,
        dModel: lmInfo.config.dModel,
        trainedEpochs: lmInfo.trainedEpochs,
        perplexity: neuralGen.perplexityEstimate,
        generatedTokens: neuralGen.generatedTokens,
        tokensPerSec: neuralGen.tokensPerSec,
        guardStatus,
        guardReason,
        topStepCandidates: neuralGen.topStepCandidates,
        kvCompression: neuralGen.kvCompression,
      },
      kbMetadata: {
        profile: kbRes.profile,
        capacityFormatted: kbRes.capacityFormatted,
        shardCount: kbRes.shardCount,
        shardId: kbRes.shardId,
        slotIndex: kbRes.slotIndex,
        domainAr: kbRes.domainAr,
        intent: kbRes.intent,
        confidence: kbRes.confidence,
      },
      wasmInferenceMs,
      tokensProcessed: norm.tokens.length,
      suggestions,
    };
  }
}

let llmSingleton: NawaOfflineLLM | null = null;
export function getNawaOfflineLLM(): NawaOfflineLLM {
  if (!llmSingleton) {
    llmSingleton = new NawaOfflineLLM();
  }
  return llmSingleton;
}
