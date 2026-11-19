import React from "react";
import { RotateCcw, X } from "lucide-react";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";
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
}

const THEME_OPTIONS: Array<{ id: ThemePreset; label: string; bg: string; fg: string }> = [
  { id: "claude-light", label: "نهاري واضح (افتراضي)", bg: "#F8FAFC", fg: "#0F172A" },
  { id: "claude-dark", label: "فحمي داكن", bg: "#18181B", fg: "#F4F4F5" },
  { id: "sand", label: "ورق دافئ مريح", bg: "#F7F4EE", fg: "#26211B" },
  { id: "midnight", label: "ليلي عميق", bg: "#0B1120", fg: "#F1F5F9" },
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
            <h2 className="font-display text-lg font-bold">تخصيص المظهر والخطوط</h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--nawa-muted)" }}>
              {user
                ? `تُحفظ تفضيلاتك تلقائياً على حسابك (${user.email})`
                : "سجّل الدخول بحساب Google لمزامنة تفضيلاتك عبر أجهزتك."}
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
