import { getWasmKernel } from "./wasmKernel.ts";

export type AgentIntentId =
  | "list_workspace"
  | "read_file"
  | "search_code"
  | "create_fastapi_api"
  | "create_algorithm_bench"
  | "create_web_app"
  | "create_cli_tool"
  | "edit_existing_file"
  | "run_tests_or_cmd"
  | "explain_architecture"
  | "generate_native_kernel"
  | "general_coding_help";

export interface IntentMeta {
  id: AgentIntentId;
  labelAr: string;
  descriptionAr: string;
}

export const INTENTS: IntentMeta[] = [
  { id: "list_workspace", labelAr: "استعراض الملفات", descriptionAr: "فحص هيكل المجلدات والملفات في بيئة العمل" },
  { id: "read_file", labelAr: "قراءة ملف", descriptionAr: "عرض محتوى ملف محدد مع أرقام الأسطر" },
  { id: "search_code", labelAr: "بحث في الكود", descriptionAr: "البحث عن دالة أو متغير أو نص في المشروع" },
  { id: "create_fastapi_api", labelAr: "بناء API واختباره", descriptionAr: "إنشاء خادم REST API متكامل مع اختبارات آلية" },
  { id: "create_algorithm_bench", labelAr: "خوارزمية وقياس سرعة", descriptionAr: "كتابة خوارزمية عالية الأداء واختبار سرعتها" },
  { id: "create_web_app", labelAr: "بناء واجهة ويب", descriptionAr: "إنشاء صفحة أو مكون واجهة مستخدم تفاعلي" },
  { id: "create_cli_tool", labelAr: "أداة سطر أوامر", descriptionAr: "برمجة سكربت أو أداة CLI وتشغيلها" },
  { id: "edit_existing_file", labelAr: "تعديل ملف موجود", descriptionAr: "تحديث أو إصلاح كود داخل ملف حالي" },
  { id: "run_tests_or_cmd", labelAr: "تشغيل أوامر واختبارات", descriptionAr: "تنفيذ أمر أو اختبار فعلي في الطرفية" },
  { id: "explain_architecture", labelAr: "تحليل وشرح المشروع", descriptionAr: "استكشاف الملفات وشرح معمارية الكود" },
  { id: "generate_native_kernel", labelAr: "توليد نواة C++ / SIMD", descriptionAr: "كتابة نواة حسابية عالية السرعة بـ C++ أو WASM" },
  { id: "general_coding_help", labelAr: "استشارة برمجية عامة", descriptionAr: "توجيه هندسي ومساعدة برمجية شاملة" },
];

export interface TrainingSample {
  text: string;
  intent: AgentIntentId;
  dialect: string;
}

