import React, { useEffect, useState } from "react";
import { Brain, Cpu, Database, Monitor, Plus, Smartphone, Sparkles } from "lucide-react";
import {
  getNawaModel,
  type AgentIntentId,
  type InferencePrediction,
  type IntentMeta,
} from "../engine/nawaModel.ts";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";

interface ModelInfoResponse {
  name: string;
  architecture: string;
  layers: Array<{ name: string; dim: number; params: number }>;
  totalParams: number;
  weightsSizeBytes: number;
  wasmSizeBytes: number;
  trainedEpochs: number;
  corpusCount: number;
  intents: IntentMeta[];
  lossHistory: Array<{ epoch: number; loss: number; accuracy: number }>;
}

interface KBProfileMeta {
  id: "desktop-50b" | "mobile-50m";
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

interface TransformerInfoResponse {
  name: string;
  config: {
    vocabSize: number;
    dModel: number;
    nLayers: number;
    nHeads: number;
    dFF: number;
    maxSeqLen: number;
  };
  totalParams: number;
  checkpointBytes: number;
  trainedEpochs: number;
  latestLoss: number | null;
  latestPerplexity: number | null;
  lossHistory: Array<{ epoch: number; loss: number; perplexity: number; elapsedMs: number }>;
  sampleTokens: string[];
  kbProfiles?: Record<"desktop-50b" | "mobile-50m", KBProfileMeta>;
}

export default function ModelArchitectureView() {
  const { settings, updateSettings } = useUiSettings();
  const [info, setInfo] = useState<ModelInfoResponse | null>(null);
  const [lmInfo, setLmInfo] = useState<TransformerInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [probeText, setProbeText] = useState("عايزك تعملي API لادارة المهام وتختبره");
  const [probeResult, setProbeResult] = useState<InferencePrediction | null>(null);

  const [newSampleText, setNewSampleText] = useState("");
  const [newSampleIntent, setNewSampleIntent] = useState<AgentIntentId>("create_fastapi_api");
  const [newSampleDialect, setNewSampleDialect] = useState("مصري");
  const [trainingMsg, setTrainingMsg] = useState<string | null>(null);
  const [trainingBusy, setTrainingBusy] = useState(false);

  const [lmPrompt, setLmPrompt] = useState("");
  const [lmResponse, setLmResponse] = useState("");
  const [lmEpochs, setLmEpochs] = useState(12);
  const [lmTrainBusy, setLmTrainBusy] = useState(false);
  const [lmTrainMsg, setLmTrainMsg] = useState<string | null>(null);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const [resMlp, resLm] = await Promise.all([
        fetch("/api/model/info"),
        fetch("/api/llm/model-info"),
      ]);
      const dataMlp = await resMlp.json();
      setInfo(dataMlp);
      if (resLm.ok) {
        const dataLm = await resLm.json();
        setLmInfo(dataLm);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  useEffect(() => {
    let active = true;
    const runProbe = async () => {
      if (!probeText.trim()) {
        setProbeResult(null);
        return;
      }
      const m = getNawaModel();
      const pred = await m.predict(probeText);
      if (active) setProbeResult(pred);
    };
    runProbe();
    return () => {
      active = false;
    };
  }, [probeText]);

  const handleTrainSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSampleText.trim() || trainingBusy) return;
    setTrainingBusy(true);
    setTrainingMsg(null);
    try {
      const res = await fetch("/api/model/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: newSampleText.trim(),
          intent: newSampleIntent,
          dialect: newSampleDialect,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "فشل التدريب");

      getNawaModel().addSampleAndRetrain(newSampleText.trim(), newSampleIntent, newSampleDialect);

      setTrainingMsg(
        `تم تدريب 45 دورة إضافية بنجاح (إجمالي الدورات: ${data.trainedEpochs} · عدد العينات: ${data.corpusCount})`
      );
      setNewSampleText("");
      await loadInfo();
      const pred = await getNawaModel().predict(probeText);
      setProbeResult(pred);
    } catch (err) {
      setTrainingMsg(err instanceof Error ? err.message : "خطأ أثناء التدريب");
    } finally {
      setTrainingBusy(false);
    }
  };

