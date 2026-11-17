import { getWasmKernel } from "./wasmKernel.ts";

export type AgentIntentId =
  | "list_workspace"
  | "read_file"
  | "search_code"
  | "create_fastapi_api"
  | "create_algorithm_bench"
  | "create_web_app"
  | "create_cli_tool"
  | "create_database_app"
  | "create_auth_security"
  | "debug_and_fix"
  | "refactor_and_optimize"
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
  { id: "create_fastapi_api", labelAr: "بناء API واختباره", descriptionAr: "إنشاء خادم REST API مخصص مع CRUD واختبارات آلية" },
  { id: "create_algorithm_bench", labelAr: "خوارزمية وقياس سرعة", descriptionAr: "كتابة خوارزمية عالية الأداء واختبار سرعتها" },
  { id: "create_web_app", labelAr: "بناء واجهة ويب", descriptionAr: "إنشاء صفحة أو تطبيق واجهة مستخدم تفاعلي" },
  { id: "create_cli_tool", labelAr: "أداة سطر أوامر", descriptionAr: "برمجة سكربت أو أداة CLI وتشغيلها" },
  { id: "create_database_app", labelAr: "قاعدة بيانات SQLite", descriptionAr: "تصميم جداول SQLite واستعلامات واختبارات عملية" },
  { id: "create_auth_security", labelAr: "نظام مصادقة وأمان", descriptionAr: "بناء تشفير كلمات مرور PBKDF2 وتوكنات HMAC واختبارها" },
  { id: "debug_and_fix", labelAr: "فحص وإصلاح الأخطاء", descriptionAr: "فحص ملفات المشروع نحوياً واكتشاف الأعطال وإصلاحها" },
  { id: "refactor_and_optimize", labelAr: "تحسين وإعادة هيكلة", descriptionAr: "مراجعة ملف حالي وتحسين أدائه ومعالجة أخطائه" },
  { id: "edit_existing_file", labelAr: "تعديل ملف موجود", descriptionAr: "تحديث أو إضافة ميزة داخل ملف حالي" },
  { id: "run_tests_or_cmd", labelAr: "تشغيل أوامر واختبارات", descriptionAr: "تنفيذ أمر أو اختبار فعلي في الطرفية" },
  { id: "explain_architecture", labelAr: "تحليل وشرح المشروع", descriptionAr: "استكشاف الملفات وحساب الإحصائيات وشرح المعمارية" },
  { id: "generate_native_kernel", labelAr: "توليد نواة C++ / SIMD", descriptionAr: "كتابة نواة حسابية عالية السرعة بـ C++ أو WASM" },
  { id: "general_coding_help", labelAr: "استشارة برمجية عامة", descriptionAr: "توجيه هندسي ومساعدة برمجية ذكية مرتبطة بالمشروع" },
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
  { text: "ما هي محتويات المجلد الحالي", intent: "list_workspace", dialect: "فصحى" },

  // read_file
  { text: "اقرا ملف main.py ووريني محتواه", intent: "read_file", dialect: "مصري" },
  { text: "افتحلي ملف server.py اشوفه", intent: "read_file", dialect: "مصري" },
  { text: "اقراه ووريني مكتوب فيه ايه", intent: "read_file", dialect: "مصري" },
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
  { text: "اعمل سيرفر REST API لادارة المنتجات والمبيعات مع اختبارات", intent: "create_fastapi_api", dialect: "مصري" },
  { text: "ابغى تسويلي باك اند API للمستخدمين والطلبات واختبره", intent: "create_fastapi_api", dialect: "خليجي" },
  { text: "بدي تعملي واجهة برمجية API للفواتير وتفحصها", intent: "create_fastapi_api", dialect: "شامي" },
  { text: "بغيت تصاوب ليا API ديال الطلاب ب Node js وتختبرو", intent: "create_fastapi_api", dialect: "مغاربي" },
  { text: "اريد تسويلي API مال موظفين وتختبره", intent: "create_fastapi_api", dialect: "عراقي" },
  { text: "build a rest api server with unit tests", intent: "create_fastapi_api", dialect: "إنجليزي" },
  { text: "3ayez API python ll tasks w tests", intent: "create_fastapi_api", dialect: "عربيزي" },

  // create_database_app
  { text: "اعملي قاعدة بيانات SQLite للمنتجات والمخزون واختبرها", intent: "create_database_app", dialect: "مصري" },
  { text: "عايز داتابيز SQLite تحفظ بيانات العملاء والفواتير", intent: "create_database_app", dialect: "مصري" },
  { text: "سويلي قاعدة بيانات SQL مع جداول واستعلامات بحث واختبرها", intent: "create_database_app", dialect: "خليجي" },
  { text: "بدي نظام تخزين بقاعدة بيانات SQLite للطلاب والدرجات", intent: "create_database_app", dialect: "شامي" },
  { text: "صاوب قاعدة بيانات SQLite ديال الطلبات واختبر الاستعلامات", intent: "create_database_app", dialect: "مغاربي" },
  { text: "create sqlite database schema with crud queries and tests", intent: "create_database_app", dialect: "إنجليزي" },
  { text: "انشئ نموذج قاعدة بيانات علائقية مع فهارس بحث سريعة", intent: "create_database_app", dialect: "فصحى" },

  // create_auth_security
  { text: "اعملي نظام تسجيل دخول ومصادقة وتشفير كلمات المرور واختبره", intent: "create_auth_security", dialect: "مصري" },
  { text: "عايز كود امان لتوليد التوكنات Token و Hash بالـ HMAC", intent: "create_auth_security", dialect: "مصري" },
  { text: "سويلي نظام حماية وتشفير الباسورد والتحقق من الجلسات", intent: "create_auth_security", dialect: "خليجي" },
  { text: "بدي خدمة مصادقة مستخدمين Auth مع JWT او HMAC وتيست", intent: "create_auth_security", dialect: "شامي" },
  { text: "صاوب ليا نظام امان وتشفير كلمات السر واختبرو", intent: "create_auth_security", dialect: "مغاربي" },
  { text: "build secure password hashing pbkdf2 and token auth service", intent: "create_auth_security", dialect: "إنجليزي" },
  { text: "انشئ وحدة مصادقة آمنة تدعم التحقق من الصلاحيات", intent: "create_auth_security", dialect: "فصحى" },

  // debug_and_fix
  { text: "افحص ملفات المشروع وشوف لو فيها اخطاء وصلحها", intent: "debug_and_fix", dialect: "مصري" },
  { text: "الكود فيه مشكلة او باج عايزك تكتشفه وتصلحه", intent: "debug_and_fix", dialect: "مصري" },
  { text: "شيك على الاخطاء البرمجية في كل الملفات وصححها", intent: "debug_and_fix", dialect: "خليجي" },
  { text: "افحصلي الكود اذا فيه اعطال او اخطاء نحو واصلاحها", intent: "debug_and_fix", dialect: "شامي" },
  { text: "قلب على المشاكل والاخطاء ف المشروع وصلحهم", intent: "debug_and_fix", dialect: "مغاربي" },
  { text: "debug workspace files check syntax errors and fix bugs", intent: "debug_and_fix", dialect: "إنجليزي" },
  { text: "قم بتشخيص الاخطاء البرمجية وفحص الصياغة في المشروع", intent: "debug_and_fix", dialect: "فصحى" },

  // refactor_and_optimize
  { text: "حسن اداء الكود واعمل له refactor ومعالجة اخطاء", intent: "refactor_and_optimize", dialect: "مصري" },
  { text: "عايزك تراجع الملف وتنضف الكود وتسرعه", intent: "refactor_and_optimize", dialect: "مصري" },
  { text: "طور الكود الموجود وخليه احترافي ومنظم اكثر", intent: "refactor_and_optimize", dialect: "خليجي" },
  { text: "زبط هيكلية الكود وحسن جودته وسرعته", intent: "refactor_and_optimize", dialect: "شامي" },
  { text: "حسن هاد الملف ونظم الدوال ديالو", intent: "refactor_and_optimize", dialect: "مغاربي" },
  { text: "refactor and optimize existing code with error handling", intent: "refactor_and_optimize", dialect: "إنجليزي" },
  { text: "اعادة هيكلة الكود لتحسين الكفاءة والموثوقية", intent: "refactor_and_optimize", dialect: "فصحى" },

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
  { text: "عدل على ملف الكود وزود فيه دالة جديدة", intent: "edit_existing_file", dialect: "مصري" },
  { text: "غير السطر في الملف وضيفله خاصية البحث", intent: "edit_existing_file", dialect: "مصري" },
  { text: "حدث الملف واضف معالجة المدخلات", intent: "edit_existing_file", dialect: "خليجي" },
  { text: "زبطلي الكود بالملف وعدل العنوان", intent: "edit_existing_file", dialect: "شامي" },
  { text: "بدل هاد السطر ف الملف", intent: "edit_existing_file", dialect: "مغاربي" },
  { text: "edit file and update function", intent: "edit_existing_file", dialect: "إنجليزي" },
  { text: "قم بتعديل الملف الحالي واضافة خاصية", intent: "edit_existing_file", dialect: "فصحى" },

  // run_tests_or_cmd
  { text: "شغل الاختبارات واتاكد ان الكود شغال تمام", intent: "run_tests_or_cmd", dialect: "مصري" },
  { text: "نفذ السكربت في التيرمينال ووريني النتيجة", intent: "run_tests_or_cmd", dialect: "مصري" },
  { text: "اختبر الكود وشوف اذا يشتغل", intent: "run_tests_or_cmd", dialect: "خليجي" },
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
  "اقراه": "اقرا", "افتح": "اقرا", "افتحلي": "اقرا", "اشوفه": "اقرا",
  "read": "اقرا", "show": "اعرض", "list": "اعرض", "open": "اقرا",
  // Search
  "دور": "ابحث", "دورلي": "ابحث", "فين": "ابحث", "وين": "ابحث",
  "فتش": "ابحث", "فتشلي": "ابحث", "قلب": "ابحث", "search": "ابحث",
  "find": "ابحث", "eb7ath": "ابحث",
  // Edit / Fix / Debug / Refactor
  "عدل": "تعديل", "غير": "تعديل", "زود": "تعديل", "ضيفله": "تعديل",
  "حدث": "تعديل", "زبط": "تعديل", "زبطلي": "تعديل", "بدل": "تعديل",
  "edit": "تعديل", "update": "تعديل",
  "صلح": "اصلاح", "صلحه": "اصلاح", "صلحها": "اصلاح", "صلحهم": "اصلاح",
  "صلحو": "اصلاح", "صححها": "اصلاح", "باج": "خطأ", "اعطال": "خطأ",
  "مشكلة": "خطأ", "اخطاء": "خطأ", "الاخطاء": "خطأ", "شيك": "فحص",
  "debug": "اصلاح", "fix": "اصلاح", "bugs": "خطأ", "syntax": "خطأ",
  "حسن": "تحسين", "نضف": "تحسين", "نظم": "تحسين", "طور": "تحسين",
  "refactor": "تحسين", "optimize": "تحسين", "clean": "تحسين",
  // Run / Test
  "شغل": "تشغيل", "شغّل": "تشغيل", "جرب": "تشغيل", "اختبر": "تشغيل",
  "تختبره": "تشغيل", "وتختبره": "تشغيل", "اختبرها": "تشغيل", "نفذ": "تشغيل",
  "افحص": "فحص", "تفحصها": "تشغيل", "خدم": "تشغيل", "shaghal": "تشغيل",
  "run": "تشغيل", "test": "تشغيل", "tests": "تشغيل", "pytest": "تشغيل",
  // Explain
  "اشرح": "شرح", "اشرحلي": "شرح", "فهمني": "شرح", "احكيلي": "شرح",
  "شرحلي": "شرح", "حلل": "شرح", "explain": "شرح", "architecture": "شرح",
  // Domain targets
  "ملفات": "ملف", "الملفات": "ملف", "المجلدات": "ملف", "الدوسي": "ملف",
  "files": "ملف", "file": "ملف", "البروجي": "مشروع", "المشروع": "مشروع",
  "workspace": "مشروع", "codebase": "مشروع",
  "فاست": "fastapi", "ايبي": "api", "باك": "api", "سيرفر": "api",
  "داتابيز": "قاعدة", "sqlite": "قاعدة", "جداول": "قاعدة", "sql": "قاعدة",
  "تشفير": "امان", "باسورد": "امان", "الباسورد": "امان", "مصادقة": "امان",
  "تسجيل": "امان", "توكنات": "امان", "token": "امان", "hmac": "امان",
  "auth": "امان", "pbkdf2": "امان", "jwt": "امان",
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
  const text = raw
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}._\-/ ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  let dialectHint = "فصحى / تقني";
  if (/(عايز|عاوز|ازاي|فين|النهارده|اعملي|اقراه|ضيفله)/.test(text)) dialectHint = "مصري";
  else if (/(ابغى|ابي|سويلي|وش|ودي|شيك)/.test(text)) dialectHint = "خليجي / سعودي";
  else if (/(بدي|شو|ساويلنا|زبطلي|هيك|افحصلي)/.test(text)) dialectHint = "شامي";
  else if (/(بغيت|صاوب|كيفاش|ديال|واش|كاين)/.test(text)) dialectHint = "مغاربي";
  else if (/(شلونك|اريد|مال|شوفني)/.test(text)) dialectHint = "عراقي";
  else if (/[37]/.test(text) && /[a-z]/.test(text)) dialectHint = "عربيزي";

  const tokens = text.split(" ").filter(Boolean);
  const canonicalTokens = tokens.map((tok) => {
    if (DIALECT_SYNONYMS[tok]) return DIALECT_SYNONYMS[tok];
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

export const INPUT_DIM = 512;
export const HIDDEN1_DIM = 192;
export const HIDDEN2_DIM = 96;
export const OUTPUT_DIM = INTENTS.length; // 16

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

  for (const tok of norm.canonicalTokens) {
    addFeature("C:" + tok, 2.3);
  }
  for (let i = 0; i < norm.canonicalTokens.length - 1; i++) {
    addFeature("B:" + norm.canonicalTokens[i] + "_" + norm.canonicalTokens[i + 1], 1.9);
  }
  for (let i = 0; i < norm.canonicalTokens.length - 2; i++) {
    addFeature("S:" + norm.canonicalTokens[i] + "_" + norm.canonicalTokens[i + 2], 1.1);
  }
  for (const tok of norm.tokens) {
    addFeature("W:" + tok, 1.0);
    const padded = `^${tok}$`;
    for (let i = 0; i <= padded.length - 3; i++) {
      addFeature("3:" + padded.slice(i, i + 3), 0.4);
    }
  }

  if (/\.[a-z]{1,5}\b/.test(norm.normalized)) addFeature("HAS_FILENAME", 2.0);
  if (/(api|fastapi|express|rest|endpoint|crud|server)/.test(norm.normalized)) addFeature("CUE_API", 2.4);
  if (/(sqlite|sql|database|داتابيز|قاعده|جدول|جداول|تخزين)/.test(norm.normalized)) addFeature("CUE_DB", 2.8);
  if (/(auth|token|hmac|pbkdf2|jwt|تشفير|امان|باسورد|مصادقه|تسجيل)/.test(norm.normalized)) addFeature("CUE_AUTH", 2.8);
  if (/(debug|fix|bug|syntax|باج|اعطال|خطا|اخطاء|صلح|صحح|مشكله)/.test(norm.normalized)) addFeature("CUE_DEBUG", 2.7);
  if (/(refactor|optimize|تحسين|نضف|هيكل|كفاءه|تسرع)/.test(norm.normalized)) addFeature("CUE_REFACTOR", 2.6);
  if (/(html|css|react|صفحه|واجهة|داشبورد|موقع)/.test(norm.normalized)) addFeature("CUE_WEB", 2.2);
  if (/(c\+\+|cpp|avx2|neon|simd|wasm|apk|exe|نواه|مليون)/.test(norm.normalized)) addFeature("CUE_NATIVE", 2.5);
  if (/(فرز|sort|prime|matrix|خوارزميه|benchmark|سرعه)/.test(norm.normalized)) addFeature("CUE_ALGO", 2.3);

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

export interface ExtractedSlots {
  filename: string | null;
  searchQuery: string | null;
  command: string | null;
  framework: "python" | "node" | "cpp" | "web";
  domainEntity: {
    nameEn: string;
    nameAr: string;
    fields: string[];
  };
  withTests: boolean;
  usedContextMemory: boolean;
  resolvedReferences: string[];
  requestedFeature: string | null;
}

export interface ContextHint {
  lastFile?: string | null;
  lastDomain?: { nameEn: string; nameAr: string; fields: string[] } | null;
  lastLanguage?: "python" | "node" | "cpp" | "web" | null;
  lastIntent?: AgentIntentId | null;
  taskScope?: AgentIntentId | "auto" | null;
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
  slots: ExtractedSlots;
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

// Memory layout inside WASM linear memory (all aligned inside 0..500KiB, leaving 1MiB+ for bench_50m)
// Total weights + biases = 512*192 + 192 + 192*96 + 96 + 96*16 + 16 = 118,576 floats (474,304 bytes)
const WASM_OFFSETS = {
  w1: 0,
  b1: HIDDEN1_DIM * INPUT_DIM * 4,
  w2: (HIDDEN1_DIM * INPUT_DIM + HIDDEN1_DIM) * 4,
  b2: (HIDDEN1_DIM * INPUT_DIM + HIDDEN1_DIM + HIDDEN2_DIM * HIDDEN1_DIM) * 4,
  w3: (HIDDEN1_DIM * INPUT_DIM + HIDDEN1_DIM + HIDDEN2_DIM * HIDDEN1_DIM + HIDDEN2_DIM) * 4,
  b3:
    (HIDDEN1_DIM * INPUT_DIM +
      HIDDEN1_DIM +
      HIDDEN2_DIM * HIDDEN1_DIM +
      HIDDEN2_DIM +
      OUTPUT_DIM * HIDDEN2_DIM) *
    4,
  x: 524288, // 512 KiB
  h1: 524288 + 4096,
  h2: 524288 + 8192,
  logits: 524288 + 12288,
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
    this.trainEpochs(95, 0.16);
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

  trainEpochs(epochs = 60, baseLr = 0.14): EpochStat[] {
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
      // Cosine annealing learning rate
      const lr = baseLr * (0.45 + 0.55 * Math.cos((Math.PI * ep) / (epochs * 1.15)));
      let totalLoss = 0;
      let correct = 0;

      for (let idx = 0; idx < n; idx++) {
        const { x, y } = dataset[idx];

        for (let i = 0; i < HIDDEN1_DIM; i++) {
          let sum = this.b1[i];
          const off = i * INPUT_DIM;
          for (let j = 0; j < INPUT_DIM; j++) {
            if (x[j] !== 0) sum += this.w1[off + j] * x[j];
          }
          h1[i] = sum > 0 ? sum : 0;
        }

        for (let i = 0; i < HIDDEN2_DIM; i++) {
          let sum = this.b2[i];
          const off = i * HIDDEN1_DIM;
          for (let j = 0; j < HIDDEN1_DIM; j++) sum += this.w2[off + j] * h1[j];
          h2[i] = sum > 0 ? sum : 0;
        }

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

        for (let i = 0; i < OUTPUT_DIM; i++) {
          dLogits[i] = probs[i] - (i === y ? 1 : 0);
        }
        dh2.fill(0);
        for (let i = 0; i < OUTPUT_DIM; i++) {
          const g = dLogits[i];
          const off = i * HIDDEN2_DIM;
          this.b3[i] -= lr * g;
          for (let j = 0; j < HIDDEN2_DIM; j++) {
            dh2[j] += this.w3[off + j] * g;
            this.w3[off + j] -= lr * g * h2[j];
          }
        }

        dh1.fill(0);
        for (let i = 0; i < HIDDEN2_DIM; i++) {
          if (h2[i] <= 0) continue;
          const g = dh2[i];
          const off = i * HIDDEN1_DIM;
          this.b2[i] -= lr * g;
          for (let j = 0; j < HIDDEN1_DIM; j++) {
            dh1[j] += this.w2[off + j] * g;
            this.w2[off + j] -= lr * g * h1[j];
          }
        }

        for (let i = 0; i < HIDDEN1_DIM; i++) {
          if (h1[i] <= 0) continue;
          const g = dh1[i];
          const off = i * INPUT_DIM;
          this.b1[i] -= lr * g;
          for (let j = 0; j < INPUT_DIM; j++) {
            if (x[j] !== 0) {
              this.w1[off + j] -= lr * g * x[j];
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

  async predict(rawText: string, contextHint?: ContextHint): Promise<InferencePrediction> {
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

    // Apply contextual prior when user is inside a specific isolated task scope or uses short follow-ups
    if (contextHint?.taskScope && contextHint.taskScope !== "auto") {
      const scopeIdx = INTENTS.findIndex((i) => i.id === contextHint.taskScope);
      if (scopeIdx >= 0) logits[scopeIdx] += 1.65;
    }
    if (contextHint?.lastFile && /^(اقراه|افتحه|شوفه|اختبره|شغله|صلحه|حسنه|عدله|اشرحه)/i.test(normalized.normalized)) {
      if (/(اقراه|افتحه|شوفه)/.test(normalized.normalized)) {
        const idx = INTENTS.findIndex((i) => i.id === "read_file");
        if (idx >= 0) logits[idx] += 2.2;
      } else if (/(اختبره|شغله)/.test(normalized.normalized)) {
        const idx = INTENTS.findIndex((i) => i.id === "run_tests_or_cmd");
        if (idx >= 0) logits[idx] += 2.2;
      } else if (/(صلحه|افحصه)/.test(normalized.normalized)) {
        const idx = INTENTS.findIndex((i) => i.id === "debug_and_fix");
        if (idx >= 0) logits[idx] += 2.2;
      } else if (/(حسنه|نضفه)/.test(normalized.normalized)) {
        const idx = INTENTS.findIndex((i) => i.id === "refactor_and_optimize");
        if (idx >= 0) logits[idx] += 2.2;
      } else if (/(اشرحه|فهمني)/.test(normalized.normalized)) {
        const idx = INTENTS.findIndex((i) => i.id === "explain_architecture");
        if (idx >= 0) logits[idx] += 2.2;
      }
    }

    const maxLogit = Math.max(...logits);
    const exps = logits.map((v) => Math.exp(v - maxLogit));
    const expSum = exps.reduce((a, b) => a + b, 0);

    const probs = INTENTS.map((meta, idx) => ({
      intent: meta.id,
      labelAr: meta.labelAr,
      prob: Number((exps[idx] / expSum).toFixed(4)),
    })).sort((a, b) => b.prob - a.prob);

    const top = probs[0];
    const slots = extractSlots(rawText, normalized.normalized, contextHint);

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
    const headerSize = 20;
    const buf = new ArrayBuffer(headerSize + this.totalParams * 4);
    const view = new DataView(buf);
    view.setUint8(0, 0x4e);
    view.setUint8(1, 0x41);
    view.setUint8(2, 0x57);
    view.setUint8(3, 0x41);
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

function extractDomainEntityExplicit(normalized: string): ExtractedSlots["domainEntity"] | null {
  if (/(منتج|منتجات|مبيعات|متجر|سلع|product)/.test(normalized)) {
    return { nameEn: "products", nameAr: "المنتجات", fields: ["name", "price", "stock"] };
  }
  if (/(طالب|طلاب|درجات|مدرسه|جامعه|student)/.test(normalized)) {
    return { nameEn: "students", nameAr: "الطلاب", fields: ["name", "grade", "major"] };
  }
  if (/(فاتور|فواتير|دفع|مدفوع|invoice)/.test(normalized)) {
    return { nameEn: "invoices", nameAr: "الفواتير", fields: ["customer", "amount", "paid"] };
  }
  if (/(موظف|موظفين|رواتب|عمال|employee)/.test(normalized)) {
    return { nameEn: "employees", nameAr: "الموظفين", fields: ["name", "role", "salary"] };
  }
  if (/(مستخدم|مستخدمين|عملاء|حساب|user)/.test(normalized)) {
    return { nameEn: "users", nameAr: "المستخدمين", fields: ["username", "email", "active"] };
  }
  if (/(طلب|طلبات|اوردرات|order)/.test(normalized)) {
    return { nameEn: "orders", nameAr: "الطلبات", fields: ["item", "qty", "status"] };
  }
  if (/(مهمه|مهام|تاسك|task)/.test(normalized)) {
    return { nameEn: "tasks", nameAr: "المهام", fields: ["title", "priority", "done"] };
  }
  return null;
}

function extractSlots(raw: string, normalized: string, contextHint?: ContextHint): ExtractedSlots {
  const fileMatch = raw.match(/([a-zA-Z0-9_\-/]+\.(?:py|js|mjs|ts|tsx|html|css|json|md|cpp|h|kt|txt))/);
  const cmdMatch = raw.match(/`([^`]+)`/);
  const resolvedReferences: string[] = [];
  let usedContextMemory = false;

  let searchQuery: string | null = null;
  const searchPattern = raw.match(
    /(?:دورلي على|دور على|ابحث عن|فين|وين|فتشلي على|search(?: code)?(?: for)?)\s+(?:كلمة|دالة|متغير|كلاس)?\s*([^\s،؟]+)/i
  );
  if (searchPattern && searchPattern[1]) {
    searchQuery = searchPattern[1].replace(/["'`]/g, "");
  }

  let framework: ExtractedSlots["framework"] | null = null;
  if (/(node|nodejs|express|javascript|typescript|\bjs\b)/i.test(normalized)) framework = "node";
  else if (/(python|fastapi|بايثون|sqlite)/i.test(normalized)) framework = "python";
  else if (/(c\+\+|cpp|avx2|neon)/i.test(normalized)) framework = "cpp";
  else if (/(html|css|react|صفحه|واجهة|داشبورد)/i.test(normalized)) framework = "web";

  if (!framework && contextHint?.lastLanguage && /(نفس|كمان|برضو|تاني|واحد|حول|ضيف)/.test(normalized)) {
    framework = contextHint.lastLanguage;
    usedContextMemory = true;
    resolvedReferences.push(`اللغة الموروثة: ${framework}`);
  }
  if (!framework) framework = "python";

  const explicitDomain = extractDomainEntityExplicit(normalized);
  let domainEntity = explicitDomain;
  if (!domainEntity && contextHint?.lastDomain) {
    domainEntity = contextHint.lastDomain;
    if (/(نفس|عليه|له|لها|تاني|كمان|حول|ضيف|قاعده|sqlite|api)/i.test(normalized)) {
      usedContextMemory = true;
      resolvedReferences.push(`المجال السياقي: ${domainEntity.nameAr}`);
    }
  }
  if (!domainEntity) {
    domainEntity = { nameEn: "tasks", nameAr: "المهام", fields: ["title", "priority", "done"] };
  }

  let filename = fileMatch ? fileMatch[1] : null;
  if (!filename && contextHint?.lastFile && /(اقراه|افتحه|شوفه|اختبره|شغله|صلحه|عدله|حسنه|اشرحه|الملف ده|الكود ده|ضيفله|زودله)/.test(normalized)) {
    filename = contextHint.lastFile;
    usedContextMemory = true;
    resolvedReferences.push(`الملف النشط: ${filename}`);
  }

  let requestedFeature: string | null = null;
  const featMatch = raw.match(/(?:ضيف|زود|اضف)(?:له|لها| فيه)?\s+(?:دالة|ميزة|خاصية)?\s*([^\n،.]+)/i);
  if (featMatch && featMatch[1]) {
    requestedFeature = featMatch[1].trim();
  }

  const withTests = !/(بدون اختبار|من غير تيست|without test)/i.test(normalized);

  return {
    filename,
    searchQuery,
    command: cmdMatch ? cmdMatch[1] : null,
    framework,
    domainEntity,
    withTests,
    usedContextMemory,
    resolvedReferences,
    requestedFeature,
  };
}

let singletonModel: NawaNeuralModel | null = null;

export function getNawaModel(): NawaNeuralModel {
  if (!singletonModel) {
    singletonModel = new NawaNeuralModel();
  }
  return singletonModel;
}
