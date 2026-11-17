import React from "react";
import { Megaphone, Monitor, Play, RotateCcw, Smartphone, X } from "lucide-react";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";
import type { AppOpenAdConfig } from "../hooks/useAppOpenAds.ts";
import type {
  AccentPreset,
  DensityPreset,
  DirectionPreset,
  FontPreset,
  FontSizePreset,
  ThemePreset,
} from "../firebase.ts";

interface UiCustomizerModalProps {
  open: boolean;
  onClose: () => void;
  adConfig: AppOpenAdConfig;
  onUpdateAdConfig: (patch: Partial<AppOpenAdConfig>) => void;
  onPreviewAppOpenAd: () => void;
}

const THEME_OPTIONS: Array<{ id: ThemePreset; label: string; bg: string; fg: string }> = [
  { id: "claude-light", label: "كلود فاتح دافئ", bg: "#FAF9F5", fg: "#1F1E1A" },
  { id: "claude-dark", label: "كلود فحمي داكن", bg: "#21201C", fg: "#F4F1EA" },
  { id: "sand", label: "ورق رملي مريح", bg: "#F6F1E7", fg: "#2A2116" },
  { id: "midnight", label: "ليلي عميق", bg: "#0F131A", fg: "#EEF2F7" },
];

const ACCENT_OPTIONS: Array<{ id: AccentPreset; label: string; hex: string }> = [
  { id: "terracotta", label: "عنبر كلود", hex: "#C96442" },
  { id: "hydrogen", label: "هيدروجين أزرق", hex: "#2563EB" },
  { id: "emerald", label: "زمردي", hex: "#059669" },
  { id: "plum", label: "بنفسجي", hex: "#7C3AED" },
];

const FONT_OPTIONS: Array<{ id: FontPreset; label: string }> = [
  { id: "editorial", label: "تحريري كلود (Editorial)" },
  { id: "modern", label: "عصري واضح (Sans)" },
  { id: "technical", label: "تقني للمبرمجين (Mono)" },
];

