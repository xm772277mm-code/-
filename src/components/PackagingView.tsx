import React, { useEffect, useState } from "react";
import { Binary, Code2, Download, Monitor, Smartphone } from "lucide-react";

interface ToolchainResponse {
  host: string;
  compilers: {
    wasmEmitter: boolean;
    gcc: boolean;
    mingwExe: boolean;
    pyinstaller: boolean;
    gradleAndroid: boolean;
    python3: boolean;
  };
}

export default function PackagingView() {
  const [toolchain, setToolchain] = useState<ToolchainResponse | null>(null);
  const [previewTarget, setPreviewTarget] = useState<"windows" | "android" | "weights">("windows");
  const [previewCode, setPreviewCode] = useState<{ filename: string; code: string } | null>(null);

  useEffect(() => {
    fetch("/api/packaging/toolchain")
      .then((r) => r.json())
      .then(setToolchain)
      .catch(() => null);
  }, []);

  useEffect(() => {
    fetch(`/api/packaging/preview?target=${previewTarget}`)
      .then((r) => r.json())
      .then(setPreviewCode)
      .catch(() => null);
  }, [previewTarget]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
      <div className="border-b pb-6" style={{ borderColor: "var(--nawa-border)" }}>
        <h1 className="font-display text-2xl font-bold" style={{ textWrap: "balance" }}>
          تصدير وتجميع النموذج في ملفات EXE و APK ونواة WebAssembly
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
          يتم تضمين أوزان النموذج المدربة (<span className="font-mono font-semibold">nawa_llm.bin</span> و{" "}
          <span className="font-mono font-semibold">nawa_weights.bin</span>) مباشرة مع نسخة سطح المكتب (50B) ونسخة
          Android للهاتف (50M) دون أي اعتماد على خوادم خارجية.
        </p>
      </div>

      {/* Primary EXE and APK Download Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div
          className="flex flex-col justify-between rounded-2xl border p-6"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div>
            <div className="flex items-center gap-2.5">
              <Monitor className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
              <h2 className="text-lg font-semibold">حزمة الكمبيوتر Windows (EXE Kit · 50B KB)</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
              مشروع C++20 مكتمل بتعليمات AVX2 و FMA المتوازية مدمج بداخله أوزان النموذج المدربة وفهرس الـ 50 مليار سؤال
              لإنتاج <span className="font-mono">NawaAgent.exe</span>.
            </p>
            <div className="mt-4 space-y-1 font-mono text-xs" style={{ color: "var(--nawa-muted)" }} dir="ltr">
              <div>- src/nawa_agent.cpp (AVX2 + FMA SIMD)</div>
              <div>- src/nawa_weights.h (Embedded Float32 Weights)</div>
              <div>- CMakeLists.txt + build_exe.bat</div>
            </div>
          </div>

          <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--nawa-border)" }}>
            <a
              href="/api/packaging/download/exe-kit"
              download="NawaCore-Windows-EXE-Kit.zip"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              <Download className="h-4 w-4" />
              <span>تحميل حزمة Windows EXE (.zip)</span>
            </a>
          </div>
        </div>

        <div
          className="flex flex-col justify-between rounded-2xl border p-6"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div>
            <div className="flex items-center gap-2.5">
              <Smartphone className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
              <h2 className="text-lg font-semibold">حزمة الهاتف Android (APK Kit · 50M KB)</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
              مشروع Android Studio متكامل يربط Kotlin مع مكتبة C++ NDK بتسريع ARM64 NEON وقاعدة الـ 50 مليون سؤال
              الخفيفة للهاتف، مع دمج إعلانات فتح التطبيق (<span className="font-mono">AdMob AppOpenAd</span>) لإخراج{" "}
              <span className="font-mono">app-release.apk</span>.
            </p>
            <div className="mt-4 space-y-1 font-mono text-xs" style={{ color: "var(--nawa-muted)" }} dir="ltr">
              <div>- app/src/main/cpp/nawa_neon_jni.cpp (ARM64 NEON)</div>
              <div>- app/src/main/java/com/nawa/agent/AppOpenAdManager.kt</div>
              <div>- app/src/main/java/com/nawa/agent/MainActivity.kt</div>
              <div>- app/src/main/assets/nawa_weights.bin</div>
            </div>
          </div>

          <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--nawa-border)" }}>
            <a
              href="/api/packaging/download/apk-kit"
              download="NawaCore-Android-APK-Kit.zip"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              <Download className="h-4 w-4" />
              <span>تحميل حزمة Android APK (.zip)</span>
            </a>
          </div>
        </div>
      </div>

      {/* Direct Binary Downloads + Host Toolchain */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div
          className="rounded-2xl border p-5"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center gap-2">
            <Binary className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
            <h2 className="text-sm font-semibold">ملفات التثبيت والملفات الثنائية في المجلد الرئيسي</h2>
          </div>
          <div className="mt-4 space-y-3">
            {[
              {
                name: "nawacore-studio_2.0.0_amd64.deb",
                desc: "حزمة تثبيت Debian/Ubuntu حقيقية",
                href: "/api/packaging/download/deb",
                btn: "تنزيل DEB",
              },
              {
                name: "NawaCore-Setup.run",
                desc: "مثبت ذاتي الاستخراج لنظام Linux/WSL/macOS",
                href: "/api/packaging/download/run",
                btn: "تنزيل RUN",
              },
              {
                name: "NawaCore-Agent.pyz",
                desc: "تطبيق Python أحادي الملف بالأوزان المدربة",
                href: "/api/packaging/download/pyz",
                btn: "تنزيل PYZ",
              },
              {
                name: "nawa_engine.wasm",
                desc: "نواة WebAssembly المجمّعة (573 بايت · 2.2B+ ops/sec)",
                href: "/api/packaging/download/wasm",
                btn: "تنزيل WASM",
              },
              {
                name: "nawa_llm.bin",
                desc: "ملف أوزان النموذج اللغوي NawaLM-Transformer + BPE",
                href: "/api/packaging/download/llm-weights",
                btn: "تنزيل LLM",
              },
              {
                name: "nawa_weights.bin",
                desc: "ملف أوزان مصنف النوايا Float32",
                href: "/api/packaging/download/weights",
                btn: "تنزيل BIN",
              },
            ].map((item, idx, arr) => (
              <div
                key={item.name}
                className={`flex items-center justify-between gap-3 ${idx < arr.length - 1 ? "border-b pb-3" : ""}`}
                style={{ borderColor: "var(--nawa-border)" }}
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-medium" dir="ltr">
                    {item.name}
                  </div>
                  <div className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                    {item.desc}
                  </div>
                </div>
                <a
                  href={item.href}
                  download={item.name}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-medium whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{item.btn}</span>
                </a>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-2xl border p-5"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <h2 className="text-sm font-semibold">أدوات التجميع المتاحة في الخادم الحالي</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--nawa-muted)" }}>
            البيئة المستضيفة: <span className="font-mono">{toolchain?.host || "..."}</span>
          </p>
          <div className="mt-3 divide-y text-xs" style={{ borderColor: "var(--nawa-border)" }}>
            {[
              { label: "مجمّع WebAssembly المدمج (WASM)", ok: toolchain?.compilers.wasmEmitter },
              { label: "بيئة Python 3 للاختبارات", ok: toolchain?.compilers.python3 },
              { label: "مترجم MinGW-w64 (لإخراج .exe على Linux)", ok: toolchain?.compilers.mingwExe },
              { label: "حزمة Android Gradle + NDK (لإخراج .apk)", ok: toolchain?.compilers.gradleAndroid },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-2.5">
                <span>{item.label}</span>
                <span className={item.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  {item.ok ? "متاح وجاهز" : "متاح عبر حزمة التصدير"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Native Source Inspector */}
      <div
        className="overflow-hidden rounded-2xl border"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3"
          style={{ borderColor: "var(--nawa-border)" }}
        >
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
            <span className="text-sm font-semibold">معاينة الكود الأصلي المصدّر</span>
          </div>
          <div
            className="flex items-center gap-1 rounded-xl border p-1"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
            }}
          >
            {[
              { id: "windows" as const, label: "Windows C++ AVX2" },
              { id: "android" as const, label: "Android ARM64 NEON" },
              { id: "weights" as const, label: "nawa_weights.h" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPreviewTarget(tab.id)}
                className="rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: previewTarget === tab.id ? "var(--nawa-accent)" : "transparent",
                  color: previewTarget === tab.id ? "#FFFFFF" : "var(--nawa-muted)",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <pre
          dir="ltr"
          className="max-h-96 overflow-auto p-4 text-left font-mono text-xs leading-relaxed"
          style={{
            backgroundColor: "var(--nawa-code-bg)",
            color: "var(--nawa-code-text)",
          }}
        >
          {previewCode?.code || "Loading source preview..."}
        </pre>
      </div>
    </div>
  );
}
