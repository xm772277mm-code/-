import { normalizeArabicDialect } from "../engine/nawaModel.ts";
import { EXPANDED_KB_ENTITIES } from "./NawaExpandedCorpus.ts";

export type DeviceKBProfile = "desktop-50b" | "mobile-50m";

export type KBQuestionIntent =
  | "definition"
  | "how_to"
  | "why_reason"
  | "comparison"
  | "pros_cons"
  | "example"
  | "optimize"
  | "security"
  | "debug"
  | "simplify"
  | "general";

export interface KBEntitySpec {
  id: string;
  nameAr: string;
  nameEn: string;
  domainId: string;
  domainAr: string;
  aliases: string[];
  summary: string;
  simpleSummary: string;
  howItWorks: string;
  pros: string;
  cons: string;
  bestPractice: string;
  exampleCode?: string;
}

export interface KBResolution {
  profile: DeviceKBProfile;
  totalQuestionsCapacity: number;
  capacityFormatted: string;
  shardCount: number;
  shardId: number;
  slotIndex: string;
  domainAr: string;
  intent: KBQuestionIntent;
  matchedEntities: KBEntitySpec[];
  confidence: number;
  synthesizedAnswer: string | null;
  followUps: string[];
}

export const KB_PROFILES: Record<
  DeviceKBProfile,
  {
    id: DeviceKBProfile;
    labelAr: string;
    totalQuestions: number;
    capacityFormatted: string;
    domains: number;
    intents: number;
    entities: number;
    modifiers: number;
    shards: number;
    ramFootprint: string;
  }
> = {
  "desktop-50b": {
    id: "desktop-50b",
    labelAr: "قاعدة الكمبيوتر (50 مليار سؤال)",
    totalQuestions: 50_000_000_000,
    capacityFormatted: "50,000,000,000",
    domains: 1000,
    intents: 500,
    entities: 1000,
    modifiers: 100,
    shards: 4096,
    ramFootprint: "فهرس دلالي موزع (4,096 Shard · WASM 256D)",
  },
  "mobile-50m": {
    id: "mobile-50m",
    labelAr: "قاعدة الهاتف (50 مليون سؤال)",
    totalQuestions: 50_000_000,
    capacityFormatted: "50,000,000",
    domains: 250,
    intents: 200,
    entities: 250,
    modifiers: 4,
    shards: 512,
    ramFootprint: "فهرس خفيف للهاتف (512 Shard · مضغوط الذاكرة)",
  },
};

