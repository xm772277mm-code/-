import React, { useEffect, useState } from "react";
import {
  Check,
  Cloud,
  Copy,
  Database,
  Globe,
  Info,
  LogIn,
  Server,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";

interface HealthStatus {
  status: string;
  service: string;
  engineDefault: string;
  cloudModel: string;
  cloudAuthRequired?: boolean;
  billingMode?: string;
  hasGeminiKey: boolean;
  firebaseProjectId: string;
  firestoreDatabaseId: string;
  region: string;
  runtimeEnv: string;
  port: number;
}

export default function CloudHostingView() {
  const { user, signingIn, signInWithGoogle, dailyQuota, monthlyUsage, refreshDailyQuota } =
    useUiSettings();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setHealth(d);
      })
      .catch(() => null);
    if (user) {
      void refreshDailyQuota();
    }
  }, [user?.uid]);

  const copyCommand = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const cloudRunCmd = `gcloud run deploy nawacore-studio \\
  --source . \\
  --project poised-subject-cfx4d \\
  --region europe-west1 \\
  --allow-unauthenticated \\
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest`;

  const firebaseDeployCmd = `npm run build && firebase deploy --only hosting,firestore:rules --project poised-subject-cfx4d`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header Card */}
      <div
        className="rounded-2xl border p-6"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
              <h2 className="font-display text-xl font-bold">
                الاستضافة السحابية ونظام حصص حسابات Google
              </h2>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
              يعمل التطبيق بنموذج{" "}
              <strong style={{ color: "var(--nawa-text)" }}>Gemini 3.1 Flash Lite</strong> السحابي عبر
              الخادم مع التحقق الإلزامي من هوية مستخدم Google عبر{" "}
              <strong style={{ color: "var(--nawa-text)" }}>Firebase Auth ID Token</strong> وربط
              الاستهلاك والحصة اليومية والشهرية بكل حساب مسجّل.
            </p>
          </div>

          <div
            className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
              color: health?.status === "ok" ? "#059669" : "var(--nawa-muted)",
            }}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{health?.status === "ok" ? "الخادم السحابي جاهز" : "جاري فحص الجاهزية..."}</span>
          </div>
        </div>
      </div>

      {/* Per-User Google Account Quota & Honest Billing Explanation */}
      <div
        className="rounded-2xl border p-6 space-y-4"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
            <h3 className="font-display text-base font-bold">
              حالة الفوترة والحصص لحساب Google المسجّل
            </h3>
          </div>
          {!user && (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void signInWithGoogle()}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{signingIn ? "جاري الدخول..." : "تسجيل الدخول بحساب Google"}</span>
            </button>
          )}
        </div>

        {user ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div
              className="rounded-xl border p-4 space-y-1"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
              }}
            >
              <div className="text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                الحساب المسجّل المعتمد
              </div>
              <div className="truncate font-mono text-sm font-bold" dir="ltr">
                {user.email}
              </div>
              <div className="truncate font-mono text-[11px]" style={{ color: "var(--nawa-muted)" }} dir="ltr">
                UID: {user.uid}
              </div>
            </div>

            <div
              className="rounded-xl border p-4 space-y-1"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
              }}
            >
              <div className="text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                الحصة اليومية على الخادم ({dailyQuota?.dayKey || "اليوم"})
              </div>
              <div className="font-mono text-sm font-bold tabular-nums" dir="ltr">
                {dailyQuota
                  ? `${dailyQuota.requestsToday} / ${dailyQuota.dailyRequestLimit} req`
                  : "0 / 60 req"}
              </div>
              <div className="font-mono text-[11px] tabular-nums" style={{ color: "var(--nawa-muted)" }} dir="ltr">
                {dailyQuota
                  ? `${dailyQuota.tokensToday.toLocaleString()} / ${dailyQuota.dailyTokenLimit.toLocaleString()} tok`
                  : "0 / 150,000 tok"}
              </div>
            </div>

            <div
              className="rounded-xl border p-4 space-y-1"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
              }}
            >
              <div className="text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                السجل الشهري في Firestore ({monthlyUsage?.monthKey || "الشهر الحالي"})
              </div>
              <div className="font-mono text-sm font-bold tabular-nums" dir="ltr">
                {monthlyUsage ? `${monthlyUsage.requestsCount} طلبات` : "0 طلبات"}
              </div>
              <div className="font-mono text-[11px] tabular-nums" style={{ color: "var(--nawa-muted)" }} dir="ltr">
                {monthlyUsage ? `${monthlyUsage.tokensCount.toLocaleString()} توكن` : "0 توكن"}
              </div>
            </div>
          </div>
        ) : (
          <div
            className="rounded-xl border p-4 text-xs leading-relaxed"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
              color: "var(--nawa-muted)",
            }}
          >
            المستخدمون غير المسجّلين لا يمكنهم استهلاك المحرك السحابي (يتم طلب تسجيل الدخول بحساب Google أولاً)، بينما يظل «نموذج صغير (النسخة التجريبية)» متاحاً مجاناً للجميع.
          </div>
        )}

        <div
          className="flex items-start gap-2.5 rounded-xl border p-4 text-xs leading-relaxed"
          style={{
            backgroundColor: "var(--nawa-elevated)",
            borderColor: "var(--nawa-border)",
            color: "var(--nawa-muted)",
          }}
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--nawa-accent)" }} />
          <div className="space-y-1">
            <div className="font-semibold" style={{ color: "var(--nawa-text)" }}>
              آلية الفوترة الفعلية في Google Cloud و Gemini API:
            </div>
            <p>
              يتم الآن التحقق من رمز هوية Google (<span className="font-mono">verifyIdToken</span>) قبل أي طلب سحابي مع فرض حد استهلاك يومي وشهري منفصل لكل مستخدم لمنع الاستهلاك المجهول. أما الفوترة المالية المباشرة لـ Gemini API فتُخصم تقنياً من مشروع Google Cloud المرتبط بمفتاح الخادم (<span className="font-mono">GEMINI_API_KEY</span> في لوحة <strong style={{ color: "var(--nawa-text)" }}>Settings &gt; Secrets</strong>) ولا تدعم Google سحب الفاتورة تلقائياً من المحفظة الشخصية للزائر بمجرد تسجيل دخوله بـ Google Auth. إذا أردت نقل الفوترة الأساسية للمشروع إلى حساب Google آخر، بدّل المفتاح والمشروع من <strong style={{ color: "var(--nawa-text)" }}>Settings &gt; Secrets</strong> أو انشر الخدمة على Cloud Run تحت ذلك الحساب.
            </p>
          </div>
        </div>
      </div>

      {/* Live Infrastructure Specs Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div
          className="rounded-2xl border p-5 space-y-2"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--nawa-accent)" }}>
            <Globe className="h-4 w-4" />
            <span>النموذج السحابي المتصل</span>
          </div>
          <div className="font-mono text-base font-bold" dir="ltr">
            {health?.cloudModel || "gemini-3.1-flash-lite"}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
            يعمل عبر واجهة الخادم المحمية بتحقق هوية Google مع البحث الحي عبر Google Search.
          </p>
        </div>

        <div
          className="rounded-2xl border p-5 space-y-2"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--nawa-accent)" }}>
            <Server className="h-4 w-4" />
            <span>Google Cloud Run</span>
          </div>
          <div className="font-mono text-base font-bold" dir="ltr">
            {health?.service || "nawacore-studio"} · {health?.region || "europe-west1"}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
            حاوية Docker جاهزة + خط Cloud Build + دعم متغير المنفذ الديناميكي <span className="font-mono">PORT</span>{" "}
            ومسار الفحص <span className="font-mono">/api/health</span>.
          </p>
        </div>

        <div
          className="rounded-2xl border p-5 space-y-2"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--nawa-accent)" }}>
            <Database className="h-4 w-4" />
            <span>Firebase Hosting & Firestore</span>
          </div>
          <div className="font-mono text-base font-bold" dir="ltr">
            {health?.firebaseProjectId || "poised-subject-cfx4d"}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
            توجيه تلقائي لطلبات <span className="font-mono">/api/**</span> إلى Cloud Run مع حفظ الحسابات والمحادثات وسجل الاستهلاك في Firestore.
          </p>
        </div>
      </div>

      {/* Deployment Commands */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div
          className="rounded-2xl border p-5 space-y-3"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold">1. النشر على Google Cloud Run</h3>
              <p className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                ينشر الخادم والنموذج السحابي مباشرة عبر Dockerfile وSecret Manager
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyCommand("cloudrun", cloudRunCmd)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
              }}
            >
              {copiedKey === "cloudrun" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey === "cloudrun" ? "تم النسخ" : "نسخ"}</span>
            </button>
          </div>
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-xl p-3.5 text-left font-mono text-xs leading-relaxed"
            style={{
              backgroundColor: "var(--nawa-code-bg)",
              color: "var(--nawa-code-text)",
            }}
          >
            <code>{cloudRunCmd}</code>
          </pre>
        </div>

        <div
          className="rounded-2xl border p-5 space-y-3"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold">2. النشر على Firebase Hosting</h3>
              <p className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                يبني الواجهة ويربطها بخدمة Cloud Run وقواعد أمان Firestore
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyCommand("firebase", firebaseDeployCmd)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
              }}
            >
              {copiedKey === "firebase" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey === "firebase" ? "تم النسخ" : "نسخ"}</span>
            </button>
          </div>
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-xl p-3.5 text-left font-mono text-xs leading-relaxed"
            style={{
              backgroundColor: "var(--nawa-code-bg)",
              color: "var(--nawa-code-text)",
            }}
          >
            <code>{firebaseDeployCmd}</code>
          </pre>
        </div>
      </div>

      {/* Included Deployment Artifacts List */}
      <div
        className="rounded-2xl border p-5 space-y-2"
        style={{
          backgroundColor: "var(--nawa-elevated)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div className="font-display text-sm font-bold">ملفات البنية السحابية المضمّنة في المشروع:</div>
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3" style={{ color: "var(--nawa-muted)" }}>
          <div><span className="font-mono font-semibold" style={{ color: "var(--nawa-text)" }}>firebase.json</span> · ربط Hosting و Cloud Run</div>
          <div><span className="font-mono font-semibold" style={{ color: "var(--nawa-text)" }}>.firebaserc</span> · ربط مشروع poised-subject-cfx4d</div>
          <div><span className="font-mono font-semibold" style={{ color: "var(--nawa-text)" }}>apphosting.yaml</span> · إعداد Firebase App Hosting</div>
          <div><span className="font-mono font-semibold" style={{ color: "var(--nawa-text)" }}>Dockerfile</span> · حاوية Node 22 للإنتاج</div>
          <div><span className="font-mono font-semibold" style={{ color: "var(--nawa-text)" }}>cloudbuild.yaml</span> · خط بناء ونشر Cloud Build</div>
          <div><span className="font-mono font-semibold" style={{ color: "var(--nawa-text)" }}>firestore.rules</span> · قواعد أمان قاعدة البيانات</div>
        </div>
      </div>
    </div>
  );
}