export default function UiCustomizerModal({
  open,
  onClose,
  adConfig,
  onUpdateAdConfig,
  onPreviewAppOpenAd,
}: UiCustomizerModalProps) {
  const { settings, updateSettings, resetSettings, user } = useUiSettings();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border p-6 shadow-xl"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
          color: "var(--nawa-text)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b pb-4"
          style={{ borderColor: "var(--nawa-border)" }}
        >
          <div>
            <h2 className="font-display text-lg font-bold">تخصيص واجهة المستخدم والنموذج</h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--nawa-muted)" }}>
              {user
                ? `يتم حفظ تخصيصاتك تلقائياً على حسابك (${user.email})`
                : "سجّل الدخول بحساب Google لمزامنة تخصيصاتك عبر أجهزتك."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
            style={{ borderColor: "var(--nawa-border)", color: "var(--nawa-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* Theme Preset */}
          <div>
            <div className="mb-2 text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
              سمة المظهر والألوان (Theme)
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {THEME_OPTIONS.map((opt) => {
                const active = settings.themePreset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSettings({ themePreset: opt.id })}
                    className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-medium transition-all"
                    style={{
                      backgroundColor: opt.bg,
                      color: opt.fg,
                      borderColor: active ? "var(--nawa-accent)" : "var(--nawa-border)",
                      boxShadow: active ? "0 0 0 2px var(--nawa-accent-soft)" : "none",
                    }}
                  >
                    <span>{opt.label}</span>
                    {active && (
                      <span
                        className="text-[11px] font-bold"
                        style={{ color: "var(--nawa-accent)" }}
                      >
                        مفعّل
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent Color */}
          <div>
            <div className="mb-2 text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
              لون التمييز التفاعلي (Accent)
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ACCENT_OPTIONS.map((acc) => {
                const active = settings.accentColor === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => updateSettings({ accentColor: acc.id })}
                    className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: active ? acc.hex : "var(--nawa-border)",
                    }}
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full"
                      style={{ backgroundColor: acc.hex }}
                    />
                    <span className="truncate">{acc.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Device Knowledge Base Tier (50B Desktop vs 50M Mobile) */}
          <div>
            <div className="mb-2 text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
              قاعدة الأسئلة وسعة المعرفة حسب الجهاز
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => updateSettings({ deviceProfile: "desktop-50b" })}
                className="flex items-start gap-2.5 rounded-xl border p-3 text-right transition-colors"
                style={{
                  backgroundColor:
                    settings.deviceProfile === "desktop-50b"
                      ? "var(--nawa-accent-soft)"
                      : "var(--nawa-elevated)",
                  borderColor:
                    settings.deviceProfile === "desktop-50b"
                      ? "var(--nawa-accent)"
                      : "var(--nawa-border)",
                }}
              >
                <Monitor className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--nawa-accent)" }} />
                <div>
                  <div className="text-xs font-semibold">إصدار الكمبيوتر · 50 مليار سؤال</div>
                  <div className="mt-0.5 text-[11px] tabular-nums" style={{ color: "var(--nawa-muted)" }}>
                    50,000,000,000 سؤال · 4,096 شريحة دلالية
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => updateSettings({ deviceProfile: "mobile-50m" })}
                className="flex items-start gap-2.5 rounded-xl border p-3 text-right transition-colors"
                style={{
                  backgroundColor:
                    settings.deviceProfile === "mobile-50m"
                      ? "var(--nawa-accent-soft)"
                      : "var(--nawa-elevated)",
                  borderColor:
                    settings.deviceProfile === "mobile-50m"
                      ? "var(--nawa-accent)"
                      : "var(--nawa-border)",
                }}
              >
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--nawa-accent)" }} />
                <div>
                  <div className="text-xs font-semibold">إصدار الهاتف · 50 مليون سؤال</div>
                  <div className="mt-0.5 text-[11px] tabular-nums" style={{ color: "var(--nawa-muted)" }}>
                    50,000,000 سؤال · 512 شريحة موفرة للرام
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Font Family, Size, Density, Direction */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                نمط الخط (Typography)
              </label>
              <select
                value={settings.fontFamily}
                onChange={(e) => updateSettings({ fontFamily: e.target.value as FontPreset })}
                className="w-full rounded-xl border px-3 py-2 text-xs focus:outline-none"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                حجم النص (Font Size)
              </label>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl border p-1" style={{ borderColor: "var(--nawa-border)", backgroundColor: "var(--nawa-elevated)" }}>
                {(
                  [
                    { id: "sm", label: "صغير" },
                    { id: "md", label: "متوسط" },
                    { id: "lg", label: "كبير" },
                  ] as Array<{ id: FontSizePreset; label: string }>
                ).map((sz) => (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => updateSettings({ fontSize: sz.id })}
                    className="rounded-lg py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: settings.fontSize === sz.id ? "var(--nawa-surface)" : "transparent",
                      color: settings.fontSize === sz.id ? "var(--nawa-text)" : "var(--nawa-muted)",
                    }}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                كثافة العرض (Density)
              </label>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border p-1" style={{ borderColor: "var(--nawa-border)", backgroundColor: "var(--nawa-elevated)" }}>
                {(
                  [
                    { id: "comfortable", label: "مريح (كلود)" },
                    { id: "compact", label: "مكثف" },
                  ] as Array<{ id: DensityPreset; label: string }>
                ).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => updateSettings({ density: d.id })}
                    className="rounded-lg py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: settings.density === d.id ? "var(--nawa-surface)" : "transparent",
                      color: settings.density === d.id ? "var(--nawa-text)" : "var(--nawa-muted)",
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                اتجاه الواجهة (Direction)
              </label>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border p-1" style={{ borderColor: "var(--nawa-border)", backgroundColor: "var(--nawa-elevated)" }}>
                {(
                  [
                    { id: "rtl", label: "يمين - يسار (RTL)" },
                    { id: "ltr", label: "يسار - يمين (LTR)" },
                  ] as Array<{ id: DirectionPreset; label: string }>
                ).map((dir) => (
                  <button
                    key={dir.id}
                    type="button"
                    onClick={() => updateSettings({ direction: dir.id })}
                    className="rounded-lg py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: settings.direction === dir.id ? "var(--nawa-surface)" : "transparent",
                      color: settings.direction === dir.id ? "var(--nawa-text)" : "var(--nawa-muted)",
                    }}
                  >
                    {dir.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* App Open Ads Management */}
          <div
            className="border-t pt-5"
            style={{ borderColor: "var(--nawa-border)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
                <span className="text-xs font-semibold">إعلانات فتح التطبيق (App Open Ads)</span>
              </div>
              <div className="flex items-center gap-2 text-xs tabular-nums" style={{ color: "var(--nawa-muted)" }}>
                <span>الظهور: {adConfig.impressions}</span>
                <span aria-hidden="true">·</span>
                <span>النقرات: {adConfig.clicks}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onUpdateAdConfig({ enabled: !adConfig.enabled })}
                className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: adConfig.enabled ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                  borderColor: adConfig.enabled ? "var(--nawa-accent)" : "var(--nawa-border)",
                }}
              >
                <span>عرض الإعلان عند فتح التطبيق</span>
                <span className="font-bold" style={{ color: adConfig.enabled ? "var(--nawa-accent)" : "var(--nawa-muted)" }}>
                  {adConfig.enabled ? "مفعّل" : "معطّل"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onUpdateAdConfig({ showOnResume: !adConfig.showOnResume })}
                className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: adConfig.showOnResume ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                  borderColor: adConfig.showOnResume ? "var(--nawa-accent)" : "var(--nawa-border)",
                }}
              >
                <span>إظهار عند العودة من الخلفية</span>
                <span className="font-bold" style={{ color: adConfig.showOnResume ? "var(--nawa-accent)" : "var(--nawa-muted)" }}>
                  {adConfig.showOnResume ? "مفعّل" : "معطّل"}
                </span>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                  مدة العد التنازلي
                </label>
                <div
                  className="grid grid-cols-3 gap-1.5 rounded-xl border p-1"
                  style={{ borderColor: "var(--nawa-border)", backgroundColor: "var(--nawa-elevated)" }}
                >
                  {([3, 4, 5] as const).map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => onUpdateAdConfig({ countdownSeconds: sec })}
                      className="rounded-lg py-1.5 text-xs font-medium tabular-nums transition-colors"
                      style={{
                        backgroundColor: adConfig.countdownSeconds === sec ? "var(--nawa-surface)" : "transparent",
                        color: adConfig.countdownSeconds === sec ? "var(--nawa-text)" : "var(--nawa-muted)",
                      }}
                    >
                      {sec} ثوانٍ
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                  معرّف تطبيق AdMob (للأندرويد APK)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={adConfig.adMobAppId}
                  onChange={(e) => onUpdateAdConfig({ adMobAppId: e.target.value })}
                  placeholder="ca-app-pub-xxxxxxxxxxxxxxxx~xxxxxxxxxx"
                  className="w-full rounded-xl border px-3 py-2 font-mono text-xs focus:outline-none"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                  معرّف وحدة AdMob App Open (للأندرويد APK)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={adConfig.adMobUnitId}
                  onChange={(e) => onUpdateAdConfig({ adMobUnitId: e.target.value })}
                  placeholder="ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx"
                  className="w-full rounded-xl border px-3 py-2 font-mono text-xs focus:outline-none"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
                  معرّف Google AdSense للويب (اختياري)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    dir="ltr"
                    value={adConfig.adSenseClientId}
                    onChange={(e) => onUpdateAdConfig({ adSenseClientId: e.target.value })}
                    placeholder="ca-pub-..."
                    className="w-full rounded-xl border px-2.5 py-2 font-mono text-xs focus:outline-none"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                      color: "var(--nawa-text)",
                    }}
                  />
                  <input
                    type="text"
                    dir="ltr"
                    value={adConfig.adSenseSlotId}
                    onChange={(e) => onUpdateAdConfig({ adSenseSlotId: e.target.value })}
                    placeholder="Slot ID"
                    className="w-full rounded-xl border px-2.5 py-2 font-mono text-xs focus:outline-none"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                      color: "var(--nawa-text)",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <a
                href={`/api/packaging/download/apk-kit?adMobAppId=${encodeURIComponent(adConfig.adMobAppId)}&adMobUnitId=${encodeURIComponent(adConfig.adMobUnitId)}`}
                download="NawaCore-Android-APK-Kit.zip"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-medium transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-accent)",
                }}
              >
                <span>تصدير حزمة APK بهذه المعرّفات</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPreviewAppOpenAd();
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold transition-colors whitespace-nowrap"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
              >
                <Play className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
                <span>معاينة إعلان فتح التطبيق الآن</span>
              </button>
            </div>
          </div>
        </div>

        <div
          className="mt-6 flex items-center justify-between border-t pt-4"
          style={{ borderColor: "var(--nawa-border)" }}
        >
          <button
            type="button"
            onClick={resetSettings}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--nawa-border)", color: "var(--nawa-muted)" }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-5 py-2 text-xs font-semibold text-white"
            style={{ backgroundColor: "var(--nawa-accent)" }}
          >
            تم الحفظ
          </button>
        </div>
      </div>
    </div>
  );
}
