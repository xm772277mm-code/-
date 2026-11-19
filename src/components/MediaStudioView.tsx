import React, { useEffect, useState } from "react";
import {
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  LogIn,
  Music,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";
import { getGoogleAuthHeaders, recordCloudUsageInFirestore } from "../firebase.ts";

type MediaMode = "image" | "video" | "music";

interface SavedCreationItem {
  id: number;
  mediaType: string;
  modelName: string;
  prompt: string;
  summaryText: string | null;
  createdAt: string;
}

export default function MediaStudioView() {
  const { user, signingIn, signInWithGoogle, refreshDailyQuota } = useUiSettings();
  const [mode, setMode] = useState<MediaMode>("image");

  // Image state (gemini-nano-banana-2.1)
  const [imagePrompt, setImagePrompt] = useState(
    "A serene futuristic architectural courtyard in Cairo at golden hour, warm sandstone, lush palms, editorial photography"
  );
  const [imageAspect, setImageAspect] = useState<"1:1" | "16:9" | "9:16" | "4:3">("1:1");
  const [imageSize, setImageSize] = useState<"1K" | "2K">("1K");
  const [imageInputB64, setImageInputB64] = useState<string | null>(null);
  const [imageInputMime, setImageInputMime] = useState<string>("image/png");
  const [imageInputPreview, setImageInputPreview] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<{
    imageDataUrl: string | null;
    text: string;
  } | null>(null);

  // Video state (gemini-omni-1.2-flash)
  const [videoPrompt, setVideoPrompt] = useState(
    "Slow cinematic drone orbit around a glowing desert observatory under a starry sky, smooth motion"
  );
  const [videoAspect, setVideoAspect] = useState<"16:9" | "9:16">("16:9");
  const [videoDuration, setVideoDuration] = useState<"5s" | "10s">("5s");
  const [videoInputB64, setVideoInputB64] = useState<string | null>(null);
  const [videoInputMime, setVideoInputMime] = useState<string>("image/png");
  const [videoInputPreview, setVideoInputPreview] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<{
    videoDataUrl: string | null;
    text: string;
  } | null>(null);

  // Music state (lyria-3-clip-preview / lyria-3-pro-preview)
  const [musicPrompt, setMusicPrompt] = useState(
    "Uplifting Middle Eastern fusion soundtrack with warm oud melody, modern synth pads, and crisp percussion, 105 BPM"
  );
  const [musicDuration, setMusicDuration] = useState<"clip" | "full">("clip");
  const [musicResult, setMusicResult] = useState<{
    audioUri: string | null;
    text: string;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<SavedCreationItem[]>([]);

  const loadCreations = async () => {
    if (!user) {
      setHistoryItems([]);
      return;
    }
    try {
      const headers = await getGoogleAuthHeaders();
      const res = await fetch("/api/sql/creations", { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) setHistoryItems(data.items);
      }
    } catch {
      // ignore transient errors
    }
  };

  useEffect(() => {
    void loadCreations();
  }, [user?.uid]);

  const handleFileUpload = (
    file: File | undefined,
    target: "image" | "video"
  ) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError("يرجى اختيار صورة بحجم أقل من 8 ميجابايت.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const commaIdx = dataUrl.indexOf(",");
      if (commaIdx < 0) return;
      const b64 = dataUrl.slice(commaIdx + 1);
      const mime = file.type || "image/png";
      if (target === "image") {
        setImageInputB64(b64);
        setImageInputMime(mime);
        setImageInputPreview(dataUrl);
      } else {
        setVideoInputB64(b64);
        setVideoInputMime(mime);
        setVideoInputPreview(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const persistCreation = async (
    mediaType: MediaMode,
    modelName: string,
    prompt: string,
    summaryText: string
  ) => {
    if (!user) return;
    try {
      const headers = await getGoogleAuthHeaders();
      await fetch("/api/sql/creations", {
        method: "POST",
        headers,
        body: JSON.stringify({ mediaType, modelName, prompt, summaryText }),
      });
      void loadCreations();
    } catch {
      // non-fatal
    }
  };

  const handleGenerate = async () => {
    if (busy) return;
    if (!user) {
      setError("يلزم تسجيل الدخول بحساب Google لتوليد الصور والفيديو والموسيقى.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const headers = await getGoogleAuthHeaders();
      if (mode === "image") {
        const res = await fetch("/api/ai/image", {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt: imagePrompt,
            aspectRatio: imageAspect,
            imageSize,
            inputImageBase64: imageInputB64 || undefined,
            inputImageMimeType: imageInputMime,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "فشل توليد الصورة");
        setImageResult({ imageDataUrl: data.imageDataUrl, text: data.text });
        void recordCloudUsageInFirestore(user, Number(data.usageTokens || 500), "gemini-nano-banana-2.1");
        void refreshDailyQuota();
        void persistCreation("image", "gemini-nano-banana-2.1", imagePrompt, data.text || "صورة");
      } else if (mode === "video") {
        const res = await fetch("/api/ai/video", {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt: videoPrompt,
            aspectRatio: videoAspect,
            duration: videoDuration,
            inputImageBase64: videoInputB64 || undefined,
            inputImageMimeType: videoInputMime,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "فشل توليد الفيديو");
        setVideoResult({ videoDataUrl: data.videoDataUrl, text: data.text });
        void recordCloudUsageInFirestore(user, Number(data.usageTokens || 1200), "gemini-omni-1.2-flash");
        void refreshDailyQuota();
        void persistCreation("video", "gemini-omni-1.2-flash", videoPrompt, data.text || "فيديو");
      } else {
        const res = await fetch("/api/ai/music", {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt: musicPrompt,
            duration: musicDuration,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "فشل توليد الموسيقى");
        setMusicResult({ audioUri: data.audioUri, text: data.text });
        void recordCloudUsageInFirestore(user, Number(data.usageTokens || 500), data.model || "lyria-3-clip-preview");
        void refreshDailyQuota();
        void persistCreation("music", data.model || "lyria-3-clip-preview", musicPrompt, data.text || "موسيقى");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div
        className="rounded-2xl border p-6 space-y-5"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        {/* Header & Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">
              استوديو الوسائط الإبداعية
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--nawa-muted)" }}>
              إنشاء وتعديل الصور، تحريك الصور وتوليد الفيديو، وتأليف المقاطع الموسيقية.
            </p>
          </div>

          <div
            className="inline-grid grid-cols-3 gap-1 rounded-xl border p-1"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
            }}
            role="tablist"
          >
            {[
              { id: "image" as const, label: "الصور", icon: ImageIcon },
              { id: "video" as const, label: "الفيديو", icon: Film },
              { id: "music" as const, label: "الموسيقى", icon: Music },
            ].map((t) => {
              const Icon = t.icon;
              const active = mode === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setMode(t.id);
                    setError(null);
                  }}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: active ? "var(--nawa-surface)" : "transparent",
                    color: active ? "var(--nawa-accent)" : "var(--nawa-muted)",
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {!user && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 text-xs"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
            }}
          >
            <span style={{ color: "var(--nawa-text)" }}>
              سجّل الدخول بحساب Google لتفعيل إنشاء الصور والفيديو والموسيقى وحفظ سجل إبداعاتك.
            </span>
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void signInWithGoogle()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{signingIn ? "جاري الدخول..." : "دخول بحساب Google"}</span>
            </button>
          </div>
        )}

        {/* Mode 1: Image Create & Edit */}
        {mode === "image" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold">
                {imageInputPreview ? "وصف التعديل المطلوب على الصورة المرفوعة" : "وصف الصورة المطلوب إنشاؤها"}
              </label>
              <textarea
                rows={3}
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                className="w-full rounded-xl border p-3 text-sm focus:outline-none"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
                placeholder="اكتب وصفاً تفصيلياً للصورة أو التعديل..."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-xs font-medium hover:opacity-85"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                  }}
                >
                  <Upload className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
                  <span>{imageInputPreview ? "تغيير الصورة المرفوعة" : "رفع صورة لتعديلها (اختياري)"}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files?.[0], "image")}
                  />
                </label>

                {imageInputPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageInputB64(null);
                      setImageInputPreview(null);
                    }}
                    className="inline-flex h-10 items-center gap-1 rounded-xl border px-2.5 text-xs text-red-500"
                    style={{ borderColor: "var(--nawa-border)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>إزالة الصورة</span>
                  </button>
                )}

                <select
                  aria-label="نسبة الأبعاد"
                  value={imageAspect}
                  onChange={(e) => setImageAspect(e.target.value as typeof imageAspect)}
                  className="h-10 rounded-xl border px-3 text-xs focus:outline-none"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                >
                  <option value="1:1">مربع (1:1)</option>
                  <option value="16:9">عريض (16:9)</option>
                  <option value="9:16">طولي (9:16)</option>
                  <option value="4:3">كلاسيكي (4:3)</option>
                </select>

                <select
                  aria-label="الدقة"
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value as typeof imageSize)}
                  className="h-10 rounded-xl border px-3 text-xs focus:outline-none"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                >
                  <option value="1K">دقة 1K</option>
                  <option value="2K">دقة 2K</option>
                </select>
              </div>

              <button
                type="button"
                disabled={busy || !imagePrompt.trim()}
                onClick={() => void handleGenerate()}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>{imageInputPreview ? "تعديل الصورة" : "إنشاء الصورة"}</span>
              </button>
            </div>

            {imageInputPreview && (
              <div className="flex items-center gap-3 rounded-xl border p-2.5" style={{ borderColor: "var(--nawa-border)" }}>
                <img src={imageInputPreview} alt="معاينة الصورة الأصلية" className="h-14 w-14 rounded-lg object-cover" />
                <span className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                  الصورة المرجعية جاهزة للتعديل حسب الوصف أعلاه.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Mode 2: Video Generation & Image-to-Video Animation */}
        {mode === "video" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold">
                {videoInputPreview ? "وصف الحركة لتحريك الصورة إلى فيديو" : "وصف مشهد الفيديو المطلوب توليده"}
              </label>
              <textarea
                rows={3}
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                className="w-full rounded-xl border p-3 text-sm focus:outline-none"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
                placeholder="صف المشهد، زاوية الكاميرا، والإضاءة والحركة..."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-xs font-medium hover:opacity-85"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                  }}
                >
                  <Upload className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
                  <span>{videoInputPreview ? "تغيير صورة البداية" : "رفع صورة لتحريكها (اختياري)"}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files?.[0], "video")}
                  />
                </label>

                {videoInputPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setVideoInputB64(null);
                      setVideoInputPreview(null);
                    }}
                    className="inline-flex h-10 items-center gap-1 rounded-xl border px-2.5 text-xs text-red-500"
                    style={{ borderColor: "var(--nawa-border)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>إزالة</span>
                  </button>
                )}

                <select
                  aria-label="نسبة عرض الفيديو"
                  value={videoAspect}
                  onChange={(e) => setVideoAspect(e.target.value as typeof videoAspect)}
                  className="h-10 rounded-xl border px-3 text-xs focus:outline-none"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                >
                  <option value="16:9">عرضي (16:9)</option>
                  <option value="9:16">عمودي (9:16)</option>
                </select>

                <select
                  aria-label="مدة الفيديو"
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(e.target.value as typeof videoDuration)}
                  className="h-10 rounded-xl border px-3 text-xs focus:outline-none"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                >
                  <option value="5s">5 ثوانٍ</option>
                  <option value="10s">10 ثوانٍ</option>
                </select>
              </div>

              <button
                type="button"
                disabled={busy || !videoPrompt.trim()}
                onClick={() => void handleGenerate()}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                <span>{videoInputPreview ? "تحريك الصورة إلى فيديو" : "توليد الفيديو"}</span>
              </button>
            </div>

            {videoInputPreview && (
              <div className="flex items-center gap-3 rounded-xl border p-2.5" style={{ borderColor: "var(--nawa-border)" }}>
                <img src={videoInputPreview} alt="إطار البداية للفيديو" className="h-14 w-14 rounded-lg object-cover" />
                <span className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                  سيتم تحريك هذه الصورة إلى مقطع فيديو متسلسل.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Mode 3: Music Generation */}
        {mode === "music" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold">وصف المقطع الموسيقي</label>
              <textarea
                rows={3}
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                className="w-full rounded-xl border p-3 text-sm focus:outline-none"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
                placeholder="صف الآلات الموسيقية، الإيقاع، والحالة المزاجية..."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMusicDuration("clip")}
                  className="h-10 rounded-xl border px-3.5 text-xs font-medium"
                  style={{
                    backgroundColor: musicDuration === "clip" ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                    borderColor: musicDuration === "clip" ? "var(--nawa-accent)" : "var(--nawa-border)",
                    color: musicDuration === "clip" ? "var(--nawa-accent)" : "var(--nawa-muted)",
                  }}
                >
                  مقطع سريع (30 ثانية)
                </button>
                <button
                  type="button"
                  onClick={() => setMusicDuration("full")}
                  className="h-10 rounded-xl border px-3.5 text-xs font-medium"
                  style={{
                    backgroundColor: musicDuration === "full" ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                    borderColor: musicDuration === "full" ? "var(--nawa-accent)" : "var(--nawa-border)",
                    color: musicDuration === "full" ? "var(--nawa-accent)" : "var(--nawa-muted)",
                  }}
                >
                  تأليف كامل
                </button>
              </div>

              <button
                type="button"
                disabled={busy || !musicPrompt.trim()}
                onClick={() => void handleGenerate()}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />}
                <span>توليد الموسيقى</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-500">
          {error}
        </div>
      )}

      {/* Result Cards */}
      {mode === "image" && imageResult && (
        <div
          className="rounded-2xl border p-6 space-y-4"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold">النتيجة المصورة</span>
            {imageResult.imageDataUrl && (
              <a
                href={imageResult.imageDataUrl}
                download={`nawacore-image-${Date.now()}.png`}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: "var(--nawa-border)", color: "var(--nawa-accent)" }}
              >
                <Download className="h-3.5 w-3.5" />
                <span>تنزيل</span>
              </a>
            )}
          </div>
          {imageResult.imageDataUrl && (
            <img
              src={imageResult.imageDataUrl}
              alt={imagePrompt}
              className="mx-auto max-h-[480px] rounded-xl border object-contain"
              style={{ borderColor: "var(--nawa-border)" }}
            />
          )}
          {imageResult.text && (
            <p className="text-xs leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
              {imageResult.text}
            </p>
          )}
        </div>
      )}

      {mode === "video" && videoResult && (
        <div
          className="rounded-2xl border p-6 space-y-4"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold">الفيديو المولّد</span>
            {videoResult.videoDataUrl && (
              <a
                href={videoResult.videoDataUrl}
                download={`nawacore-video-${Date.now()}.mp4`}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: "var(--nawa-border)", color: "var(--nawa-accent)" }}
              >
                <Download className="h-3.5 w-3.5" />
                <span>تنزيل MP4</span>
              </a>
            )}
          </div>
          {videoResult.videoDataUrl && (
            <video
              controls
              autoPlay
              loop
              playsInline
              src={videoResult.videoDataUrl}
              className="mx-auto max-h-[480px] w-full rounded-xl border bg-black"
              style={{ borderColor: "var(--nawa-border)" }}
            />
          )}
          {videoResult.text && (
            <p className="text-xs leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
              {videoResult.text}
            </p>
          )}
        </div>
      )}

      {mode === "music" && musicResult && (
        <div
          className="rounded-2xl border p-6 space-y-4"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold">المقطع الموسيقي المولّد</span>
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
              {musicResult.audioUri && (
                <a
                  href={musicResult.audioUri}
                  download={`nawacore-music-${Date.now()}.mp3`}
                  className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-medium"
                  style={{ borderColor: "var(--nawa-border)", color: "var(--nawa-accent)" }}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>تنزيل</span>
                </a>
              )}
            </div>
          </div>
          {musicResult.audioUri ? (
            <audio controls src={musicResult.audioUri} className="w-full" />
          ) : (
            <p className="text-xs" style={{ color: "var(--nawa-muted)" }}>
              لم يتم إرجاع بيانات صوتية قابلة للتشغيل في هذه الاستجابة.
            </p>
          )}
          {musicResult.text && (
            <p className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--nawa-text)" }}>
              {musicResult.text}
            </p>
          )}
        </div>
      )}

      {/* User Saved Creations History (from Cloud SQL) */}
      {user && historyItems.length > 0 && (
        <div
          className="rounded-2xl border p-5 space-y-3"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <h3 className="text-xs font-bold" style={{ color: "var(--nawa-muted)" }}>
            سجل أعمالك السابقة ({historyItems.length})
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {historyItems.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="rounded-xl border p-3 text-xs space-y-1"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                }}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>
                    {item.mediaType === "image"
                      ? "صورة"
                      : item.mediaType === "video"
                        ? "فيديو"
                        : "موسيقى"}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--nawa-muted)" }}>
                    {new Date(item.createdAt).toLocaleDateString("ar-EG")}
                  </span>
                </div>
                <div className="line-clamp-2 text-[11px]" style={{ color: "var(--nawa-muted)" }}>
                  {item.prompt}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