export const INITIAL_TRAINING_CORPUS: TrainingSample[] = [
  // list_workspace
  { text: "وريني الملفات اللي في المشروع", intent: "list_workspace", dialect: "مصري" },
  { text: "ايه الملفات الموجودة في بيئة العمل", intent: "list_workspace", dialect: "مصري" },
  { text: "اعرضلي المجلدات والملفات", intent: "list_workspace", dialect: "خليجي" },
  { text: "شو في ملفات جوا المشروع", intent: "list_workspace", dialect: "شامي" },
  { text: "وريني شكاين في الدوسي", intent: "list_workspace", dialect: "مغاربي" },
  { text: "شوفني الملفات الموجودة", intent: "list_workspace", dialect: "عراقي" },
  { text: "list files in workspace", intent: "list_workspace", dialect: "إنجليزي" },

  // read_file
  { text: "اقرا ملف main.py ووريني محتواه", intent: "read_file", dialect: "مصري" },
  { text: "افتحلي ملف server.py اشوفه", intent: "read_file", dialect: "مصري" },
  { text: "ابغى اقرا محتوى ملف app.py", intent: "read_file", dialect: "خليجي" },
  { text: "فرجيني شو مكتوب بملف config.json", intent: "read_file", dialect: "شامي" },
  { text: "شوفلي شنو كاين ف ملف tools.py", intent: "read_file", dialect: "مغاربي" },
  { text: "read file README.md", intent: "read_file", dialect: "إنجليزي" },
  { text: "اقرأ السطور الاولى من ملف index.html", intent: "read_file", dialect: "فصحى" },

  // search_code
  { text: "دورلي على دالة sort في المشروع", intent: "search_code", dialect: "مصري" },
  { text: "فين كلمة router في الملفات", intent: "search_code", dialect: "مصري" },
  { text: "ابحث عن متغير database_url في الكود", intent: "search_code", dialect: "فصحى" },
  { text: "دور وين موجودة دالة calculate", intent: "search_code", dialect: "خليجي" },
  { text: "فتشلي على كلاس User بالكود", intent: "search_code", dialect: "شامي" },
  { text: "قلب على كلمة FastAPI ف البروجي", intent: "search_code", dialect: "مغاربي" },
  { text: "search code for benchmark", intent: "search_code", dialect: "إنجليزي" },

  // create_fastapi_api
  { text: "عايزك تعملي API بـ FastAPI لادارة المهام وتختبره", intent: "create_fastapi_api", dialect: "مصري" },
  { text: "اعمل سيرفر REST API لادارة المستخدمين والمهام مع اختبارات", intent: "create_fastapi_api", dialect: "مصري" },
  { text: "ابغى تسويلي باك اند API للمنتجات والطلبات واختبره", intent: "create_fastapi_api", dialect: "خليجي" },
  { text: "بدي تعملي واجهة برمجية API بالمهام وتفحصها", intent: "create_fastapi_api", dialect: "شامي" },
  { text: "بغيت تصاوب ليا API ديال المهام ب بايثون", intent: "create_fastapi_api", dialect: "مغاربي" },
  { text: "اريد تسويلي API مال مهام وتختبره", intent: "create_fastapi_api", dialect: "عراقي" },
  { text: "build a todo rest api server with tests", intent: "create_fastapi_api", dialect: "إنجليزي" },
  { text: "3ayez API python ll tasks w tests", intent: "create_fastapi_api", dialect: "عربيزي" },

  // create_algorithm_bench
  { text: "اعمل خوارزمية فرز سريعة واختبر سرعتها على مليون عنصر", intent: "create_algorithm_bench", dialect: "مصري" },
  { text: "عايز كود لحساب الاعداد الاولية بسرعة عالية مع قياس الوقت", intent: "create_algorithm_bench", dialect: "مصري" },
  { text: "سويلي دالة ضرب مصفوفات سريعة واختبر الاداء", intent: "create_algorithm_bench", dialect: "خليجي" },
  { text: "بدي خوارزمية بحث ثنائي سريعة مع بنشمارك", intent: "create_algorithm_bench", dialect: "شامي" },
  { text: "صاوب خوارزمية سريعة وحسب شحال كتاخد ديال الوقت", intent: "create_algorithm_bench", dialect: "مغاربي" },
  { text: "create fast sorting algorithm and benchmark it", intent: "create_algorithm_bench", dialect: "إنجليزي" },
  { text: "اكتب خوارزمية تشفير او ضغط بيانات سريعة", intent: "create_algorithm_bench", dialect: "فصحى" },

  // create_web_app
  { text: "اعملي صفحة ويب تفاعلية HTML و CSS لحاسبة ذكية", intent: "create_web_app", dialect: "مصري" },
  { text: "عايز واجهة موقع بسيطة لعرض البيانات", intent: "create_web_app", dialect: "مصري" },
  { text: "سويلي صفحة هبوط لمشروع تقني مع نموذج تواصل", intent: "create_web_app", dialect: "خليجي" },
  { text: "بدي تصميم صفحة داشبورد HTML جميلة", intent: "create_web_app", dialect: "شامي" },
  { text: "بغيت تصاوب صفحة ويب تفاعلية", intent: "create_web_app", dialect: "مغاربي" },
  { text: "build interactive html css dashboard page", intent: "create_web_app", dialect: "إنجليزي" },
  { text: "صمم واجهة HTML متجاوبة باللغة العربية", intent: "create_web_app", dialect: "فصحى" },

  // create_cli_tool
  { text: "اعملي سكربت بايثون لتحليل النصوص وتنظيف البيانات", intent: "create_cli_tool", dialect: "مصري" },
  { text: "عايز اداة سطر اوامر لعد الكلمات والملفات", intent: "create_cli_tool", dialect: "مصري" },
  { text: "سويلي سكربت ينظم الملفات ويحسب الاحصائيات", intent: "create_cli_tool", dialect: "خليجي" },
  { text: "بدي برنامج بايثون صغير يحلل ملفات اللوج", intent: "create_cli_tool", dialect: "شامي" },
  { text: "صاوب ليا سكربت بايثون كيحول JSON ل CSV", intent: "create_cli_tool", dialect: "مغاربي" },
  { text: "write python cli script to parse json", intent: "create_cli_tool", dialect: "إنجليزي" },
  { text: "انشئ اداة برمجية لمعالجة البيانات النصية", intent: "create_cli_tool", dialect: "فصحى" },

  // edit_existing_file
  { text: "عدل على ملف الكود وصلح الخطأ اللي فيه", intent: "edit_existing_file", dialect: "مصري" },
  { text: "غير الدالة في الملف وزود عليها ميزة جديدة", intent: "edit_existing_file", dialect: "مصري" },
  { text: "حدث الملف واضف معالجة الاخطاء", intent: "edit_existing_file", dialect: "خليجي" },
  { text: "زبطلي الكود بالملف وعدل العنوان", intent: "edit_existing_file", dialect: "شامي" },
  { text: "بدل هاد السطر ف الملف وصلحو", intent: "edit_existing_file", dialect: "مغاربي" },
  { text: "edit file and update function", intent: "edit_existing_file", dialect: "إنجليزي" },
  { text: "قم بتعديل الملف الحالي واضافة تحسينات", intent: "edit_existing_file", dialect: "فصحى" },

  // run_tests_or_cmd
  { text: "شغل الاختبارات واتاكد ان الكود شغال تمام", intent: "run_tests_or_cmd", dialect: "مصري" },
  { text: "نفذ السكربت في التيرمينال ووريني النتيجة", intent: "run_tests_or_cmd", dialect: "مصري" },
  { text: "اختبر الكود وشوف اذا فيه اخطاء", intent: "run_tests_or_cmd", dialect: "خليجي" },
  { text: "شغّل المشروع وافحص النتيجة", intent: "run_tests_or_cmd", dialect: "شامي" },
  { text: "خدم التيست وشوف واش خدام مزيان", intent: "run_tests_or_cmd", dialect: "مغاربي" },
  { text: "run tests and check python version", intent: "run_tests_or_cmd", dialect: "إنجليزي" },
  { text: "قم بتشغيل ملف الاختبار وعرض المخرجات", intent: "run_tests_or_cmd", dialect: "فصحى" },

  // explain_architecture
  { text: "اشرحلي المشروع ده بيعمل ايه وايه بنيته", intent: "explain_architecture", dialect: "مصري" },
  { text: "فهمني هيكل الكود والملفات الموجودة", intent: "explain_architecture", dialect: "مصري" },
  { text: "وش وظيفة الملفات في المشروع وشرحها", intent: "explain_architecture", dialect: "خليجي" },
  { text: "احكيلي كيف مبني المشروع وملفاته", intent: "explain_architecture", dialect: "شامي" },
  { text: "شرح ليا كيفاش خدام هاد البروجي", intent: "explain_architecture", dialect: "مغاربي" },
  { text: "explain codebase architecture and files", intent: "explain_architecture", dialect: "إنجليزي" },
  { text: "حلل معمارية المشروع الحالي ولخص المكونات", intent: "explain_architecture", dialect: "فصحى" },

  // generate_native_kernel
  { text: "اكتب نواة C++ سريعة بـ AVX2 تنجز 50 مليون عملية في الثانية", intent: "generate_native_kernel", dialect: "فصحى" },
  { text: "عايز كود C++ او WebAssembly للحسابات المتوازية SIMD", intent: "generate_native_kernel", dialect: "مصري" },
  { text: "سويلي محرك حسابي بلغة C++ للاندرويد NEON والويندوز", intent: "generate_native_kernel", dialect: "خليجي" },
  { text: "بدي نواة برمجية سريعة جدا تشتغل 50 مليون عملية بالثانية", intent: "generate_native_kernel", dialect: "شامي" },
  { text: "صاوب نواة C++ عالية السرعة ل EXE و APK", intent: "generate_native_kernel", dialect: "مغاربي" },
  { text: "generate cpp simd kernel 50m ops per second", intent: "generate_native_kernel", dialect: "إنجليزي" },
  { text: "انشئ كود محرك عصبي مدمج بلغة C++", intent: "generate_native_kernel", dialect: "فصحى" },

  // general_coding_help
  { text: "ازيك تقدر تساعدني في ايه النهاردة", intent: "general_coding_help", dialect: "مصري" },
  { text: "السلام عليكم وش قدرات النموذج المحلي", intent: "general_coding_help", dialect: "خليجي" },
  { text: "مرحبا شو فيك تعمل بالبرمجة", intent: "general_coding_help", dialect: "شامي" },
  { text: "اهلا شنو تقدر دير ف هاد البيئة", intent: "general_coding_help", dialect: "مغاربي" },
  { text: "شلونك ايش تقدر تساعدني بيه", intent: "general_coding_help", dialect: "عراقي" },
  { text: "hello what can this custom model do", intent: "general_coding_help", dialect: "إنجليزي" },
  { text: "عرفني بنفسك وبسرعة المحرك العصبي", intent: "general_coding_help", dialect: "فصحى" },
];

