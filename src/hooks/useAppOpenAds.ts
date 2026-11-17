import { useCallback, useEffect, useRef, useState } from "react";

export interface AppOpenAdConfig {
  enabled: boolean;
  showOnResume: boolean;
  countdownSeconds: 3 | 4 | 5;
  adMobAppId: string;
  adMobUnitId: string;
  adSenseClientId: string;
  adSenseSlotId: string;
  impressions: number;
  clicks: number;
}

export interface AppOpenAdCreative {
  id: string;
  sponsor: string;
  category: string;
  headline: string;
  body: string;
  ctaLabel: string;
  offerNote: string;
  details: string[];
  accentTint: string;
}

const AD_STORAGE_KEY = "nawa_app_open_ads_v1";

export const DEFAULT_APP_OPEN_AD_CONFIG: AppOpenAdConfig = {
  enabled: true,
  showOnResume: true,
  countdownSeconds: 4,
  adMobAppId: "ca-app-pub-3940256099942544~3347511713",
  adMobUnitId: "ca-app-pub-3940256099942544/9257395921",
  adSenseClientId: "",
  adSenseSlotId: "",
  impressions: 0,
  clicks: 0,
};

export const APP_OPEN_CREATIVES: AppOpenAdCreative[] = [
  {
    id: "nawa-edge-build",
    sponsor: "NawaEdge Cloud",
    category: "بنية التطوير والتجميع",
    headline: "جمّع حزم Android APK و Windows EXE بسرعة مضاعفة",
    body: "بيئة بناء محلية وسحابية مهيأة لتسريع تعليمات ARM64 NEON و AVX2 مع ضغط ذكي لأوزان النماذج اللغوية.",
    ctaLabel: "عرض تفاصيل الباقة",
    offerNote: "تجربة مجانية للمطورين · متوافق مع NawaCore",
    details: [
      "توقيع تلقائي لحزم Android APK وإخراج ملفات التثبيت بدون تعقيد.",
      "ضغط أوزان النماذج بنسبة تصل إلى 42% لتقليل حجم التطبيق النهائي.",
      "دعم كامل لتكامل إعلانات فتح التطبيق Google AdMob App Open SDK.",
    ],
    accentTint: "var(--nawa-accent)",
  },
  {
    id: "vault-sqlite-sync",
    sponsor: "VaultSQLite Sync",
    category: "قواعد البيانات المحلية",
    headline: "مزامنة فورية ومشفرة لقواعد بيانات التطبيقات الأوفلاين",
    body: "احفظ سجل المحادثات وبيانات المستخدم على الهاتف أو الكمبيوتر بوضع WAL فائق السرعة مع تشفير كامل قبل الرفع.",
    ctaLabel: "استكشاف المزايا",
    offerNote: "زمن استجابة أقل من 2 مللي ثانية",
    details: [
      "دعم محلي خفيف يستهلك أقل من 8 ميجابايت من الذاكرة العشوائية.",
      "مزامنة تفاضلية توفر 85% من استهلاك باقة الإنترنت على الهواتف.",
      "تكامل مباشر مع قواعد Firestore والمصادقة بحساب Google.",
    ],
    accentTint: "#2563EB",
  },
  {
    id: "deep-arabic-lab",
    sponsor: "DeepArabic Lab",
    category: "هندسة الذكاء الاصطناعي",
    headline: "إتقان بناء المحوّلات اللغوية العربية وحراس السياق",
    body: "مسار عملي لبناء نماذج لغوية محلية تفهم اللهجات العربية وتمنع الانحراف السياقي مع تقليل استهلاك المعالج.",
    ctaLabel: "معاينة المسار",
    offerNote: "شهادة تطبيقية · 18 مختبراً تفاعلياً",
    details: [
      "شرح تطبيقي لآلية الانتباه الذاتي (Self-Attention) وضغط KV Cache.",
      "استراتيجيات فهرسة الأسئلة الدلالية للمنصات المكتبية والمحمولة.",
      "تدريب عملي على التحقق الدلالي ومنع الهلوسة النصية.",
    ],
    accentTint: "#059669",
  },
];

export function loadAppOpenAdConfig(): AppOpenAdConfig {
  try {
    const raw = localStorage.getItem(AD_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_OPEN_AD_CONFIG;
    return { ...DEFAULT_APP_OPEN_AD_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_APP_OPEN_AD_CONFIG;
  }
}

export function saveAppOpenAdConfig(cfg: AppOpenAdConfig): void {
  try {
    localStorage.setItem(AD_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage errors
  }
}

export function useAppOpenAds() {
  const [config, setConfig] = useState<AppOpenAdConfig>(() => loadAppOpenAdConfig());
  const [visible, setVisible] = useState<boolean>(() => loadAppOpenAdConfig().enabled);
  const [creativeIndex, setCreativeIndex] = useState<number>(() =>
    Math.floor(Math.random() * APP_OPEN_CREATIVES.length)
  );
  const hiddenAtRef = useRef<number | null>(null);
  const countedImpressionRef = useRef<boolean>(false);

  const updateConfig = useCallback((patch: Partial<AppOpenAdConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveAppOpenAdConfig(next);
      return next;
    });
  }, []);

  const recordImpression = useCallback(() => {
    setConfig((prev) => {
      const next = { ...prev, impressions: prev.impressions + 1 };
      saveAppOpenAdConfig(next);
      return next;
    });
  }, []);

  const recordClick = useCallback(() => {
    setConfig((prev) => {
      const next = { ...prev, clicks: prev.clicks + 1 };
      saveAppOpenAdConfig(next);
      return next;
    });
  }, []);

  // Count initial impression when displayed
  useEffect(() => {
    if (visible && !countedImpressionRef.current) {
      countedImpressionRef.current = true;
      recordImpression();
    } else if (!visible) {
      countedImpressionRef.current = false;
    }
  }, [visible, recordImpression]);

  // Listen to tab visibility changes (simulates Android ProcessLifecycleOwner ON_START resume ad)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        const awayMs = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
        hiddenAtRef.current = null;
        if (config.enabled && config.showOnResume && awayMs >= 30_000 && !visible) {
          setCreativeIndex((idx) => (idx + 1) % APP_OPEN_CREATIVES.length);
          setVisible(true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [config.enabled, config.showOnResume, visible]);

  const showPreviewAd = useCallback(() => {
    setCreativeIndex((idx) => (idx + 1) % APP_OPEN_CREATIVES.length);
    setVisible(true);
  }, []);

  const dismissAd = useCallback(() => {
    setVisible(false);
  }, []);

  return {
    config,
    updateConfig,
    visible,
    creative: APP_OPEN_CREATIVES[creativeIndex % APP_OPEN_CREATIVES.length],
    showPreviewAd,
    dismissAd,
    recordClick,
  };
}
