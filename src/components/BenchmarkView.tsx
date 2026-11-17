import React, { useState } from "react";
import { CheckCircle2, Cpu, Gauge, Play } from "lucide-react";
import { getWasmKernel, type BenchmarkResult } from "../engine/wasmKernel.ts";

interface BenchmarkRunRow {
  id: number;
  environment: string;
  totalOps: number;
  elapsedMs: number;
  opsPerSecond: number;
  speedupVs50M: number;
  checksum: number;
  passed: boolean;
}

const WORKLOAD_OPTIONS = [
  { label: "50M عملية (الهدف)", value: 50_000_000 },
  { label: "100M عملية", value: 100_000_000 },
  { label: "250M عملية", value: 250_000_000 },
];

export default function BenchmarkView() {
  const [targetOps, setTargetOps] = useState(50_000_000);
  const [running, setRunning] = useState(false);
  const [clientRes, setClientRes] = useState<BenchmarkResult | null>(null);
  const [serverRes, setServerRes] = useState<
    (BenchmarkResult & { runtime?: string; cpuModel?: string; cpuCores?: number }) | null
  >(null);
  const [history, setHistory] = useState<BenchmarkRunRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runFullVerification = async () => {
    setRunning(true);
    setError(null);
    try {
      const kernel = await getWasmKernel();
      const cRes = kernel.runBenchmark(targetOps);
      setClientRes(cRes);

      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOps }),
      });
      const sRes = await res.json();
      if (!res.ok) throw new Error(sRes.detail || "فشل اختبار الخادم");
      setServerRes(sRes);

      setHistory((prev) =>
        [
          {
            id: Date.now() + 1,
            environment: "الخادم (Node.js WASM)",
            totalOps: sRes.totalOps,
            elapsedMs: sRes.elapsedMs,
            opsPerSecond: sRes.opsPerSecond,
            speedupVs50M: sRes.speedupVs50M,
            checksum: sRes.checksum,
            passed: sRes.target50MReached,
          },
          {
            id: Date.now(),
            environment: "المتصفح (Client WASM)",
            totalOps: cRes.totalOps,
            elapsedMs: cRes.elapsedMs,
            opsPerSecond: cRes.opsPerSecond,
            speedupVs50M: cRes.speedupVs50M,
            checksum: cRes.checksum,
            passed: cRes.target50MReached,
          },
          ...prev,
        ].slice(0, 12)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء الاختبار");
    } finally {
      setRunning(false);
    }
  };

  const formatOps = (n: number) => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B ops/s`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ops/s`;
    return `${n.toLocaleString()} ops/s`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
      <div
        className="flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-end"
        style={{ borderColor: "var(--nawa-border)" }}
      >
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ textWrap: "balance" }}>
            اختبار الأداء الفعلي لنواة WebAssembly (هدف 50 مليون عملية/ثانية)
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
            تنفّذ النواة المجمّعة (<span className="font-mono font-semibold">nawa_engine.wasm</span> بحجم{" "}
            <span className="font-mono tabular-nums">573</span> بايت) حلقة ضرب-وجمع عصبية ثمانية التوازي بأربعة مراكم
            مستقلة للتحقق الفعلي على المتصفح والخادم.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center rounded-xl border p-1"
            style={{
              backgroundColor: "var(--nawa-surface)",
              borderColor: "var(--nawa-border)",
            }}
          >
            {WORKLOAD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTargetOps(opt.value)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: targetOps === opt.value ? "var(--nawa-accent)" : "transparent",
                  color: targetOps === opt.value ? "#FFFFFF" : "var(--nawa-muted)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={running}
            onClick={runFullVerification}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition-opacity disabled:opacity-50 whitespace-nowrap shrink-0"
            style={{ backgroundColor: "var(--nawa-accent)" }}
          >
            <Play className="h-4 w-4" />
            <span>{running ? "جاري القياس..." : "تشغيل الاختبار المزدوج"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div
          className="rounded-2xl border p-6"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div
            className="flex items-center justify-between border-b pb-4"
            style={{ borderColor: "var(--nawa-border)" }}
          >
            <div className="flex items-center gap-2.5">
              <Gauge className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
              <h2 className="text-base font-semibold">نواة المتصفح (Client WASM)</h2>
            </div>
            {clientRes && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>{clientRes.target50MReached ? "اجتاز هدف 50M/ث" : "دون الهدف"}</span>
              </span>
            )}
          </div>

          {clientRes ? (
            <div className="mt-5 space-y-4">
              <div>
                <div className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                  السرعة المقاسة فعلياً
                </div>
                <div className="mt-1 font-mono text-3xl font-bold tabular-nums" dir="ltr">
                  {formatOps(clientRes.opsPerSecond)}
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--nawa-muted)" }}>
                  أسرع بـ{" "}
                  <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                    {clientRes.speedupVs50M}x
                  </span>{" "}
                  من متطلب 50,000,000 عملية/ثانية
                </div>
              </div>

              <div
                className="grid grid-cols-3 gap-4 border-t pt-4 text-xs"
                style={{ borderColor: "var(--nawa-border)" }}
              >
                <div>
                  <div style={{ color: "var(--nawa-muted)" }}>العمليات المنفذة</div>
                  <div className="mt-1 font-mono font-semibold tabular-nums">
                    {clientRes.totalOps.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--nawa-muted)" }}>الزمن المستغرق</div>
                  <div className="mt-1 font-mono font-semibold tabular-nums" dir="ltr">
                    {clientRes.elapsedMs} ms
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--nawa-muted)" }}>حجم النواة</div>
                  <div className="mt-1 font-mono font-semibold tabular-nums" dir="ltr">
                    {clientRes.wasmSizeBytes} B
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm" style={{ color: "var(--nawa-muted)" }}>
              اضغط على «تشغيل الاختبار المزدوج» لقياس سرعة النواة على جهازك الآن.
            </div>
          )}
        </div>

        <div
          className="rounded-2xl border p-6"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div
            className="flex items-center justify-between border-b pb-4"
            style={{ borderColor: "var(--nawa-border)" }}
          >
            <div className="flex items-center gap-2.5">
              <Cpu className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
              <h2 className="text-base font-semibold">نواة الخادم (Node.js WASM)</h2>
            </div>
            {serverRes && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>{serverRes.target50MReached ? "اجتاز هدف 50M/ث" : "دون الهدف"}</span>
              </span>
            )}
          </div>

          {serverRes ? (
            <div className="mt-5 space-y-4">
              <div>
                <div className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                  السرعة المقاسة فعلياً
                </div>
                <div className="mt-1 font-mono text-3xl font-bold tabular-nums" dir="ltr">
                  {formatOps(serverRes.opsPerSecond)}
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--nawa-muted)" }}>
                  أسرع بـ{" "}
                  <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                    {serverRes.speedupVs50M}x
                  </span>{" "}
                  من متطلب 50M/ث · {serverRes.runtime}
                </div>
              </div>

              <div
                className="grid grid-cols-3 gap-4 border-t pt-4 text-xs"
                style={{ borderColor: "var(--nawa-border)" }}
              >
                <div>
                  <div style={{ color: "var(--nawa-muted)" }}>العمليات المنفذة</div>
                  <div className="mt-1 font-mono font-semibold tabular-nums">
                    {serverRes.totalOps.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--nawa-muted)" }}>الزمن المستغرق</div>
                  <div className="mt-1 font-mono font-semibold tabular-nums" dir="ltr">
                    {serverRes.elapsedMs} ms
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--nawa-muted)" }}>أنوية المعالج</div>
                  <div className="mt-1 font-mono font-semibold tabular-nums">
                    {serverRes.cpuCores ?? "-"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm" style={{ color: "var(--nawa-muted)" }}>
              ستظهر هنا نتائج القياس الفعلي من الخادم فور تشغيل الاختبار.
            </div>
          )}
        </div>
      </div>

      <div
        className="overflow-hidden rounded-2xl border"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div className="border-b px-6 py-4" style={{ borderColor: "var(--nawa-border)" }}>
          <h3 className="text-sm font-semibold">سجل اختبارات التحقق</h3>
        </div>
        {history.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--nawa-muted)" }}>
            لا توجد قياسات مسجلة في هذه الجلسة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead
                className="border-b"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-muted)",
                }}
              >
                <tr>
                  <th className="px-6 py-3 font-medium">بيئة التشغيل</th>
                  <th className="px-6 py-3 font-medium text-left">إجمالي العمليات</th>
                  <th className="px-6 py-3 font-medium text-left">الزمن (ms)</th>
                  <th className="px-6 py-3 font-medium text-left">السرعة (ops/sec)</th>
                  <th className="px-6 py-3 font-medium text-left">النسبة لـ 50M</th>
                  <th className="px-6 py-3 font-medium">النتيجة</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--nawa-border)" }}>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td className="px-6 py-3 font-medium">{row.environment}</td>
                    <td className="px-6 py-3 text-left font-mono tabular-nums" dir="ltr">
                      {row.totalOps.toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-left font-mono tabular-nums" dir="ltr">
                      {row.elapsedMs} ms
                    </td>
                    <td className="px-6 py-3 text-left font-mono font-semibold tabular-nums" dir="ltr">
                      {row.opsPerSecond.toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-left font-mono tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">
                      {row.speedupVs50M}x
                    </td>
                    <td className="px-6 py-3 text-emerald-600 dark:text-emerald-400">
                      {row.passed ? "ناجح (≥ 50M)" : "دون الهدف"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