  const handleTrainTransformer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lmPrompt.trim() || !lmResponse.trim() || lmTrainBusy) return;
    setLmTrainBusy(true);
    setLmTrainMsg(null);
    try {
      const res = await fetch("/api/llm/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: lmPrompt.trim(),
          response: lmResponse.trim(),
          epochs: lmEpochs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "فشل تدريب المحول");
      if (data.modelInfo) setLmInfo((prev) => ({ ...prev, ...data.modelInfo }));
      setLmTrainMsg(
        `تم تشغيل الانتشار العكسي وتحديث أوزان nawa_llm.bin (Loss: ${data.modelInfo?.latestLoss} · Perplexity: ${data.modelInfo?.latestPerplexity})`
      );
      setLmPrompt("");
      setLmResponse("");
    } catch (err) {
      setLmTrainMsg(err instanceof Error ? err.message : "خطأ أثناء تدريب المحول");
    } finally {
      setLmTrainBusy(false);
    }
  };

  if (loading || !info) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
        <div className="h-24 rounded-xl border" style={{ borderColor: "var(--nawa-border)", backgroundColor: "var(--nawa-surface)" }} />
        <div className="h-64 rounded-xl border" style={{ borderColor: "var(--nawa-border)", backgroundColor: "var(--nawa-surface)" }} />
      </div>
    );
  }

  const kbProfiles = lmInfo?.kbProfiles;

  return (
    <div className="mx-auto max-w-6xl space-y-10 p-6 lg:p-8">
      {/* Section 0: 50B Desktop & 50M Mobile Knowledge Base Tiers */}
      {kbProfiles && (
        <section className="space-y-4">
          <div className="border-b pb-4" style={{ borderColor: "var(--nawa-border)" }}>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
              <h1 className="font-display text-2xl font-bold" style={{ textWrap: "balance" }}>
                قاعدة الأسئلة الثنائية الموزعة (50 مليار للكمبيوتر / 50 مليون للهاتف)
              </h1>
            </div>
            <p className="mt-1.5 max-w-4xl text-sm leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
              يستخدم النموذج فهرسة تركيبية متعددة المحاور (المجال × النية × الكيان × اللهجة) مع حارس التماسك السياقي
              لإزالة أي سياق غريب أو هلوسة، مع التبديل التلقائي أو اليدوي بين نسخة سطح المكتب ونسخة الهاتف.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {(["desktop-50b", "mobile-50m"] as const).map((tierId) => {
              const tier = kbProfiles[tierId];
              const active = settings.deviceProfile === tierId;
              return (
                <div
                  key={tierId}
                  className="rounded-2xl border p-5 transition-all"
                  style={{
                    backgroundColor: "var(--nawa-surface)",
                    borderColor: active ? "var(--nawa-accent)" : "var(--nawa-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {tierId === "desktop-50b" ? (
                        <Monitor className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
                      ) : (
                        <Smartphone className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
                      )}
                      <h2 className="text-base font-bold">{tier.labelAr}</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSettings({ deviceProfile: tierId })}
                      className="min-h-[40px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: active ? "var(--nawa-accent)" : "var(--nawa-elevated)",
                        color: active ? "#FFFFFF" : "var(--nawa-text)",
                      }}
                    >
                      {active ? "مفعّل حالياً" : "تفعيل هذا الإصدار"}
                    </button>
                  </div>

                  <div className="mt-4 font-mono text-2xl font-bold tabular-nums" dir="ltr">
                    {tier.capacityFormatted}{" "}
                    <span className="text-xs font-normal" style={{ color: "var(--nawa-muted)" }}>
                      indexed question slots
                    </span>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--nawa-muted)" }}>
                    {tier.ramFootprint}
                  </div>

                  <div
                    className="mt-4 grid grid-cols-4 gap-2 border-t pt-3 text-xs"
                    style={{ borderColor: "var(--nawa-border)" }}
                  >
                    <div>
                      <div style={{ color: "var(--nawa-muted)" }}>المجالات</div>
                      <div className="font-mono font-semibold tabular-nums">{tier.domains}</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--nawa-muted)" }}>النيات</div>
                      <div className="font-mono font-semibold tabular-nums">{tier.intents}</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--nawa-muted)" }}>الكيانات</div>
                      <div className="font-mono font-semibold tabular-nums">{tier.entities}</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--nawa-muted)" }}>الشرائح</div>
                      <div className="font-mono font-semibold tabular-nums">{tier.shards.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 1: Genuine Causal Transformer Language Model */}
      {lmInfo && (
        <section className="space-y-6">
          <div className="border-b pb-5" style={{ borderColor: "var(--nawa-border)" }}>
            <h2 className="font-display text-2xl font-bold" style={{ textWrap: "balance" }}>
              معمارية النموذج اللغوي التوليدي الفعلي ({lmInfo.name})
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
              محول عصبي سببي بمحلل BPE فرعي ({" "}
              <span className="font-mono tabular-nums font-semibold" style={{ color: "var(--nawa-text)" }}>
                {lmInfo.config.vocabSize}
              </span>{" "}
              رمزاً) و{" "}
              <span className="font-mono tabular-nums font-semibold" style={{ color: "var(--nawa-text)" }}>
                {lmInfo.config.nLayers}
              </span>{" "}
              طبقات انتباه ذاتي متعددة الرؤوس (
              <span className="font-mono tabular-nums font-semibold" style={{ color: "var(--nawa-text)" }}>
                {lmInfo.config.nHeads}
              </span>{" "}
              رؤوس · بُعد{" "}
              <span className="font-mono tabular-nums font-semibold" style={{ color: "var(--nawa-text)" }}>
                {lmInfo.config.dModel}
              </span>
              ) وذاكرة KV-Cache قابلة للضغط. يضم{" "}
              <span className="font-mono tabular-nums font-semibold" style={{ color: "var(--nawa-text)" }}>
                {lmInfo.totalParams.toLocaleString()}
              </span>{" "}
              معامل تدريب محفوظة فعلياً في{" "}
              <span className="font-mono" style={{ color: "var(--nawa-accent)" }}>
                nawa_llm.bin
              </span>
              ، مدعوماً بخمسة محركات حتمية مدمجة (توليد الكود · المدقق الأمني · الحاسبة وتحويل الوحدات · الملخص الاستخراجي · القوالب المنظمة).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: "var(--nawa-muted)" }}>
              <span>مُولّد الكود متعدد اللغات</span>
              <span aria-hidden="true">·</span>
              <span>المدقق الأمني الثابت</span>
              <span aria-hidden="true">·</span>
              <span>الحاسبة وتحويل الوحدات</span>
              <span aria-hidden="true">·</span>
              <span>الملخّص الاستخراجي</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">فهرس 50B/50M</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div
              className="rounded-2xl border p-5"
              style={{
                backgroundColor: "var(--nawa-surface)",
                borderColor: "var(--nawa-border)",
              }}
            >
              <div
                className="flex items-center justify-between border-b pb-3.5"
                style={{ borderColor: "var(--nawa-border)" }}
              >
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
                  <h3 className="text-sm font-semibold">منحنى تدريب المحول (AdamW + Cross-Entropy)</h3>
                </div>
                <span className="font-mono text-xs tabular-nums" style={{ color: "var(--nawa-muted)" }}>
                  {lmInfo.trainedEpochs} Epochs · PPL {lmInfo.latestPerplexity ?? "-"}
                </span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead style={{ color: "var(--nawa-muted)" }}>
                    <tr>
                      <th className="py-1.5 font-medium">Epoch</th>
                      <th className="py-1.5 font-medium text-left">Loss</th>
                      <th className="py-1.5 font-medium text-left">Perplexity</th>
                      <th className="py-1.5 font-medium text-left">الزمن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--nawa-border)" }}>
                    {lmInfo.lossHistory.slice(-7).map((st) => (
                      <tr key={st.epoch}>
                        <td className="py-2 font-mono tabular-nums">#{st.epoch}</td>
                        <td className="py-2 text-left font-mono tabular-nums" dir="ltr">
                          {st.loss.toFixed(4)}
                        </td>
                        <td
                          className="py-2 text-left font-mono tabular-nums font-semibold"
                          style={{ color: "var(--nawa-accent)" }}
                          dir="ltr"
                        >
                          {st.perplexity.toFixed(2)}
                        </td>
                        <td className="py-2 text-left font-mono tabular-nums" style={{ color: "var(--nawa-muted)" }} dir="ltr">
                          {st.elapsedMs} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--nawa-border)" }}>
                <div className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                  عينة من رموز قاموس BPE المتعلم:
                </div>
                <div className="mt-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--nawa-accent)" }}>
                  {lmInfo.sampleTokens.slice(0, 16).join("  ·  ")}
                </div>
              </div>
            </div>

            <form
              onSubmit={handleTrainTransformer}
              className="rounded-2xl border p-5"
              style={{
                backgroundColor: "var(--nawa-surface)",
                borderColor: "var(--nawa-border)",
              }}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
                <h3 className="text-sm font-semibold">تدريب المحول اللغوي حياً (Backpropagation)</h3>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--nawa-muted)" }}>
                علّم NawaLM-Transformer أي سؤال وإجابة جديدة؛ سيتم حساب تدرجات الانتشار العكسي وتحديث الأوزان في{" "}
                <span className="font-mono">nawa_llm.bin</span>.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "var(--nawa-muted)" }}>
                    السؤال أو الأمر التدريبي
                  </label>
                  <input
                    type="text"
                    value={lmPrompt}
                    onChange={(e) => setLmPrompt(e.target.value)}
                    placeholder="مثال: ما هي لغة Swift سويفت"
                    className="w-full rounded-xl border px-3.5 py-2 text-sm focus:outline-none"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                      color: "var(--nawa-text)",
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "var(--nawa-muted)" }}>
                    الإجابة المستهدفة للتوليد
                  </label>
                  <textarea
                    rows={2}
                    value={lmResponse}
                    onChange={(e) => setLmResponse(e.target.value)}
                    placeholder="مثال: Swift لغة حديثة وآمنة من أبل لبناء تطبيقات iOS وmacOS بسرعة عالية."
                    className="w-full rounded-xl border px-3.5 py-2 text-sm focus:outline-none"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                      color: "var(--nawa-text)",
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                      دورات التدريب:
                    </label>
                    <select
                      value={lmEpochs}
                      onChange={(e) => setLmEpochs(Number(e.target.value))}
                      className="rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none"
                      style={{
                        backgroundColor: "var(--nawa-elevated)",
                        borderColor: "var(--nawa-border)",
                        color: "var(--nawa-text)",
                      }}
                    >
                      <option value={8}>8 دورات (سريع)</option>
                      <option value={12}>12 دورة (متوازن)</option>
                      <option value={18}>18 دورة (تثبيت عالٍ)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={lmTrainBusy || !lmPrompt.trim() || !lmResponse.trim()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold text-white transition-opacity disabled:opacity-50 whitespace-nowrap shrink-0"
                    style={{ backgroundColor: "var(--nawa-accent)" }}
                  >
                    <Plus className="h-4 w-4" />
                    <span>{lmTrainBusy ? "جاري حساب التدرجات..." : "تدريب وتحديث nawa_llm.bin"}</span>
                  </button>
                </div>

                {lmTrainMsg && (
                  <p className="text-xs font-medium" style={{ color: "var(--nawa-accent)" }}>
                    {lmTrainMsg}
                  </p>
                )}
              </div>
            </form>
          </div>
        </section>
      )}

      {/* Section 2: WASM Intent Classifier MLP (NawaCore-50M) */}
      <section className="space-y-6 border-t pt-8" style={{ borderColor: "var(--nawa-border)" }}>
        <div>
          <h2 className="font-display text-xl font-bold" style={{ textWrap: "balance" }}>
            مصنف النوايا البرمجية (NawaCore-50M · Client WASM MLP)
          </h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
            شبكة عصبية كثيفة ({info.architecture}) تعمل داخل ذاكرة WebAssembly الخطية لبيئة التطوير والمهام المعزولة، وتضم{" "}
            <span className="font-mono tabular-nums font-semibold" style={{ color: "var(--nawa-text)" }}>
              {info.totalParams.toLocaleString()}
            </span>{" "}
            معامل وزن.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div
            className="rounded-2xl border p-5"
            style={{
              backgroundColor: "var(--nawa-surface)",
              borderColor: "var(--nawa-border)",
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
              <h3 className="text-sm font-semibold">مختبر الاستدلال الفوري باللهجات (Client WASM)</h3>
            </div>
            <input
              type="text"
              value={probeText}
              onChange={(e) => setProbeText(e.target.value)}
              placeholder="جرب: سويلي دالة فرز سريعة واختبرها"
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-text)",
              }}
            />

            {probeResult && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: "var(--nawa-muted)" }}>
                  <span>اللهجة: {probeResult.dialectHint}</span>
                  <span aria-hidden="true">·</span>
                  <span>المجال: {probeResult.slots.domainEntity.nameAr}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">WASM {probeResult.wasmInferenceMs} ms</span>
                </div>

                <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--nawa-border)" }}>
                  {probeResult.probabilities.slice(0, 4).map((p) => (
                    <div key={p.intent} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{p.labelAr}</span>
                        <span className="font-mono tabular-nums" dir="ltr">
                          {(p.prob * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--nawa-elevated)" }}>
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${Math.max(2, p.prob * 100)}%`,
                            backgroundColor: "var(--nawa-accent)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={handleTrainSample}
            className="rounded-2xl border p-5"
            style={{
              backgroundColor: "var(--nawa-surface)",
              borderColor: "var(--nawa-border)",
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
              <h3 className="text-sm font-semibold">تدريب وتخصيص مصنف النوايا</h3>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs" style={{ color: "var(--nawa-muted)" }}>
                  الجملة التدريبية
                </label>
                <input
                  type="text"
                  value={newSampleText}
                  onChange={(e) => setNewSampleText(e.target.value)}
                  placeholder="مثال: بدي تعملي خوارزمية ضغط سريعة"
                  className="w-full rounded-xl border px-3.5 py-2 text-sm focus:outline-none"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "var(--nawa-muted)" }}>
                    النية البرمجية المستهدفة
                  </label>
                  <select
                    value={newSampleIntent}
                    onChange={(e) => setNewSampleIntent(e.target.value as AgentIntentId)}
                    className="w-full rounded-xl border px-3 py-2 text-xs focus:outline-none"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                      color: "var(--nawa-text)",
                    }}
                  >
                    {info.intents.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.labelAr}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "var(--nawa-muted)" }}>
                    اللهجة
                  </label>
                  <select
                    value={newSampleDialect}
                    onChange={(e) => setNewSampleDialect(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-xs focus:outline-none"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                      color: "var(--nawa-text)",
                    }}
                  >
                    <option value="مصري">مصري</option>
                    <option value="خليجي">خليجي</option>
                    <option value="شامي">شامي</option>
                    <option value="مغاربي">مغاربي</option>
                    <option value="عراقي">عراقي</option>
                    <option value="فصحى">فصحى</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={trainingBusy || !newSampleText.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                <Plus className="h-4 w-4" />
                <span>{trainingBusy ? "جاري التدريب..." : "إضافة العينة وتدريب 45 دورة"}</span>
              </button>

              {trainingMsg && (
                <p className="text-xs font-medium" style={{ color: "var(--nawa-accent)" }}>
                  {trainingMsg}
                </p>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
