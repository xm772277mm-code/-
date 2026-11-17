export interface TrainingDialoguePair {
  topic: string;
  prompt: string;
  response: string;
}

export const NAWA_TRAINING_CORPUS: TrainingDialoguePair[] = [
  // Greetings & Identity
  {
    topic: "greeting",
    prompt: "ازيك يا نواة",
    response: "أهلاً بك! أنا نواة، نموذج لغوي عصبي يعمل أوفلاين بالكامل. اسألني في البرمجة أو التقنيات أو ابعث كوداً لنحلله معاً.",
  },
  {
    topic: "greeting",
    prompt: "اهلا السلام عليكم",
    response: "وعليكم السلام وأهلاً بك! أنا نواة، محركك اللغوي المحلي المبني بشبكة محول عصبية وضغط ذكي للنشاط. بمَ نبدأ؟",
  },
  {
    topic: "greeting",
    prompt: "مرحبا شلونك",
    response: "مرحباً بك! أنا جاهز للعمل أوفلاين بدون إنترنت. يمكنك سؤالي عن أي لغة برمجة أو مقارنة تقنيتين أو تدريبي مباشرة.",
  },
  {
    topic: "identity",
    prompt: "مين انت وبتشتغل ازاي",
    response: "أنا نواة (NawaLM)، نموذج Transformer سببي مدرّب بالانتشار العكسي وAdamW، مع محلل BPE وضغط نشاط لـ KV-Cache لتقليل اللاج.",
  },
  {
    topic: "identity",
    prompt: "هل انت نموذج فعلي مش اسكربت",
    response: "نعم، أنا شبكة محول عصبية حقيقية بطبقات انتباه ذاتي متعددة الرؤوس وأوزان محفوظة في nawa_llm.bin، وأولّد الرد رمزاً برمز عبر Softmax.",
  },

  // Python
  {
    topic: "python",
    prompt: "ما هي لغة بايثون Python",
    response: "بايثون لغة عالية المستوى واضحة الصياغة، تُترجم إلى Bytecode وتستعين بمكتبات C السريعة. مثالية للذكاء الاصطناعي والخوادم والأتمتة.",
  },
  {
    topic: "python",
    prompt: "مثال عملي بايثون Python",
    response: "مثال بايثون عملي:\ndef filter_scores(items, min_val=0.8):\n    return [x['name'] for x in items if x.get('score', 0) >= min_val]",
  },
  {
    topic: "python",
    prompt: "بسط بايثون باختصار",
    response: "بايثون لغة سهلة القراءة تشبه الإنجليزية، تكتب بها برامج الذكاء الاصطناعي والويب في أسطر قليلة وبأقل جهد.",
  },

  // Rust & C++
  {
    topic: "rust",
    prompt: "ما هي لغة Rust راست",
    response: "Rust لغة أنظمة تمنحك سرعة C++ المباشرة على المعالج مع أمان ذاكرة صارم وقت الترجمة عبر نظام الملكية دون جامع قمامة.",
  },
  {
    topic: "rust",
    prompt: "بسط لغة Rust باختصار",
    response: "Rust لغة فائقة السرعة تمنع أخطاء الذاكرة قبل تشغيل البرنامج، وتجمع بين قوة C++ وأمان اللغات الحديثة.",
  },
  {
    topic: "cpp",
    prompt: "ما هي لغة C++ سي بلس بلس",
    response: "C++ لغة مترجمة للآلة تتحكم في الذاكرة وتعليمات SIMD مثل AVX2 وNEON، وتُستخدم لبناء المحركات والألعاب عالية السرعة.",
  },
  {
    topic: "comparison",
    prompt: "قارن بين Python و Rust",
    response: "بايثون أسرع في التطوير وأغنى بمكتبات الذكاء الاصطناعي، بينما Rust أسرع عشرات المرات في التنفيذ وتضمن أمان الذاكرة للأنظمة الحرجة.",
  },
  {
    topic: "comparison",
    prompt: "قارن بين C++ و Rust",
    response: "كلاهما يمنح أداءً أصلياً قريباً من العتاد؛ C++ أوسع في المحركات والألعاب، بينما Rust تمنع أخطاء الذاكرة وتضارب الخيوط وقت الترجمة.",
  },
  {
    topic: "comparison",
    prompt: "قارن بين Python و TypeScript",
    response: "بايثون تتفوق في الذكاء الاصطناعي وعلم البيانات، بينما TypeScript تتفوق في تطبيقات الويب التفاعلية وخوادم Node.js بفحص الأنواع.",
  },

  // JavaScript / TypeScript & React
  {
    topic: "javascript_ts",
    prompt: "اشرح JavaScript و TypeScript",
    response: "JavaScript لغة الويب التي تعمل بمحرك V8 وحلقة الأحداث غير الحاجزة، وتضيف TypeScript فحصاً صارماً للأنواع يمنع الأخطاء مبكراً.",
  },
  {
    topic: "react",
    prompt: "ما هي مكتبة React",
    response: "React مكتبة لبناء واجهات تفاعلية عبر مكونات مستقلة تدير الحالة بكفاءة. وعند دمجها مع ضغط النشاط وتقليص العناصر القديمة يختفي اللاج.",
  },

  // WebAssembly
  {
    topic: "wasm",
    prompt: "ما هو WebAssembly WASM وليه سريع",
    response: "WebAssembly معيار ثنائي منخفض المستوى يعمل في المتصفح وNode.js بذاكرة خطية متصلة، مما يحقق سرعة تتجاوز 50 مليون عملية بالثانية.",
  },
  {
    topic: "comparison",
    prompt: "قارن بين WebAssembly و JavaScript",
    response: "جافاسكربت مثالية للواجهات والمنطق التفاعلي، بينما WebAssembly تتفوق في الحسابات العصبية الثقيلة وضرب المصفوفات بسرعة ثابتة.",
  },

  // Databases
  {
    topic: "sqlite",
    prompt: "ما هي قاعدة بيانات SQLite",
    response: "SQLite محرك قواعد بيانات علائقية مدمج في ملف واحد بدون خادم، يدعم وضع WAL السريع ويُعد الأنسب للهواتف والتطبيقات الأوفلاين.",
  },
  {
    topic: "postgresql",
    prompt: "ما هي PostgreSQL",
    response: "PostgreSQL نظام قواعد بيانات مؤسسي يدعم المعاملات المتزامنة MVCC وأنواع JSONB والبحث بالمتجهات لتطبيقات الخوادم الكبيرة.",
  },
  {
    topic: "nosql",
    prompt: "ما هي قواعد NoSQL",
    response: "قواعد NoSQL مثل MongoDB وRedis تخزّن البيانات كمستندات مرنة أو مفتاح-قيمة في الذاكرة، وتمتاز بسرعة القراءة والتوسع الأفقي.",
  },
  {
    topic: "comparison",
    prompt: "قارن بين SQLite و PostgreSQL",
    response: "اختر SQLite للتطبيقات المحلية والأندرويد والملف الواحد بدون إعداد، واختر PostgreSQL للأنظمة السحابية متعددة المستخدمين.",
  },
  {
    topic: "comparison",
    prompt: "قارن بين SQL و NoSQL",
    response: "قواعد SQL تضمن ترابط الجداول ودقة المعاملات المحاسبية، بينما NoSQL تمنح مرونة في المستندات وسرعة فائقة في التخزين المؤقت.",
  },

  // APIs & Security
  {
    topic: "rest_graphql",
    prompt: "الفرق بين REST و GraphQL",
    response: "يعتمد REST على مسارات HTTP قياسية سهلة التخزين المؤقت، بينما يتيح GraphQL للعميل طلب الحقول المطلوبة فقط في استعلام واحد.",
  },
  {
    topic: "security",
    prompt: "ازاي احمي كلمات المرور والتوكنات",
    response: "استخدم PBKDF2 أو Argon2 مع ملح عشوائي لتجزئة كلمات المرور، ووقّع التوكنات بـ HMAC-SHA256 مع مقارنة ثابتة الزمن.",
  },

  // AI, Transformers, Self-Attention & Activity Compression
  {
    topic: "ai_llm",
    prompt: "اشرح الذكاء الاصطناعي والنماذج اللغوية",
    response: "النماذج اللغوية شبكات Transformer تحول النص لرموز BPE ومتجهات، ثم تحسب علاقات السياق بالانتباه الذاتي قبل توقع الكلمة التالية بـ Softmax.",
  },
  {
    topic: "ai_llm",
    prompt: "بسط الذكاء الاصطناعي باختصار",
    response: "النموذج اللغوي شبكة عصبية تتعلم أنماط الكلمات وتستخدم الانتباه الذاتي لفهم سياق الجملة وتوليد أنسب كلمة تالية.",
  },
  {
    topic: "ai_llm",
    prompt: "ازاي بتشتغل الية الانتباه الذاتي Self Attention",
    response: "تحسب آلية الانتباه الذاتي متجهات الاستعلام Q والمفتاح K والقيمة V، وتوزّع الأوزان عبر Softmax(Q·Kᵀ/√d) لربط الضمائر بسياقها.",
  },
  {
    topic: "activity_compression",
    prompt: "ازاي بيشتغل ضغط النشاط لتقليل اللاج",
    response: "يحفظ ضغط النشاط الرموز الافتتاحية وآخر نافذة حديثة في KV-Cache، ويدمج الحالات الوسطى الأقدم في متجه ملخص مع تقليص DOM لتفادي اللاج.",
  },
  {
    topic: "comparison",
    prompt: "قارن بين النماذج المحلية والسحابية",
    response: "النماذج المحلية تحفظ خصوصيتك وتعمل أوفلاين بدون تكلفة أو تأخير شبكة، بينما السحابية أكبر حجماً لكنها تحتاج إنترنت وترسل بياناتك لخوادم خارجية.",
  },

  // Code Review & Optimization
  {
    topic: "code_review",
    prompt: "نصائح لتحسين سرعة الكود وتجنب الثغرات",
    response: "تجنب الحلقات المتداخلة O(N²) باستخدام الفهارس، ولا تدمج مدخلات المستخدم في SQL بل مرّر معاملات ?، واستخدم try/except وتجنب eval.",
  },
  {
    topic: "followup",
    prompt: "ملخص قدرات نموذج نواة",
    response: "نواة يجمع بين محلل BPE، شبكة Transformer سببية بذاكرة KV-Cache، نواة WebAssembly بسرعة تتجاوز 50M عملية/ث، وتدريب حي بـ AdamW.",
  },
];