// Dialect & Arabizi canonicalization dictionary
const DIALECT_SYNONYMS: Record<string, string> = {
  // Want / Need
  "عايز": "اريد", "عايزك": "اريد", "عاوز": "اريد", "عاوزك": "اريد",
  "ابغى": "اريد", "ابغا": "اريد", "ابي": "اريد", "ودي": "اريد",
  "بدي": "اريد", "بده": "اريد", "بغيت": "اريد", "نحب": "اريد",
  "3ayez": "اريد", "3awz": "اريد", "abgha": "اريد", "bdi": "اريد",
  // Create / Build
  "اعمل": "انشئ", "اعملي": "انشئ", "تعملي": "انشئ", "سوي": "انشئ",
  "سويلي": "انشئ", "سولي": "انشئ", "تسويلي": "انشئ", "ساوي": "انشئ",
  "ساويلنا": "انشئ", "صاوب": "انشئ", "تصاوب": "انشئ", "دير": "انشئ",
  "ابني": "انشئ", "اكتب": "انشئ", "صمم": "انشئ", "a3mel": "انشئ",
  "build": "انشئ", "create": "انشئ", "write": "انشئ", "generate": "انشئ",
  // Read / Show
  "وريني": "اعرض", "ورينا": "اعرض", "فرجيني": "اعرض", "شوف": "اعرض",
  "شوفلي": "اعرض", "شوفني": "اعرض", "اعرضلي": "اعرض", "اقرا": "اقرا",
  "افتح": "اقرا", "افتحلي": "اقرا", "اشوفه": "اقرا", "read": "اقرا",
  "show": "اعرض", "list": "اعرض", "open": "اقرا",
  // Search
  "دور": "ابحث", "دورلي": "ابحث", "فين": "ابحث", "وين": "ابحث",
  "فتش": "ابحث", "فتشلي": "ابحث", "قلب": "ابحث", "search": "ابحث",
  "find": "ابحث", "eb7ath": "ابحث",
  // Edit / Fix
  "عدل": "تعديل", "غير": "تعديل", "صلح": "تعديل", "صلحو": "تعديل",
  "زود": "تعديل", "حدث": "تعديل", "زبط": "تعديل", "زبطلي": "تعديل",
  "بدل": "تعديل", "edit": "تعديل", "update": "تعديل", "fix": "تعديل",
  // Run / Test
  "شغل": "تشغيل", "شغّل": "تشغيل", "جرب": "تشغيل", "اختبر": "تشغيل",
  "تختبره": "تشغيل", "وتختبره": "تشغيل", "نفذ": "تشغيل", "افحص": "تشغيل",
  "تفحصها": "تشغيل", "خدم": "تشغيل", "shaghal": "تشغيل", "run": "تشغيل",
  "test": "تشغيل", "tests": "تشغيل", "pytest": "تشغيل",
  // Explain
  "اشرح": "شرح", "اشرحلي": "شرح", "فهمني": "شرح", "احكيلي": "شرح",
  "شرحلي": "شرح", "حلل": "شرح", "explain": "شرح", "architecture": "شرح",
  // Domain targets
  "ملفات": "ملف", "الملفات": "ملف", "المجلدات": "ملف", "الدوسي": "ملف",
  "files": "ملف", "file": "ملف", "البروجي": "مشروع", "المشروع": "مشروع",
  "workspace": "مشروع", "codebase": "مشروع",
  "فاست": "fastapi", "ايبي": "api", "باك": "api", "سيرفر": "api",
  "خوارزميه": "خوارزمية", "فرز": "خوارزمية", "مصفوفات": "خوارزمية",
  "بنشمارك": "سرعة", "مليون": "سرعة", "سريعة": "سرعة", "سريع": "سرعة",
  "سكربت": "اداة", "تيرمينال": "تشغيل", "نواه": "نواة", "ويب": "صفحة",
};