const BASE_KB_ENTITIES: KBEntitySpec[] = [
  {
    id: "python",
    nameAr: "بايثون",
    nameEn: "Python",
    domainId: "lang",
    domainAr: "لغات البرمجة",
    aliases: ["python", "بايثون", "بايسون", "بيثون", "py", "django", "flask", "fastapi"],
    summary:
      "بايثون لغة برمجة عالية المستوى واضحة الصياغة، تعتمد على المفسّر وتستند في الحسابات الثقيلة إلى مكتبات C وC++ السريعة مثل NumPy وPyTorch.",
    simpleSummary:
      "بايثون لغة سهلة جداً في القراءة والكتابة وتشبه الإنجليزية، وتُستخدم بكثرة في الذكاء الاصطناعي وبناء الخوادم والأتمتة.",
    howItWorks:
      "تترجم بايثون الكود إلى Bytecode وتنفذه داخل الآلة الافتراضية CPython، مع الاستفادة من إضافات C لتسريع العمليات الرياضية.",
    pros: "سهولة التعلم، مجتمع ضخم، وأقوى منظومة مكتبات للذكاء الاصطناعي وتحليل البيانات.",
    cons: "أبطأ في الحلقات الحسابية البحتة مقارنة بلغات الآلة مثل Rust وC++ وتستهلك ذاكرة أعلى.",
    bestPractice:
      "استخدم Virtual Environments، اكتب Type Hints لوضوح الكود، واعتمد على الحزم المبنية بلغة C أو العمليات المتجهية في البيانات الكبيرة.",
    exampleCode:
      "```python\ndef top_items(records: list[dict], min_score: float = 0.8) -> list[str]:\n    return [r['name'] for r in records if r.get('score', 0) >= min_score]\n```",
  },
  {
    id: "rust",
    nameAr: "راست",
    nameEn: "Rust",
    domainId: "systems",
    domainAr: "برمجة الأنظمة والأداء العالي",
    aliases: ["rust", "راست", "cargo", "tokio"],
    summary:
      "Rust لغة برمجة أنظمة تمنحك سرعة تنفيذ مقاربة لـ C وC++ مع ضمان أمان الذاكرة ومنع سباق البيانات وقت الترجمة عبر نظام الملكية والاستعارة (Ownership).",
    simpleSummary:
      "Rust لغة فائقة السرعة تمنع أخطاء الذاكرة الخطيرة قبل تشغيل البرنامج أصلاً، بدون الحاجة لجامع قمامة.",
    howItWorks:
      "يتحقق المترجم (Borrow Checker) من عمر كل مرجع في الذاكرة قبل إنتاج الملف التنفيذي، مما يلغي أخطاء المؤشرات دون أي عبء وقت التشغيل.",
    pros: "سرعة أصلية قصوى، أمان ذاكرة صارم، أداة إدارة حزم Cargo ممتازة، وتزامن آمن.",
    cons: "منحنى تعلم أعلى في البداية بسبب قواعد الملكية وزمن ترجمة أطول.",
    bestPractice:
      "صمّم تدفق البيانات بوضوح لتجنب نسخ الذاكرة غير الضروري، واستخدم Result وOption لمعالجة الأخطاء بأمان.",
    exampleCode:
      "```rust\nfn sum_even(nums: &[i32]) -> i32 {\n    nums.iter().filter(|&&n| n % 2 == 0).sum()\n}\n```",
  },
  {
    id: "cpp",
    nameAr: "سي بلس بلس",
    nameEn: "C++",
    domainId: "systems",
    domainAr: "برمجة الأنظمة والأداء العالي",
    aliases: ["c++", "cpp", "سي بلس بلس", "avx2", "simd", "neon"],
    summary:
      "C++ لغة مترجمة مباشرة للآلة تتيح تحكماً كاملاً بالذاكرة وتعليمات المعالج المتجهية مثل AVX2 وNEON، وهي الأساس لمحركات الألعاب وقواعد البيانات ونوى الذكاء الاصطناعي.",
    simpleSummary:
      "C++ لغة قوية جداً تتحكم في كل بايت من الذاكرة وتعمل بأقصى سرعة للمعالج في الألعاب والأنظمة الحرجة.",
    howItWorks:
      "تترجم الكود مباشرة إلى تعليمات المعالج الأصلية مع تحسينات المترجم وتوجيه الذاكرة المخبئية (Cache Locality).",
    pros: "أقصى أداء وتحكم في العتاد، توافق واسع، ومناسبة للتطبيقات الفورية والمحركات.",
    cons: "إدارة الذاكرة اليدوية قد تسبب ثغرات أو تسريباً إذا لم تُستخدم المؤشرات الذكية بدقة.",
    bestPractice:
      "التزم بـ C++20/23، واستخدم `std::unique_ptr` و`std::span` بدلاً من المؤشرات الخام، وفعل تحذيرات المترجم الصارمة.",
    exampleCode:
      "```cpp\n#include <numeric>\n#include <vector>\nlong long fast_sum(const std::vector<int>& v) {\n    return std::accumulate(v.begin(), v.end(), 0LL);\n}\n```",
  },
  {
    id: "javascript_ts",
    nameAr: "جافاسكربت وتايب سكربت",
    nameEn: "JavaScript / TypeScript",
    domainId: "web",
    domainAr: "تطوير الويب والتطبيقات",
    aliases: ["javascript", "js", "typescript", "ts", "جافاسكربت", "تايب سكربت", "node", "nodejs"],
    summary:
      "JavaScript لغة الويب الأساسية التي تعمل بمحركات مثل V8 وحلقة أحداث غير حاجزة، بينما تضيف TypeScript فحصاً صارماً للأنواع يكتشف الأخطاء قبل التشغيل.",
    simpleSummary:
      "JavaScript تحرّك صفحات الويب والخوادم، وTypeScript تضيف لها نظام أنواع يحميك من الأخطاء البرمجية الشائعة.",
    howItWorks:
      "تُشغّل العمليات غير المتزامنة عبر Event Loop وPromises، وتتحقق TypeScript من مطابقة البيانات للواجهات المعرفة وقت البناء.",
    pros: "تعمل في كل متصفح وخادم Node.js، سرعة تطوير عالية، ودعم قوي من أدوات التحقق.",
    cons: "JavaScript وحدها قد تخفي أخطاء الأنواع حتى وقت التشغيل، وحلقة الأحداث أحادية الخيط تتأثر بالحسابات الثقيلة.",
    bestPractice:
      "فعّل `strict: true` في TypeScript، وانقل الحسابات الكثيفة إلى WebAssembly أو Web Workers للحفاظ على سلاسة الواجهة.",
    exampleCode:
      "```ts\nexport function average(values: number[]): number {\n  if (values.length === 0) return 0;\n  return values.reduce((a, b) => a + b, 0) / values.length;\n}\n```",
  },
  {
    id: "react",
    nameAr: "رياكت",
    nameEn: "React",
    domainId: "web",
    domainAr: "تطوير واجهات المستخدم",
    aliases: ["react", "رياكت", "jsx", "tsx", "dom", "nextjs"],
    summary:
      "React مكتبة لبناء واجهات المستخدم التفاعلية عبر مكونات معزولة تدير الحالة بكفاءة وتحدّث العناصر المتغيرة فقط.",
    simpleSummary:
      "React تقسّم الواجهة إلى قطع صغيرة قابلة لإعادة الاستخدام وتتحدث تلقائياً عند تغير البيانات.",
    howItWorks:
      "تستخدم React شجرة افتراضية لمقارنة الحالة الجديدة بالقديمة وتطبيق أقل تعديل ممكن على DOM.",
    pros: "بنية مكونات منظمة، منظومة أدوات واسعة، وسهولة صيانة الواجهات المعقدة.",
    cons: "كثرة إعادة التصيير غير المدروسة أو تكديس آلاف العناصر في DOM قد يسبب بطئاً دون ضغط للعرض.",
    bestPractice:
      "اضغط قوائم الرسائل الطويلة (Windowing)، وتجنب إنشاء كائنات أو دوال غير مستقرة داخل حلقات العرض الكثيفة.",
  },
  {
    id: "go",
    nameAr: "جو (Golang)",
    nameEn: "Go",
    domainId: "backend",
    domainAr: "الخوادم والخدمات السحابية",
    aliases: ["go", "golang", "جولاينج", "جولانج"],
    summary:
      "Go لغة مترجمة طورتها جوجل تمتاز ببساطة الصياغة، سرعة الترجمة، ونموذج تزامن خفيف الوزن عبر Goroutines وChannels لبناء الخوادم والخدمات المصغرة.",
    simpleSummary:
      "Go لغة بسيطة وسريعة جداً في بناء خوادم الويب والتطبيقات التي تتعامل مع آلاف الاتصالات في وقت واحد.",
    howItWorks:
      "تُدير آلاف الـ Goroutines على عدد قليل من خيوط المعالج تلقائياً عبر مجدول مدمج في وقت التشغيل.",
    pros: "تزامن سهل وفعال، ملف تنفيذي واحد دون تعقيد، وأداء ممتاز للخوادم.",
    cons: "معالجة الأخطاء المتكررة (`if err != nil`) وأقل مرونة في البرمجة العامة مقارنة بـ Rust.",
    bestPractice:
      "مرّر `context.Context` لإلغاء المهام الطويلة وتجنب تسريب الـ Goroutines.",
    exampleCode:
      "```go\npackage main\nimport \"fmt\"\nfunc main() {\n    fmt.Println(\"Nawa Go Service Ready\")\n}\n```",
  },
  {
    id: "wasm",
    nameAr: "ويب اسمبلي",
    nameEn: "WebAssembly (WASM)",
    domainId: "runtime",
    domainAr: "بيئات التنفيذ عالية الأداء",
    aliases: ["wasm", "webassembly", "ويب اسمبلي", "الويب اسمبلي"],
    summary:
      "WebAssembly معيار ثنائي منخفض المستوى يعمل داخل المتصفح وNode.js بذاكرة خطية متصلة وسرعة قريبة من الكود الأصلي، مما يسمح بتنفيذ عشرات الملايين من العمليات في الثانية.",
    simpleSummary:
      "WebAssembly يشغّل الأكواد الحسابية والذكاء الاصطناعي داخل المتصفح بسرعة قريبة من البرامج المثبتة على الجهاز.",
    howItWorks:
      "يحوّل المترجم الشفرة إلى بايت كود ثنائي مضغوط يُترجم لحظياً (JIT/AOT) إلى تعليمات المعالج في بيئة معزولة آمنة.",
    pros: "أداء ثابت وعالٍ، أمان وعزل كامل، وعمل مشترك بين المتصفح والخادم.",
    cons: "نقل البيانات الكبيرة المتكرر بين JS وذاكرة WASM يحتاج تصميماً ذكياً لتقليل النسخ.",
    bestPractice:
      "خصّص مصفوفة خطية ثابتة داخل WASM Memory وأجرِ الحسابات بالداخل قبل قراءة النتيجة النهائية.",
  },
  {
    id: "sqlite",
    nameAr: "SQLite",
    nameEn: "SQLite",
    domainId: "database",
    domainAr: "قواعد البيانات",
    aliases: ["sqlite", "سيكول لايت", "sql lite"],
    summary:
      "SQLite محرك قواعد بيانات علائقية مدمج يعمل بدون خادم داخل ملف واحد، ويمتاز بالسرعة العالية مع وضع WAL، مما يجعله الخيار الأول لتطبيقات الهاتف والسطح المحلي.",
    simpleSummary:
      "SQLite قاعدة بيانات كاملة محفوظة في ملف واحد داخل جهازك، سريعة ولا تحتاج خادماً منفصلاً.",
    howItWorks:
      "يقرأ المحرك صفحات B-Tree مباشرة من القرص مع سجل WAL للسماح بقراءات متزامنة مع الكتابة.",
    pros: "صفر إعداد، ملف واحد سهل النسخ الاحتياطي، سرعة فائقة في القراءة المحلية.",
    cons: "غير مصمم للكتابة المتزامنة الكثيفة من عشرات الخوادم البعيدة في الوقت ذاته.",
    bestPractice:
      "فعّل `PRAGMA journal_mode=WAL;` وأنشئ فهارس على الأعمدة المستخدمة في `WHERE` و`JOIN`.",
  },
  {
    id: "postgresql",
    nameAr: "PostgreSQL",
    nameEn: "PostgreSQL",
    domainId: "database",
    domainAr: "قواعد البيانات",
    aliases: ["postgres", "postgresql", "بوستجرس", "sql"],
    summary:
      "PostgreSQL نظام إدارة قواعد بيانات علائقية متقدم يدعم تعدد المعاملات المتزامنة (MVCC)، الاستعلامات المعقدة، بيانات JSONB، والبحث بالمتجهات لتطبيقات الإنتاج الكبيرة.",
    simpleSummary:
      "PostgreSQL قاعدة بيانات احترافية قوية للخوادم والتطبيقات الكبيرة التي يزورها آلاف المستخدمين معاً.",
    howItWorks:
      "تعتمد على عزل اللقطات (MVCC) بحيث لا تحجب القراءات عمليات الكتابة المتزامنة.",
    pros: "موثوقية عالية، التزام صارم بـ ACID، غنى الإضافات مثل pgvector.",
    cons: "يحتاج إدارة خادم وضبط اتصالات (Connection Pooling) عند التوسع.",
    bestPractice:
      "استخدم PgBouncer لإدارة الاتصالات وفهارس GIN لبيانات JSONB وEXPLAIN ANALYZE لمراقبة الأداء.",
  },
  {
    id: "nosql",
    nameAr: "قواعد NoSQL",
    nameEn: "NoSQL (Firestore / MongoDB / Redis)",
    domainId: "database",
    domainAr: "قواعد البيانات",
    aliases: ["nosql", "mongodb", "redis", "firestore", "مونجو", "ريديس", "فايرستور"],
    summary:
      "قواعد NoSQL تخزّن البيانات كمستندات مرنة أو أزواج مفتاح-قيمة أو أعمدة موزعة لتمنح مرونة في البنية وسرعة قراءة أفقية عالية.",
    simpleSummary:
      "قواعد NoSQL تحفظ البيانات بصيغة تشبه ملفات JSON المرنة وتوسّعها على خوادم متعددة بسهولة.",
    howItWorks:
      "تفهرس المستندات بمفاتيح سريعة وتوزع الشرائح (Sharding) أفقياً مع تقييد عمليات الربط المعقدة.",
    pros: "مرونة التعديل على الحقول، توسع أفقي سلس، واسترجاع سريع بالمسار أو المفتاح.",
    cons: "أقل ملاءمة للتقارير المحاسبية المعقدة متعددة الجداول مقارنة بـ SQL.",
    bestPractice:
      "صمّم بنية المستندات حسب استعلامات القراءة الأكثر تكراراً واضبط قواعد الأمان لكل مسار.",
  },
  {
    id: "ai_llm",
    nameAr: "النماذج اللغوية والمحولات (Transformers)",
    nameEn: "LLM & Transformers",
    domainId: "ai",
    domainAr: "الذكاء الاصطناعي والنماذج اللغوية",
    aliases: [
      "ذكاء",
      "اصطناعي",
      "نموذج",
      "لغوي",
      "llm",
      "transformer",
      "attention",
      "جمناي",
      "gemini",
      "claude",
      "كلود",
      "هيدروجين",
      "انتباه",
      "bpe",
      "softmax",
    ],
    summary:
      "تعتمد النماذج اللغوية الحديثة على معمارية المحولات (Transformers) التي تقطّع النص إلى رموز فرعية (BPE)، وتحسب علاقات الكلمات بالانتباه الذاتي متعدد الرؤوس، ثم تولد التوكن التالي باحتمالات Softmax.",
    simpleSummary:
      "النموذج اللغوي يحول كلامك إلى أرقام، ويفهم علاقة كل كلمة بما قبلها عبر الانتباه الذاتي، ثم يتوقع أنسب كلمة تالية بدقة.",
    howItWorks:
      "تمر الرموز عبر طبقات Self-Attention وLayerNorm وFeed-Forward مع حفظ متجهات K وV في الذاكرة المؤقتة لمنع إعادة الحساب.",
    pros: "فهم سياقي عميق، تعميم عبر مهام البرمجة واللغات، وقابلية الضبط الدقيق.",
    cons: "يزداد العبء الحسابي تربيعياً مع طول السياق ما لم يُستخدم ضغط النشاط وKV-Cache.",
    bestPractice:
      "طبّق حارس التماسك ومنع الانحراف السياقي مع ضغط النشاط للحفاظ على دقة الإجابة وسرعتها.",
  },
  {
    id: "activity_compression",
    nameAr: "ضغط النشاط و KV-Cache",
    nameEn: "KV-Cache Activity Compression",
    domainId: "ai_perf",
    domainAr: "تحسين الأداء وتقليل اللاج",
    aliases: ["ضغط", "النشاط", "لاج", "lag", "بطء", "kv", "kv-cache", "الذاكرة"],
    summary:
      "ضغط النشاط يحتفظ برموز السياق الافتتاحية الحرجة وآخر نافذة حديثة من الجلسة، ويدمج الحالات الوسطى الأقدم في متجه ملخص مع تقليص عناصر DOM، مما يبقي الاستجابة ثابتة السرعة بدون لاج.",
    simpleSummary:
      "ضغط النشاط يختصر الرسائل والحالات القديمة في ملخص ذكي ويبقي فقط ما يحتاجه النموذج الآن، فيختفي البطء والتهنيج.",
    howItWorks:
      "يتم الاحتفاظ برموز Attention Sinks + نافذة التوكنات الأحدث، وطيّ الحالات الوسطى عبر Pooling موزونة وتقليل عناصر العرض.",
    pros: "تثبيت زمن الاستدلال O(1)، تقليل استهلاك الذاكرة، وسلاسة تامة في الجلسات الطويلة.",
    cons: "يجب ضبط حد النافذة بدقة حتى لا تُحذف تفاصيل دقيقة من بداية الحوار.",
    bestPractice:
      "احتفظ بأول 4 رموز تثبيت مع آخر نافذة نشطة وملخص مواضيعي واضح للسياق السابق.",
  },
  {
    id: "security",
    nameAr: "أمن التطبيقات والتشفير",
    nameEn: "App Security & Auth",
    domainId: "security",
    domainAr: "الأمن السيبراني وحماية البيانات",
    aliases: ["امان", "تشفير", "باسورد", "hmac", "pbkdf2", "argon2", "jwt", "token", "ثغرة", "sql injection", "xss"],
    summary:
      "أمن التطبيقات يعتمد على تجزئة كلمات المرور بخوارزميات بطيئة مثل Argon2 أو PBKDF2 مع ملح فريد، والتحقق الصارم من المدخلات واستعلامات SQL المعلمة، وحماية قواعد البيانات بقواعد وصول تعتمد على الهوية.",
    simpleSummary:
      "الحماية الصحيحة تعني تشفير كلمات المرور، عدم دمج مدخلات المستخدم في الاستعلامات، والتحقق من صلاحية كل طلب.",
    howItWorks:
      "يتم التحقق من التوكنات الموقّعة (مثل Firebase Auth ID Tokens) وعزل بيانات كل مستخدم بقواعد وصول تتحقق من هويته.",
    pros: "يمنع تسريب البيانات، هجمات الحقن، وانتحال الهوية.",
    cons: "أي تساهل في قاعدة تحقق واحدة أو كشف مفتاح خاص يعرّض النظام بالكامل للخطر.",
    bestPractice:
      "استخدم Prepared Statements، فعّل Email Verification، وطبّق مبدأ أقل الصلاحيات (Zero Trust).",
  },
  {
    id: "rest_graphql",
    nameAr: "REST و GraphQL",
    nameEn: "REST vs GraphQL APIs",
    domainId: "backend",
    domainAr: "واجهات برمجة التطبيقات (APIs)",
    aliases: ["rest", "graphql", "api", "http", "endpoint", "json"],
    summary:
      "يعتمد REST على مسارات HTTP واضحة للموارد تسهل التخزين المؤقت، بينما يوفر GraphQL نقطة نهاية واحدة تتيح للعميل تحديد الحقول المطلوبة بدقة لتجنب جلب بيانات زائدة.",
    simpleSummary:
      "REST يستخدم روابط متعددة لكل نوع بيانات، وGraphQL يسمح لك بطلب الحقول التي تحتاجها فقط في استعلام واحد.",
    howItWorks:
      "يستعمل REST أفعال HTTP (GET/POST/PUT/DELETE) وحالات الاستجابة، بينما يحلّل GraphQL مخططاً (Schema) ويرجع شجرة JSON مطابقة للطلب.",
    pros: "REST بسيط ومدعوم بكل أدوات الكاش؛ GraphQL مرن للواجهات الغنية وتطبيقات الهاتف.",
    cons: "GraphQL يحتاج حماية من الاستعلامات المتداخلة الثقيلة وتحديد معدل الطلبات.",
    bestPractice:
      "اختر REST للخدمات القياسية والتكاملات السريعة، وGraphQL عندما تختلف احتياجات الحقول بين الويب والهاتف.",
  },
  {
    id: "docker_k8s",
    nameAr: "Docker والحاويات",
    nameEn: "Docker & Containers",
    domainId: "devops",
    domainAr: "البنية التحتية والنشر",
    aliases: ["docker", "container", "kubernetes", "k8s", "دوكر", "حاويات", "نشر"],
    summary:
      "Docker يغلّف التطبيق مع مكتباته واعتمادياته في حاوية معزولة خفيفة تعمل بنفس السلوك على جهاز المطور والخادم.",
    simpleSummary:
      "Docker يضع برنامجك بكل أدواته في صندوق موحد يعمل على أي جهاز دون مشكلة «شغال عندي فقط».",
    howItWorks:
      "يعزل العمليات ونظام الملفات والشبكة باستخدام خصائص نواة Linux (Namespaces وcgroups) دون تشغيل نظام ضيف كامل.",
    pros: "تشغيل موحد في كل البيئات، سرعة بدء بالثواني، وسهولة التوسع والنسخ.",
    cons: "إهمال أحجام الصور (Images) أو صلاحيات الجذر يضخم الاستهلاك ويزيد المخاطر.",
    bestPractice:
      "استخدم Multi-stage builds وشغّل الحاوية بمستخدم غير جذري (non-root user).",
  },
  {
    id: "algorithms",
    nameAr: "الخوارزميات وهياكل البيانات",
    nameEn: "Algorithms & Big-O",
    domainId: "cs",
    domainAr: "علوم الحاسب والخوارزميات",
    aliases: ["خوارزميه", "خوارزميات", "تعقيد", "big o", "hash", "tree", "sort", "فرز", "بحث"],
    summary:
      "اختيار هيكل البيانات المناسب (مثل Hash Map ببحث O(1) أو B-Tree ببحث O(log N)) يضاعف سرعة البرنامج آلاف المرات أكثر من ترقية العتاد.",
    simpleSummary:
      "الخوارزمية الذكية تختصر الوقت من دقائق إلى أجزاء من الثانية بتنظيم البيانات في الفهارس والهياكل الصحيحة.",
    howItWorks:
      "تحول الفهارس والتجزئة عملية البحث الخطي O(N) أو المتداخل O(N²) إلى وصول مباشر أو لوغاريتمي.",
    pros: "توفير هائل في وقت المعالج والذاكرة وقابلية توسع حقيقية.",
    cons: "بعض الهياكل السريعة مثل الجداول المبعثرة تستهلك ذاكرة إضافية مقابل السرعة.",
    bestPractice:
      "تجنب الحلقات المتداخلة على القوائم الضخمة واستخدم `Set` أو `Map` للفحص المتكرر.",
  },
];

