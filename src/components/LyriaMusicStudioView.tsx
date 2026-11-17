import React, { useState } from "react";
import { Music, Play, Sparkles, Loader2, Volume2 } from "lucide-react";

export default function LyriaMusicStudioView() {
  const [prompt, setPrompt] = useState("Cinematic ambient electronic soundscape with warm synth pads and rhythmic pulse");
  const [duration, setDuration] = useState<"clip" | "full">("clip");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ model: string; text: string; audioUri: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, duration }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "فشل توليد الموسيقى");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div
        className="rounded-2xl border p-6 space-y-3"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div className="flex items-center gap-2">
          <Music className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
          <h2 className="font-display text-xl font-bold">
            استوديو توليد الموسيقى بذكاء Lyria (lyria-3-clip-preview)
          </h2>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
          أنشئ مقاطع موسيقية سينمائية ومؤثرات صوتية متقدمة باستخدام نماذج Lyria عبر الخادم الآمن.
        </p>

        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--nawa-text)" }}>
              وصف المقطع الموسيقي (Prompt)
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full rounded-xl border p-3 text-sm focus:outline-none"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-text)",
              }}
              placeholder="اكتب وصفاً مفصلاً للموسيقى..."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>نوع التوليد:</span>
              <button
                type="button"
                onClick={() => setDuration("clip")}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: duration === "clip" ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                  borderColor: duration === "clip" ? "var(--nawa-accent)" : "var(--nawa-border)",
                  color: duration === "clip" ? "var(--nawa-accent)" : "var(--nawa-muted)",
                }}
              >
                مقطع قصير 30ث (lyria-3-clip-preview)
              </button>
              <button
                type="button"
                onClick={() => setDuration("full")}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: duration === "full" ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                  borderColor: duration === "full" ? "var(--nawa-accent)" : "var(--nawa-border)",
                  color: duration === "full" ? "var(--nawa-accent)" : "var(--nawa-muted)",
                }}
              >
                مقطع كامل (lyria-3-pro-preview)
              </button>
            </div>

            <button
              type="button"
              disabled={generating || !prompt.trim()}
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span>توليد الموسيقى</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-500">
          {error}
        </div>
      )}

      {result && (
        <div
          className="rounded-2xl border p-6 space-y-4"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold">النتيجة المولدة ({result.model})</span>
            <Volume2 className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--nawa-text)" }}>
            {result.text}
          </p>
          {result.audioUri && (
            <audio controls src={result.audioUri} className="w-full pt-2" />
          )}
        </div>
      )}
    </div>
  );
}
