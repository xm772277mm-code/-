import React, { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, Megaphone, X } from "lucide-react";
import type { AppOpenAdConfig, AppOpenAdCreative } from "../hooks/useAppOpenAds.ts";

interface AppOpenAdOverlayProps {
  open: boolean;
  creative: AppOpenAdCreative;
  adConfig: AppOpenAdConfig;
  onDismiss: () => void;
  onAdClick: () => void;
}

export default function AppOpenAdOverlay({
  open,
  creative,
  adConfig,
  onDismiss,
  onAdClick,
}: AppOpenAdOverlayProps) {
  const { countdownSeconds, adMobUnitId, adSenseClientId, adSenseSlotId } = adConfig;
  const hasLiveAdSense =
    /^ca-pub-\d+$/.test(adSenseClientId.trim()) && /^\d+$/.test(adSenseSlotId.trim());

  const [secondsLeft, setSecondsLeft] = useState<number>(countdownSeconds);
  const [canSkip, setCanSkip] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!open || !hasLiveAdSense) return;
    const client = adSenseClientId.trim();
    const existing = document.querySelector(`script[data-nawa-adsense="${client}"]`);
    if (!existing) {
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      s.setAttribute("data-nawa-adsense", client);
      document.head.appendChild(s);
    }
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      // ignore adblock or offline environment
    }
  }, [open, hasLiveAdSense, adSenseClientId, adSenseSlotId]);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(countdownSeconds);
    setCanSkip(false);
    setDetailsOpen(false);

    const skipUnlockTimer = window.setTimeout(() => {
      setCanSkip(true);
    }, 1000);

    return () => window.clearTimeout(skipUnlockTimer);
  }, [open, countdownSeconds, creative.id]);

  useEffect(() => {
    if (!open || detailsOpen) return;
    if (secondsLeft <= 0) {
      onDismiss();
      return;
    }
    const tick = window.setTimeout(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(tick);
  }, [open, secondsLeft, detailsOpen, onDismiss]);

  useEffect(() => {
    if (!open || !canSkip) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, canSkip, onDismiss]);

  if (!open) return null;

  const progressPct = Math.min(
    100,
    Math.max(0, ((countdownSeconds - secondsLeft) / Math.max(1, countdownSeconds)) * 100)
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="إعلان فتح التطبيق"
      className="fixed inset-0 z-50 flex flex-col justify-between transition-opacity duration-200"
      style={{
        backgroundColor: "var(--nawa-bg)",
        color: "var(--nawa-text)",
      }}
    >
      {/* Top Progress Strip */}
      <div className="h-1 w-full" style={{ backgroundColor: "var(--nawa-elevated)" }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${progressPct}%`,
            backgroundColor: "var(--nawa-accent)",
          }}
        />
      </div>

      {/* Header Bar: App Identity + Skip Action */}
      <div
        className="flex h-16 items-center justify-between border-b px-4 sm:px-8"
        style={{ borderColor: "var(--nawa-border)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: creative.accentTint }}
          >
            <Megaphone className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-bold truncate">
              نواة · {hasLiveAdSense ? "إعلان فتح التطبيق (Google AdSense)" : "معاينة إعلان فتح التطبيق"}
            </div>
            <div className="flex items-center gap-2 text-xs truncate" style={{ color: "var(--nawa-muted)" }}>
              <span>{hasLiveAdSense ? "شبكة Google AdSense الحية" : "معاينة الويب · AdMob يعمل تلقائياً في حزمة APK"}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={!canSkip}
          onClick={onDismiss}
          className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
            color: "var(--nawa-text)",
          }}
        >
          {canSkip ? (
            <>
              <span>تخطي الإعلان</span>
              <span className="tabular-nums" style={{ color: "var(--nawa-muted)" }}>
                ({secondsLeft}ث)
              </span>
              <X className="h-3.5 w-3.5" />
            </>
          ) : (
            <span className="tabular-nums">جاري التجهيز ({secondsLeft}ث)</span>
          )}
        </button>
      </div>

      {/* Main Ad Showcase Stage */}
      <div className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-8 sm:px-8">
        <div
          className="w-full overflow-hidden rounded-2xl border shadow-sm"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="grid grid-cols-1 items-stretch md:grid-cols-12">
            {/* Editorial Geometric Visual Panel */}
            <div
              className="relative flex min-h-[200px] flex-col justify-between p-6 md:col-span-5"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
              }}
            >
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--nawa-muted)" }}>
                <span className="font-semibold">{creative.sponsor}</span>
                <span>App Open Unit</span>
              </div>

              {/* Clean Bespoke Geometric SVG Artwork */}
              <div className="my-6 flex items-center justify-center">
                <svg
                  width="160"
                  height="120"
                  viewBox="0 0 160 120"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="14"
                    y="16"
                    width="132"
                    height="88"
                    rx="14"
                    stroke="currentColor"
                    strokeOpacity="0.18"
                    strokeWidth="1.5"
                  />
                  <rect
                    x="28"
                    y="30"
                    width="64"
                    height="10"
                    rx="5"
                    fill={creative.accentTint}
                    fillOpacity="0.85"
                  />
                  <rect
                    x="28"
                    y="48"
                    width="104"
                    height="8"
                    rx="4"
                    fill="currentColor"
                    fillOpacity="0.14"
                  />
                  <rect
                    x="28"
                    y="62"
                    width="88"
                    height="8"
                    rx="4"
                    fill="currentColor"
                    fillOpacity="0.1"
                  />
                  <circle
                    cx="122"
                    cy="84"
                    r="12"
                    fill={creative.accentTint}
                    fillOpacity="0.2"
                    stroke={creative.accentTint}
                    strokeWidth="1.5"
                  />
                </svg>
              </div>

              <div className="text-xs font-medium" style={{ color: "var(--nawa-muted)" }}>
                {creative.offerNote}
              </div>
            </div>

            {/* Ad Copy & Actions */}
            <div className="flex flex-col justify-between p-6 sm:p-8 md:col-span-7">
              <div>
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--nawa-muted)" }}>
                  <span>{creative.sponsor}</span>
                  <span aria-hidden="true">·</span>
                  <span>{creative.category}</span>
                </div>

                <h2
                  className="mt-2 font-display text-2xl font-bold leading-snug"
                  style={{ textWrap: "balance" }}
                >
                  {creative.headline}
                </h2>

                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
                  {creative.body}
                </p>

                {hasLiveAdSense ? (
                  <div
                    className="mt-4 rounded-xl border p-3"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                    }}
                  >
                    <ins
                      className="adsbygoogle block"
                      style={{ display: "block", minHeight: "120px" }}
                      data-ad-client={adSenseClientId.trim()}
                      data-ad-slot={adSenseSlotId.trim()}
                      data-ad-format="auto"
                      data-full-width-responsive="true"
                    />
                  </div>
                ) : (
                  <p
                    className="mt-3 rounded-xl border px-3 py-2 text-xs leading-relaxed"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                      color: "var(--nawa-muted)",
                    }}
                  >
                    ملاحظة تقنية: حزمة <strong>Google AdMob</strong> تعمل داخل تطبيق الأندرويد (APK) عبر{" "}
                    <span className="font-mono">AppOpenAdManager.kt</span>. هذه شاشة المعاينة على الويب؛ ويمكنك إدخال
                    معرّف <strong>Google AdSense</strong> من الإعدادات لعرض إعلانات ويب حية، أو إدخال معرّفات AdMob لتصديرها داخل APK.
                  </p>
                )}

                {detailsOpen && (
                  <div
                    className="mt-4 space-y-2 border-t pt-4"
                    style={{ borderColor: "var(--nawa-border)" }}
                  >
                    {creative.details.map((line) => (
                      <div key={line} className="flex items-start gap-2 text-xs leading-relaxed">
                        <CheckCircle2
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          style={{ color: creative.accentTint }}
                        />
                        <span>{line}</span>
                      </div>
                    ))}
                    <div className="pt-1 font-mono text-[11px]" style={{ color: "var(--nawa-muted)" }} dir="ltr">
                      Android AdMob Unit: {adMobUnitId}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!detailsOpen) {
                      onAdClick();
                      setDetailsOpen(true);
                    } else {
                      onDismiss();
                    }
                  }}
                  className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-xs font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap"
                  style={{ backgroundColor: creative.accentTint }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>{detailsOpen ? "إغلاق والمتابعة للتطبيق" : creative.ctaLabel}</span>
                </button>

                <button
                  type="button"
                  onClick={onDismiss}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-xs font-medium transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                >
                  <span>الدخول مباشرة إلى نواة</span>
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clean Footer Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs sm:px-8"
        style={{
          borderColor: "var(--nawa-border)",
          color: "var(--nawa-muted)",
        }}
      >
        <span>إعلان فتح التطبيق · يمكنك تخصيص أو تعطيل الإعلانات من إعدادات الواجهة</span>
        <span className="font-mono text-[11px]" dir="ltr">
          {adMobUnitId}
        </span>
      </div>
    </div>
  );
}