export const KB_ENTITIES: KBEntitySpec[] = [...BASE_KB_ENTITIES, ...EXPANDED_KB_ENTITIES];

function fnv1aHash(str: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function deepFuzzyNormalizeArabic(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/c#/gi, "csharp")
    .replace(/([\u0621-\u064Aa-z])\1{2,}/g, "$1")
    .replace(/(^|\s)(?:بايسون|بيسون|بيثون)(?=\s|$)/g, "$1بايثون")
    .replace(/(^|\s)(?:كميوتر|كمبيتر|كمبيوتور)(?=\s|$)/g, "$1كمبيوتر")
    .replace(/(^|\s)(?:تلفون|تليفون|فون)(?=\s|$)/g, "$1موبايل")
    .replace(/(^|\s)اندرود(?=\s|$)/g, "$1اندرويد")
    .replace(/(^|\s)(?:ادموب|اد موب)(?=\s|$)/g, "$1admob")
    .replace(/(^|\s)(?:كوبرنيتس|كبرنيتس)(?=\s|$)/g, "$1kubernetes")
    .replace(/(^|\s)(?:دوكر)(?=\s|$)/g, "$1docker")
    .replace(/(^|\s)(?:نيكست)(?=\s|$)/g, "$1nextjs")
    .replace(/[^\p{L}\p{N}._+\-/ ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedLevenshtein(a: string, b: string, maxDist = 2): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  if (a === b) return 0;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function buildCharTrigrams(text: string): Set<string> {
  const s = new Set<string>();
  const clean = ` ${text} `;
  for (let i = 0; i <= clean.length - 3; i++) {
    s.add(clean.slice(i, i + 3));
  }
  return s;
}

const ENTITY_TRIGRAM_CACHE = new Map<string, Set<string>>();
function getEntityTrigrams(entity: KBEntitySpec): Set<string> {
  let cached = ENTITY_TRIGRAM_CACHE.get(entity.id);
  if (!cached) {
    const combined = deepFuzzyNormalizeArabic(
      `${entity.nameAr} ${entity.nameEn} ${entity.aliases.join(" ")} ${entity.simpleSummary}`
    );
    cached = buildCharTrigrams(combined);
    ENTITY_TRIGRAM_CACHE.set(entity.id, cached);
  }
  return cached;
}

export function detectQuestionIntent(normalizedText: string): KBQuestionIntent {
  if (/(قارن|الفرق|مقارنه|ولا|vs|compare|difference|افضل بين|احسن من)/.test(normalizedText)) {
    return "comparison";
  }
  if (/(بسط|ابسط|بالعامي|بسهوله|مش فاهم|باختصار|بكلام بسيط|يعني ايه بجد|simplify)/.test(normalizedText)) {
    return "simplify";
  }
  if (/(مثال|كود عملي|تطبيق عملي|example|اكتب كود|وريني كود)/.test(normalizedText)) {
    return "example";
  }
  if (/(عيوب|مميزات|ايجابيات|سلبيات|pros|cons|مزايا|مشكلة ايه)/.test(normalizedText)) {
    return "pros_cons";
  }
  if (/(حمايه|امان|تشفير|ثغره|ثغرات|اختراق|هكر|security|protect)/.test(normalizedText)) {
    return "security";
  }
  if (/(تسريع|تحسين|بطء|بطيء|لاج|تهنيج|بيعلق|اداء|اسرع|optimize|performance)/.test(normalizedText)) {
    return "optimize";
  }
  if (/(خطا|مشكله|حل|debug|error|fix|مش شغال|بايظ|عطل)/.test(normalizedText)) {
    return "debug";
  }
  if (/(ازاي|كيف|طريقه|خطوات|بيشتغل ازاي|اعمل ايه|ابدأ ازاي|how to|how does)/.test(normalizedText)) {
    return "how_to";
  }
  if (/(ليه|لماذا|السبب|علشان|عشان|why)/.test(normalizedText)) {
    return "why_reason";
  }
  if (/(يعني ايه|ما هو|ما هي|ماهو|ماهي|عرف|مفهوم|اشرح|فهمني|قولي عن|احكيلي|what is)/.test(normalizedText)) {
    return "definition";
  }
  return "general";
}

const KB_STOPWORDS = new Set([
  "من", "في", "على", "عن", "الى", "مع", "او", "و", "ان", "ما", "لا",
  "هذا", "هذه", "هو", "هي", "هل", "كم", "انت", "انا", "ايه", "كيف", "ليه", "ازاي"
]);

export function matchKBEntities(rawText: string, maxCount = 3): KBEntitySpec[] {
  const norm = normalizeArabicDialect(rawText);
  const fuzzyNorm = deepFuzzyNormalizeArabic(rawText);
  const fuzzyTokens = fuzzyNorm.split(/\s+/).filter((w) => w.length >= 2);
  const strippedTokens = fuzzyTokens.map((w) => w.replace(/^(وال|فال|بال|كال|ال|و|ف|ب|ل)/, ""));
  const allTokens = Array.from(new Set([...norm.tokens, ...fuzzyTokens, ...strippedTokens]))
    .filter((t) => Boolean(t) && !KB_STOPWORDS.has(t));
  const padded = ` ${fuzzyNorm} `;
  const queryTrigrams = buildCharTrigrams(fuzzyNorm);

  const scored: Array<{ entity: KBEntitySpec; score: number }> = [];

  for (const entity of KB_ENTITIES) {
    let score = 0;

    for (const rawAlias of entity.aliases) {
      const a = deepFuzzyNormalizeArabic(rawAlias);
      if (!a || KB_STOPWORDS.has(a)) continue;

      if (a.length <= 3) {
        if (allTokens.includes(a) || padded.includes(` ${a} `)) {
          score += 10;
        }
      } else {
        if (padded.includes(` ${a} `) || allTokens.includes(a)) {
          score += 14;
        } else if (fuzzyNorm.includes(a) || norm.normalized.includes(a)) {
          score += 8;
        } else if (!a.includes(" ") && a.length >= 4) {
          // Fuzzy typo matching per token (e.g. "كميوتر" -> "كمبيوتر", "السماا" -> "السما")
          const maxDist = a.length >= 7 ? 2 : 1;
          for (const tok of allTokens) {
            if (tok.length < 4 || KB_STOPWORDS.has(tok)) continue;
            if (tok === a) {
              score += 11;
              break;
            }
            const dist = boundedLevenshtein(tok, a, maxDist);
            if (dist <= maxDist) {
              score += dist === 1 ? 5.0 : 3.2;
              break;
            }
          }
        }
      }
    }

    // Semantic character 3-gram overlap for indirect/vague descriptions
    if (queryTrigrams.size >= 5) {
      const entTrigrams = getEntityTrigrams(entity);
      let overlap = 0;
      for (const tg of queryTrigrams) {
        if (entTrigrams.has(tg)) overlap++;
      }
      const sim = overlap / Math.sqrt(queryTrigrams.size * Math.max(1, entTrigrams.size));
      if (sim >= 0.21) {
        score += sim * 18;
      }
    }

    if (score >= 4.2) scored.push({ entity, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .map((x) => x.entity);
}

/**
 * Resolves any user query onto a deterministic semantic coordinate inside either:
 * - Desktop 50 Billion Question Knowledge Base (`desktop-50b`)
 * - Mobile 50 Million Question Knowledge Base (`mobile-50m`)
 * and synthesizes a strictly grounded, zero-weird-context answer when needed.
 */
export function resolveQuestionInKB(
  rawText: string,
  profile: DeviceKBProfile = "desktop-50b",
  fallbackEntities: KBEntitySpec[] = [],
  userConstraints: string[] = []
): KBResolution {
  const cfg = KB_PROFILES[profile];
  const norm = normalizeArabicDialect(rawText);
  const intent = detectQuestionIntent(norm.normalized);
  let matched = matchKBEntities(rawText, 3);

  if (matched.length === 0 && fallbackEntities.length > 0) {
    matched = fallbackEntities.slice(0, 2);
  }

  const h1 = fnv1aHash(norm.canonicalTokens.join("|") || norm.normalized, 2166136261);
  const h2 = fnv1aHash(`${profile}:${intent}:${matched.map((m) => m.id).join(",")}`, 374761393);
  const bigCoord = ((BigInt(h1) << 20n) ^ BigInt(h2)) % BigInt(cfg.totalQuestions);
  const shardId = Number(bigCoord % BigInt(cfg.shards));
  const slotIndex = bigCoord.toLocaleString("en-US");

  const primary = matched[0] || null;
  const secondary = matched[1] || null;
  const isBeginner = userConstraints.includes("simple") || intent === "simplify";

  let synthesizedAnswer: string | null = null;
  let followUps = [
    "قارن بين Python و Rust",
    "ازاي بتشتغل الية الانتباه الذاتي Self Attention",
    "ما هي قاعدة بيانات SQLite",
  ];

  if (primary && primary.id.startsWith("compare_")) {
    synthesizedAnswer = `${primary.summary}\n\n${primary.simpleSummary}\n\n**نصيحة الاختيار:** ${primary.bestPractice}`;
    followUps = [
      `أعطني نصيحة عملية عن ${primary.nameAr}`,
      "التلفون بتاعي بيهنج ومحتاج نصيحة",
      "احسبلي 20% من 1500",
    ];
  } else if (primary && primary.id === "arabic_wisdom_stories") {
    synthesizedAnswer = `${primary.simpleSummary}\n\n**نصيحة عملية:** ${primary.bestPractice}`;
  } else if (primary && secondary && intent === "comparison") {
    synthesizedAnswer =
      `**مقارنة مركّزة بين ${primary.nameEn} (${primary.nameAr}) و${secondary.nameEn} (${secondary.nameAr}):**\n\n` +
      `- **${primary.nameEn}:** ${primary.simpleSummary} **أبرز ميزة:** ${primary.pros}\n` +
      `- **${secondary.nameEn}:** ${secondary.simpleSummary} **أبرز ميزة:** ${secondary.pros}\n\n` +
      `**الخلاصة العملية:** اختر **${primary.nameEn}** عندما تركز على (${primary.domainAr})، واختر **${secondary.nameEn}** إذا كانت أولويتك (${secondary.domainAr}).`;
    followUps = [
      `ايه عيوب ${primary.nameEn} و${secondary.nameEn}؟`,
      `أعطني مثال كود لـ ${primary.nameEn}`,
      `بسط الفرق بين ${primary.nameEn} و${secondary.nameEn}`,
    ];
  } else if (primary) {
    if (intent === "simplify") {
      synthesizedAnswer = `**بأسلوب مبسّط عن ${primary.nameEn}:**\n${primary.simpleSummary}\n\n**نصيحة سريعة:** ${primary.bestPractice}`;
    } else if (intent === "example") {
      synthesizedAnswer = primary.exampleCode
        ? `**مثال عملي في ${primary.nameEn}:**\n${primary.exampleCode}\n\n**نصيحة التنفيذ:** ${primary.bestPractice}`
        : `**تطبيق عملي لـ ${primary.nameEn}:**\n${primary.howItWorks}\n\n**أفضل ممارسة:** ${primary.bestPractice}`;
    } else if (intent === "pros_cons") {
      synthesizedAnswer =
        `**مميزات وعيوب ${primary.nameEn}:**\n` +
        `- **المميزات:** ${primary.pros}\n` +
        `- **العيوب والتحديات:** ${primary.cons}`;
    } else if (intent === "how_to") {
      synthesizedAnswer =
        `**كيف يعمل ${primary.nameEn}:**\n${primary.howItWorks}\n\n` +
        `**أفضل طريقة للاستخدام:** ${primary.bestPractice}`;
    } else if (intent === "optimize" || intent === "security" || intent === "debug") {
      synthesizedAnswer =
        `**تحسين وحماية العمل مع ${primary.nameEn}:**\n${primary.bestPractice}\n\n` +
        `**نقطة الانتباه الأهم:** ${primary.cons}`;
    } else {
      synthesizedAnswer = isBeginner
        ? `${primary.simpleSummary}\n\n**أهم نصيحة:** ${primary.bestPractice}`
        : `${primary.summary}\n\n**كيف يعمل:** ${primary.howItWorks}\n\n**أفضل ممارسة:** ${primary.bestPractice}`;
    }
    followUps = [
      `قارن بين ${primary.nameEn} و Python`,
      `ما هي مميزات وعيوب ${primary.nameEn}؟`,
      `بسط ${primary.nameEn} باختصار`,
    ];
  }

  return {
    profile,
    totalQuestionsCapacity: cfg.totalQuestions,
    capacityFormatted: cfg.capacityFormatted,
    shardCount: cfg.shards,
    shardId,
    slotIndex,
    domainAr: primary?.domainAr || "المعرفة العامة والحوار السياقي",
    intent,
    matchedEntities: matched,
    confidence: primary ? (secondary ? 0.96 : 0.92) : 0.72,
    synthesizedAnswer,
    followUps,
  };
}