export function normalizeArabicDialect(raw: string): {
  normalized: string;
  tokens: string[];
  canonicalTokens: string[];
  detectedDialectHint: string;
} {
  let text = raw
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // Remove Tashkeel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}._\-/ ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  let dialectHint = "فصحى / تقني";
  if (/(عايز|عاوز|ازاي|فين|النهارده|اعملي)/.test(text)) dialectHint = "مصري";
  else if (/(ابغى|ابي|سويلي|وش|ودي)/.test(text)) dialectHint = "خليجي / سعودي";
  else if (/(بدي|شو|ساويلنا|زبطلي|هيك)/.test(text)) dialectHint = "شامي";
  else if (/(بغيت|صاوب|كيفاش|ديال|واش|كاين)/.test(text)) dialectHint = "مغاربي";
  else if (/(شلونك|اريد|مال|شوفني)/.test(text)) dialectHint = "عراقي";
  else if (/[37]/.test(text) && /[a-z]/.test(text)) dialectHint = "عربيزي";

  const tokens = text.split(" ").filter(Boolean);
  const canonicalTokens = tokens.map((tok) => {
    if (DIALECT_SYNONYMS[tok]) return DIALECT_SYNONYMS[tok];
    // Strip common Arabic prefixes (و، ف، ب، ل، ال) for matching
    const stripped = tok.replace(/^(وال|فال|بال|كال|ال|و|ف|ب|ل)/, "");
    if (stripped.length >= 2 && DIALECT_SYNONYMS[stripped]) {
      return DIALECT_SYNONYMS[stripped];
    }
    return tok;
  });

  return {
    normalized: text,
    tokens,
    canonicalTokens,
    detectedDialectHint: dialectHint,
  };
}

