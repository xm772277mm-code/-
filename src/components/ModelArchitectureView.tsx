import React, { useEffect, useState } from "react";
import { Brain, Plus, Sparkles } from "lucide-react";
import {
  getNawaModel,
  type AgentIntentId,
  type InferencePrediction,
  type IntentMeta,
} from "../engine/nawaModel.ts";

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

export default function ModelArchitectureView() {
  const [info, setInfo] = useState<ModelInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [probeText, setProbeText] = useState("عايزك تعملي API لادارة المهام وتختبره");
  const [probeResult, setProbeResult] = useState<InferencePrediction | null>(null);

  const [newSampleText, setNewSampleText] = useState("");
  const [newSampleIntent, setNewSampleIntent] = useState<AgentIntentId>("create_fastapi_api");
  const [newSampleDialect, setNewSampleDialect] = useState("مصري");
  const [trainingMsg, setTrainingMsg] = useState<string | null>(null);
  const [trainingBusy, setTrainingBusy] = useState(false);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/model/info");
      const data = await res.json();
      setInfo(data);
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

      // Mirror training locally in client model too so live probe matches server immediately
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

  if (loading || !info) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
        <div className="h-24 animate-pulse rounded-xl bg-white/5" />
        <div className="h-64 animate-pulse rounded-xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
      <div className="border-b border-white/10 pb-6">
        <h1 className="text-2xl font-bold text-white" style={{ textWrap: "balance" }}>
          معمارية النموذج العصبي المدمج (NawaCore-50M)
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          شبكة عصبية مكونة من 3 طبقات كثيفة ({info.architecture}) مبنية من الصفر وتعمل داخل ذاكرة WebAssembly الخطية
          دون استدعاء أي نموذج خارجي. تضم{" "}
          <span className="font-mono tabular-nums text-slate-200">{info.totalParams.toLocaleString()}</span> معامل وزن
          بحجم إجمالي{" "}
          <span className="font-mono tabular-nums text-slate-200">
            {(info.weightsSizeBytes / 1024).toFixed(1)} KiB
          </span>
          .
        </p>
      </div>

      {/* Layers Table + Training Curve */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#111827] overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3.5">
            <Brain className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">طبقات الشبكة العصبية</h2>
          </div>
          <table className="w-full text-right text-xs">
            <thead className="border-b border-white/10 bg-[#0B0F17] text-slate-400">
              <tr>
                <th className="px-5 py-2.5 font-medium">الطبقة</th>
                <th className="px-5 py-2.5 font-medium text-left">الأبعاد</th>
                <th className="px-5 py-2.5 font-medium text-left">المعاملات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {info.layers.map((layer) => (
                <tr key={layer.name}>
                  <td className="px-5 py-3 text-slate-200">{layer.name}</td>
                  <td className="px-5 py-3 text-left font-mono tabular-nums text-slate-300" dir="ltr">
                    {layer.dim}
                  </td>
                  <td className="px-5 py-3 text-left font-mono tabular-nums text-slate-300" dir="ltr">
                    {layer.params.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Training Loss Curve */}
        <div className="rounded-xl border border-white/10 bg-[#111827] p-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
            <h2 className="text-sm font-semibold text-white">منحنى التدريب الفعلي (Loss & Accuracy)</h2>
            <span className="font-mono text-xs tabular-nums text-slate-400">
              {info.trainedEpochs} Epochs · {info.corpusCount} Samples
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1.5 font-medium">Epoch</th>
                  <th className="py-1.5 font-medium text-left">Cross-Entropy Loss</th>
                  <th className="py-1.5 font-medium text-left">الدقة (Accuracy)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {info.lossHistory.slice(-7).map((st) => (
                  <tr key={st.epoch}>
                    <td className="py-2 font-mono tabular-nums text-slate-300">#{st.epoch}</td>
                    <td className="py-2 text-left font-mono tabular-nums text-slate-200" dir="ltr">
                      {st.loss.toFixed(4)}
                    </td>
                    <td className="py-2 text-left font-mono tabular-nums text-emerald-400" dir="ltr">
                      {st.accuracy}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Live Dialect Tokenizer & Inference Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#111827] p-5">
          <h2 className="text-sm font-semibold text-white">مختبر الاستدلال الفوري باللهجات (Client WASM)</h2>
          <p className="mt-1 text-xs text-slate-400">
            اكتب أي جملة بأي لهجة عربية لترى التطبيع الصرفي واحتمالات النوايا المباشرة عبر WebAssembly.
          </p>
          <input
            type="text"
            value={probeText}
            onChange={(e) => setProbeText(e.target.value)}
            placeholder="جرب: سويلي دالة فرز سريعة واختبرها"
            className="mt-3 w-full rounded-lg border border-white/10 bg-[#0B0F17] px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
          />

          {probeResult && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                <span>اللهجة المكتشفة: {probeResult.dialectHint}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">زمن الاستدلال: {probeResult.wasmInferenceMs} ms</span>
              </div>

              <div className="text-xs text-slate-400">
                الجذور المطبّعة:{" "}
                <span className="font-mono text-blue-300">
                  {probeResult.canonicalTokens.join(" · ") || "-"}
                </span>
              </div>

              <div className="space-y-2 border-t border-white/10 pt-3">
                {probeResult.probabilities.slice(0, 4).map((p) => (
                  <div key={p.intent} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200">{p.labelAr}</span>
                      <span className="font-mono tabular-nums text-slate-300" dir="ltr">
                        {(p.prob * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${Math.max(2, p.prob * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Fine-tuning Form */}
        <form onSubmit={handleTrainSample} className="rounded-xl border border-white/10 bg-[#111827] p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">تدريب وتخصيص النموذج مباشرة (Backpropagation)</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            أضف عبارة جديدة بلهجتك المحلية وحدد النية البرمجية ليتم تدريب النموذج وتحديث أوزان WASM خلال أجزاء من الثانية.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-300">الجملة التدريبية</label>
              <input
                type="text"
                value={newSampleText}
                onChange={(e) => setNewSampleText(e.target.value)}
                placeholder="مثال: بدي تعملي خوارزمية ضغط سريعة"
                className="w-full rounded-lg border border-white/10 bg-[#0B0F17] px-3.5 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-300">النية البرمجية المستهدفة</label>
                <select
                  value={newSampleIntent}
                  onChange={(e) => setNewSampleIntent(e.target.value as AgentIntentId)}
                  className="w-full rounded-lg border border-white/10 bg-[#0B0F17] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                >
                  {info.intents.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.labelAr}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-300">اللهجة</label>
                <select
                  value={newSampleDialect}
                  onChange={(e) => setNewSampleDialect(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0B0F17] px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
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
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>{trainingBusy ? "جاري التدريب..." : "إضافة العينة وتدريب 45 دورة"}</span>
            </button>

            {trainingMsg && <p className="text-xs text-emerald-400">{trainingMsg}</p>}
          </div>
        </form>
      </div>
    </div>
  );
}