function fnv1aHash(str: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export const INPUT_DIM = 256;
export const HIDDEN1_DIM = 128;
export const HIDDEN2_DIM = 64;
export const OUTPUT_DIM = INTENTS.length; // 12

export function featurizeText(raw: string): {
  vector: Float32Array;
  normalized: ReturnType<typeof normalizeArabicDialect>;
} {
  const norm = normalizeArabicDialect(raw);
  const vec = new Float32Array(INPUT_DIM);

  const addFeature = (key: string, weight: number) => {
    const h1 = fnv1aHash(key, 2166136261);
    const h2 = fnv1aHash(key, 374761393);
    const idx = h1 % INPUT_DIM;
    const sign = (h2 & 1) === 0 ? 1 : -1;
    vec[idx] += sign * weight;
  };

  // Canonical word unigrams (highest weight)
  for (const tok of norm.canonicalTokens) {
    addFeature("C:" + tok, 2.2);
  }
  // Canonical bigrams
  for (let i = 0; i < norm.canonicalTokens.length - 1; i++) {
    addFeature("B:" + norm.canonicalTokens[i] + "_" + norm.canonicalTokens[i + 1], 1.8);
  }
  // Raw token unigrams
  for (const tok of norm.tokens) {
    addFeature("W:" + tok, 1.0);
    // Character trigrams for robust morphology matching across dialects
    const padded = `^${tok}$`;
    for (let i = 0; i <= padded.length - 3; i++) {
      addFeature("3:" + padded.slice(i, i + 3), 0.45);
    }
  }
  // File extension & code cues
  if (/\.[a-z]{1,5}\b/.test(norm.normalized)) addFeature("HAS_FILENAME", 2.0);
  if (/(api|fastapi|express|rest|endpoint|crud|server)/.test(norm.normalized)) addFeature("CUE_API", 2.4);
  if (/(html|css|react|صفحة|واجهة|داشبورد|موقع)/.test(norm.normalized)) addFeature("CUE_WEB", 2.2);
  if (/(c\+\+|cpp|avx2|neon|simd|wasm|apk|exe|نواة|مليون)/.test(norm.normalized)) addFeature("CUE_NATIVE", 2.5);
  if (/(فرز|sort|prime|matrix|خوارزمية|benchmark|سرعة)/.test(norm.normalized)) addFeature("CUE_ALGO", 2.3);

  // L2 Normalize
  let normSq = 0;
  for (let i = 0; i < INPUT_DIM; i++) normSq += vec[i] * vec[i];
  const invNorm = normSq > 1e-8 ? 1 / Math.sqrt(normSq) : 1;
  for (let i = 0; i < INPUT_DIM; i++) vec[i] *= invNorm;

  return { vector: vec, normalized: norm };
}

export interface EpochStat {
  epoch: number;
  loss: number;
  accuracy: number;
}

export interface InferencePrediction {
  intent: AgentIntentId;
  labelAr: string;
  confidence: number;
  dialectHint: string;
  canonicalTokens: string[];
  probabilities: Array<{ intent: AgentIntentId; labelAr: string; prob: number }>;
  wasmInferenceMs: number;
  wasmFlops: number;
  slots: {
    filename: string | null;
    searchQuery: string | null;
    command: string | null;
    framework: string;
  };
}

class DeterministicRng {
  private state: number;
  constructor(seed = 133742) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  gaussian(std: number): number {
    const u1 = Math.max(1e-7, this.next());
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * std;
  }
}

// Memory layout inside WASM linear memory (byte offsets, all 16-byte aligned)
// Total weights + biases = 256*128 + 128 + 128*64 + 64 + 64*12 + 12 = 41,932 floats (~167.7 KiB)
const WASM_OFFSETS = {
  w1: 0,
  b1: 0 + HIDDEN1_DIM * INPUT_DIM * 4,
  w2: 0 + HIDDEN1_DIM * INPUT_DIM * 4 + HIDDEN1_DIM * 4,
  b2: 0 + HIDDEN1_DIM * INPUT_DIM * 4 + HIDDEN1_DIM * 4 + HIDDEN2_DIM * HIDDEN1_DIM * 4,
  w3: 0 + HIDDEN1_DIM * INPUT_DIM * 4 + HIDDEN1_DIM * 4 + HIDDEN2_DIM * HIDDEN1_DIM * 4 + HIDDEN2_DIM * 4,
  b3:
    0 +
    HIDDEN1_DIM * INPUT_DIM * 4 +
    HIDDEN1_DIM * 4 +
    HIDDEN2_DIM * HIDDEN1_DIM * 4 +
    HIDDEN2_DIM * 4 +
    OUTPUT_DIM * HIDDEN2_DIM * 4,
  x: 262144, // 256 KiB
  h1: 262144 + 4096,
  h2: 262144 + 8192,
  logits: 262144 + 12288,
};

export class NawaNeuralModel {
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
  w3: Float32Array;
  b3: Float32Array;
  corpus: TrainingSample[];
  lossHistory: EpochStat[];
  totalParams: number;
  trainedEpochs: number;
  private syncedToWasm: boolean;

  constructor() {
    this.w1 = new Float32Array(HIDDEN1_DIM * INPUT_DIM);
    this.b1 = new Float32Array(HIDDEN1_DIM);
    this.w2 = new Float32Array(HIDDEN2_DIM * HIDDEN1_DIM);
    this.b2 = new Float32Array(HIDDEN2_DIM);
    this.w3 = new Float32Array(OUTPUT_DIM * HIDDEN2_DIM);
    this.b3 = new Float32Array(OUTPUT_DIM);
    this.totalParams =
      this.w1.length + this.b1.length + this.w2.length + this.b2.length + this.w3.length + this.b3.length;
    this.corpus = [...INITIAL_TRAINING_CORPUS];
    this.lossHistory = [];
    this.trainedEpochs = 0;
    this.syncedToWasm = false;

    this.initWeights();
    this.trainEpochs(110, 0.14);
  }

  private initWeights(): void {
    const rng = new DeterministicRng(20261116);
    const s1 = Math.sqrt(2 / INPUT_DIM);
    const s2 = Math.sqrt(2 / HIDDEN1_DIM);
    const s3 = Math.sqrt(2 / HIDDEN2_DIM);
    for (let i = 0; i < this.w1.length; i++) this.w1[i] = rng.gaussian(s1);
    for (let i = 0; i < this.w2.length; i++) this.w2[i] = rng.gaussian(s2);
    for (let i = 0; i < this.w3.length; i++) this.w3[i] = rng.gaussian(s3);
    this.b1.fill(0.01);
    this.b2.fill(0.01);
    this.b3.fill(0);
  }

  trainEpochs(epochs = 60, lr = 0.12): EpochStat[] {
    const dataset = this.corpus.map((s) => ({
      x: featurizeText(s.text).vector,
      y: INTENTS.findIndex((meta) => meta.id === s.intent),
    }));

    const h1 = new Float32Array(HIDDEN1_DIM);
    const h2 = new Float32Array(HIDDEN2_DIM);
    const logits = new Float32Array(OUTPUT_DIM);
    const probs = new Float32Array(OUTPUT_DIM);
    const dLogits = new Float32Array(OUTPUT_DIM);
    const dh2 = new Float32Array(HIDDEN2_DIM);
    const dh1 = new Float32Array(HIDDEN1_DIM);

    const n = dataset.length;
    const recentStats: EpochStat[] = [];

    for (let ep = 1; ep <= epochs; ep++) {
      let totalLoss = 0;
      let correct = 0;

      for (let idx = 0; idx < n; idx++) {
        const { x, y } = dataset[idx];

        // Forward Layer 1
        for (let i = 0; i < HIDDEN1_DIM; i++) {
          let sum = this.b1[i];
          const off = i * INPUT_DIM;
          for (let j = 0; j < INPUT_DIM; j++) sum += this.w1[off + j] * x[j];
          h1[i] = sum > 0 ? sum : 0;
        }

        // Forward Layer 2
        for (let i = 0; i < HIDDEN2_DIM; i++) {
          let sum = this.b2[i];
          const off = i * HIDDEN1_DIM;
          for (let j = 0; j < HIDDEN1_DIM; j++) sum += this.w2[off + j] * h1[j];
          h2[i] = sum > 0 ? sum : 0;
        }

        // Forward Layer 3 + Softmax
        let maxLogit = -Infinity;
        for (let i = 0; i < OUTPUT_DIM; i++) {
          let sum = this.b3[i];
          const off = i * HIDDEN2_DIM;
          for (let j = 0; j < HIDDEN2_DIM; j++) sum += this.w3[off + j] * h2[j];
          logits[i] = sum;
          if (sum > maxLogit) maxLogit = sum;
        }

        let expSum = 0;
        for (let i = 0; i < OUTPUT_DIM; i++) {
          const e = Math.exp(logits[i] - maxLogit);
          probs[i] = e;
          expSum += e;
        }
        let predIdx = 0;
        for (let i = 0; i < OUTPUT_DIM; i++) {
          probs[i] /= expSum;
          if (probs[i] > probs[predIdx]) predIdx = i;
        }
        if (predIdx === y) correct++;
        totalLoss += -Math.log(Math.max(1e-7, probs[y]));

        // Backward Layer 3
        for (let i = 0; i < OUTPUT_DIM; i++) {
          dLogits[i] = (probs[i] - (i === y ? 1 : 0)) / n;
        }
        dh2.fill(0);
        for (let i = 0; i < OUTPUT_DIM; i++) {
          const g = dLogits[i];
          const off = i * HIDDEN2_DIM;
          this.b3[i] -= lr * g * n;
          for (let j = 0; j < HIDDEN2_DIM; j++) {
            dh2[j] += this.w3[off + j] * g;
            this.w3[off + j] -= lr * g * h2[j] * n;
          }
        }

        // Backward Layer 2
        dh1.fill(0);
        for (let i = 0; i < HIDDEN2_DIM; i++) {
          if (h2[i] <= 0) continue;
          const g = dh2[i];
          const off = i * HIDDEN1_DIM;
          this.b2[i] -= lr * g * n;
          for (let j = 0; j < HIDDEN1_DIM; j++) {
            dh1[j] += this.w2[off + j] * g;
            this.w2[off + j] -= lr * g * h1[j] * n;
          }
        }

        // Backward Layer 1
        for (let i = 0; i < HIDDEN1_DIM; i++) {
          if (h1[i] <= 0) continue;
          const g = dh1[i];
          const off = i * INPUT_DIM;
          this.b1[i] -= lr * g * n;
          for (let j = 0; j < INPUT_DIM; j++) {
            if (x[j] !== 0) {
              this.w1[off + j] -= lr * g * x[j] * n;
            }
          }
        }
      }

      this.trainedEpochs += 1;
      if (ep === 1 || ep % 10 === 0 || ep === epochs) {
        const stat: EpochStat = {
          epoch: this.trainedEpochs,
          loss: Number((totalLoss / n).toFixed(4)),
          accuracy: Number(((correct / n) * 100).toFixed(1)),
        };
        this.lossHistory.push(stat);
        recentStats.push(stat);
      }
    }

    this.syncedToWasm = false;
    return recentStats;
  }

  async syncToWasm(): Promise<void> {
    const kernel = await getWasmKernel();
    const f32 = new Float32Array(kernel.memory.buffer);
    f32.set(this.w1, WASM_OFFSETS.w1 >>> 2);
    f32.set(this.b1, WASM_OFFSETS.b1 >>> 2);
    f32.set(this.w2, WASM_OFFSETS.w2 >>> 2);
    f32.set(this.b2, WASM_OFFSETS.b2 >>> 2);
    f32.set(this.w3, WASM_OFFSETS.w3 >>> 2);
    f32.set(this.b3, WASM_OFFSETS.b3 >>> 2);
    this.syncedToWasm = true;
  }

  async predict(rawText: string): Promise<InferencePrediction> {
    const kernel = await getWasmKernel();
    if (!this.syncedToWasm) {
      await this.syncToWasm();
    }

    const { vector, normalized } = featurizeText(rawText);
    const f32 = new Float32Array(kernel.memory.buffer);
    f32.set(vector, WASM_OFFSETS.x >>> 2);

    const t0 = performance.now();
    const flops1 = kernel.matvecRelu(
      WASM_OFFSETS.w1,
      WASM_OFFSETS.x,
      WASM_OFFSETS.b1,
      WASM_OFFSETS.h1,
      HIDDEN1_DIM,
      INPUT_DIM,
      1
    );
    const flops2 = kernel.matvecRelu(
      WASM_OFFSETS.w2,
      WASM_OFFSETS.h1,
      WASM_OFFSETS.b2,
      WASM_OFFSETS.h2,
      HIDDEN2_DIM,
      HIDDEN1_DIM,
      1
    );
    const flops3 = kernel.matvecRelu(
      WASM_OFFSETS.w3,
      WASM_OFFSETS.h2,
      WASM_OFFSETS.b3,
      WASM_OFFSETS.logits,
      OUTPUT_DIM,
      HIDDEN2_DIM,
      0
    );
    const t1 = performance.now();

    const logitsOffset = WASM_OFFSETS.logits >>> 2;
    const logits = Array.from(f32.subarray(logitsOffset, logitsOffset + OUTPUT_DIM));
    const maxLogit = Math.max(...logits);
    const exps = logits.map((v) => Math.exp(v - maxLogit));
    const expSum = exps.reduce((a, b) => a + b, 0);

    const probs = INTENTS.map((meta, idx) => ({
      intent: meta.id,
      labelAr: meta.labelAr,
      prob: Number((exps[idx] / expSum).toFixed(4)),
    })).sort((a, b) => b.prob - a.prob);

    const top = probs[0];
    const slots = extractSlots(rawText, normalized.normalized);

    return {
      intent: top.intent,
      labelAr: top.labelAr,
      confidence: top.prob,
      dialectHint: normalized.detectedDialectHint,
      canonicalTokens: normalized.canonicalTokens,
      probabilities: probs,
      wasmInferenceMs: Number(Math.max(0.01, t1 - t0).toFixed(3)),
      wasmFlops: flops1 + flops2 + flops3,
      slots,
    };
  }

  addSampleAndRetrain(text: string, intent: AgentIntentId, dialect = "مخصص"): EpochStat[] {
    this.corpus.push({ text, intent, dialect });
    return this.trainEpochs(45, 0.14);
  }

  exportWeightsBinary(): Uint8Array {
    // Header: magic "NAWA" (4B) + dims (4 x uint32 = 16B) + weights float32
    const headerSize = 20;
    const totalFloats = this.totalParams;
    const buf = new ArrayBuffer(headerSize + totalFloats * 4);
    const view = new DataView(buf);
    view.setUint8(0, 0x4e); // N
    view.setUint8(1, 0x41); // A
    view.setUint8(2, 0x57); // W
    view.setUint8(3, 0x41); // A
    view.setUint32(4, INPUT_DIM, true);
    view.setUint32(8, HIDDEN1_DIM, true);
    view.setUint32(12, HIDDEN2_DIM, true);
    view.setUint32(16, OUTPUT_DIM, true);

    const outF32 = new Float32Array(buf, headerSize);
    let offset = 0;
    outF32.set(this.w1, offset); offset += this.w1.length;
    outF32.set(this.b1, offset); offset += this.b1.length;
    outF32.set(this.w2, offset); offset += this.w2.length;
    outF32.set(this.b2, offset); offset += this.b2.length;
    outF32.set(this.w3, offset); offset += this.w3.length;
    outF32.set(this.b3, offset);
    return new Uint8Array(buf);
  }
}

function extractSlots(raw: string, normalized: string) {
  const fileMatch = raw.match(/([a-zA-Z0-9_\-/]+\.(?:py|js|ts|tsx|html|css|json|md|cpp|h|kt|txt))/);
  const cmdMatch = raw.match(/`([^`]+)`/);

  let searchQuery: string | null = null;
  const searchPattern = raw.match(/(?:دورلي على|دور على|ابحث عن|فين|وين|فتشلي على|search(?: code)?(?: for)?)\s+(?:كلمة|دالة|متغير|كلاس)?\s*([^\s،؟]+)/i);
  if (searchPattern && searchPattern[1]) {
    searchQuery = searchPattern[1].replace(/["'`]/g, "");
  }

  let framework = "python";
  if (/node|express|typescript|javascript/i.test(normalized)) framework = "node";
  else if (/c\+\+|cpp|avx2|neon/i.test(normalized)) framework = "cpp";
  else if (/html|css|web|صفحة/i.test(normalized)) framework = "web";

  return {
    filename: fileMatch ? fileMatch[1] : null,
    searchQuery,
    command: cmdMatch ? cmdMatch[1] : null,
    framework,
  };
}

let singletonModel: NawaNeuralModel | null = null;

export function getNawaModel(): NawaNeuralModel {
  if (!singletonModel) {
    singletonModel = new NawaNeuralModel();
  }
  return singletonModel;
}
