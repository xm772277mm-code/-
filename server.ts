import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import express from "express";
import {
  ensureWorkspaceSeeded,
  listFiles,
  runCustomAgent,
  safeWorkspacePath,
} from "./src/engine/agentRuntime.ts";
import {
  getNawaModel,
  HIDDEN1_DIM,
  HIDDEN2_DIM,
  INPUT_DIM,
  INTENTS,
  OUTPUT_DIM,
  type AgentIntentId,
} from "./src/engine/nawaModel.ts";
import { getWasmKernel } from "./src/engine/wasmKernel.ts";
import { buildZipArchive } from "./src/engine/zipBuilder.ts";
import {
  buildAndroidApkKitEntries,
  buildWindowsExeKitEntries,
  generateAndroidNeonCpp,
  generateWeightsHeader,
  generateWindowsCppEngine,
} from "./src/engine/nativeTemplates.ts";

const PORT = 3000;
const SESSIONS = new Map<string, Array<{ role: string; content: string }>>();

function hasBinary(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  ensureWorkspaceSeeded();
  // Warm up model and WASM kernel on boot
  const model = getNawaModel();
  await model.syncToWasm();
  const kernel = await getWasmKernel();

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Workspace file listing
  app.get("/api/files", (_req, res) => {
    res.json({ tree: listFiles(".") });
  });

  // Workspace file reader
  app.get("/api/file", (req, res) => {
    const relPath = String(req.query.path || "");
    if (!relPath) {
      res.status(400).json({ detail: "مسار الملف مطلوب" });
      return;
    }
    try {
      const target = safeWorkspacePath(relPath);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        res.status(404).json({ detail: "الملف غير موجود" });
        return;
      }
      res.json({ path: relPath, content: fs.readFileSync(target, "utf-8") });
    } catch (err) {
      res.status(403).json({ detail: err instanceof Error ? err.message : "مسار غير مصرح به" });
    }
  });

  // Reset session
  app.post("/api/reset", (req, res) => {
    const sessionId = String(req.body?.session_id || "default");
    SESSIONS.delete(sessionId);
    res.json({ status: "ok" });
  });

  // Custom Local Neural Agent Chat
  app.post("/api/chat", async (req, res) => {
    const message = String(req.body?.message || "").trim();
    const sessionId = String(req.body?.session_id || "default");
    if (!message) {
      res.status(400).json({ detail: "الرسالة فارغة" });
      return;
    }
    try {
      const history = SESSIONS.get(sessionId) || [];
      history.push({ role: "user", content: message });
      const result = await runCustomAgent(message);
      history.push({ role: "assistant", content: result.reply });
      SESSIONS.set(sessionId, history.slice(-40));
      res.json(result);
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : "خطأ داخلي في النموذج" });
    }
  });

  // Custom Model Inspection
  app.get("/api/model/info", (_req, res) => {
    res.json({
      name: "NawaCore-50M",
      architecture: `${INPUT_DIM} -> ${HIDDEN1_DIM} -> ${HIDDEN2_DIM} -> ${OUTPUT_DIM}`,
      layers: [
        { name: "Input (Dialect + Trigram Hash)", dim: INPUT_DIM, params: 0 },
        { name: "Dense + ReLU (WASM 4x Unrolled)", dim: HIDDEN1_DIM, params: INPUT_DIM * HIDDEN1_DIM + HIDDEN1_DIM },
        { name: "Dense + ReLU (WASM 4x Unrolled)", dim: HIDDEN2_DIM, params: HIDDEN1_DIM * HIDDEN2_DIM + HIDDEN2_DIM },
        { name: "Output + Softmax", dim: OUTPUT_DIM, params: HIDDEN2_DIM * OUTPUT_DIM + OUTPUT_DIM },
      ],
      totalParams: model.totalParams,
      weightsSizeBytes: model.totalParams * 4 + 20,
      wasmSizeBytes: kernel.wasmBytes.byteLength,
      trainedEpochs: model.trainedEpochs,
      corpusCount: model.corpus.length,
      intents: INTENTS,
      lossHistory: model.lossHistory,
      sampleCorpus: model.corpus.slice(-18).reverse(),
    });
  });

  // Interactive Live Fine-Tuning
  app.post("/api/model/train", async (req, res) => {
    const text = String(req.body?.text || "").trim();
    const intent = String(req.body?.intent || "") as AgentIntentId;
    const dialect = String(req.body?.dialect || "مخصص").trim();
    if (!text || !INTENTS.some((i) => i.id === intent)) {
      res.status(400).json({ detail: "يرجى إدخال جملة تدريب صالحة واختيار النية البرمجية." });
      return;
    }
    const recent = model.addSampleAndRetrain(text, intent, dialect);
    await model.syncToWasm();
    res.json({
      status: "ok",
      trainedEpochs: model.trainedEpochs,
      corpusCount: model.corpus.length,
      recentStats: recent,
      lossHistory: model.lossHistory,
    });
  });

  // Real Server-Side WASM 50M+ ops/sec Benchmark
  app.post("/api/benchmark", (req, res) => {
    const requestedOps = Number(req.body?.targetOps || 50_000_000);
    const clampedOps = Math.min(Math.max(requestedOps, 10_000_000), 500_000_000);
    const result = kernel.runBenchmark(clampedOps);
    res.json({
      ...result,
      runtime: `Node.js ${process.version} (${os.arch()}/${os.platform()})`,
      cpuModel: os.cpus()[0]?.model || "x86_64",
      cpuCores: os.cpus().length,
    });
  });

  // Packaging Toolchain Probe
  app.get("/api/packaging/toolchain", (_req, res) => {
    res.json({
      host: `${os.platform()} ${os.arch()} (${os.cpus().length} cores)`,
      compilers: {
        wasmEmitter: true,
        gcc: hasBinary("gcc") || hasBinary("g++"),
        mingwExe: hasBinary("x86_64-w64-mingw32-g++"),
        pyinstaller: hasBinary("pyinstaller"),
        gradleAndroid: hasBinary("gradle"),
        python3: hasBinary("python3"),
      },
      artifacts: [
        {
          id: "wasm",
          filename: "nawa_engine.wasm",
          sizeBytes: kernel.wasmBytes.byteLength,
          ready: true,
        },
        {
          id: "weights",
          filename: "nawa_weights.bin",
          sizeBytes: model.exportWeightsBinary().byteLength,
          ready: true,
        },
        {
          id: "exe-kit",
          filename: "NawaCore-Windows-EXE-Kit.zip",
          ready: true,
        },
        {
          id: "apk-kit",
          filename: "NawaCore-Android-APK-Kit.zip",
          ready: true,
        },
      ],
    });
  });

  // Preview generated native C++/JNI/Header source
  app.get("/api/packaging/preview", (req, res) => {
    const target = String(req.query.target || "windows");
    if (target === "windows") {
      res.json({ filename: "src/nawa_agent.cpp", language: "cpp", code: generateWindowsCppEngine() });
    } else if (target === "android") {
      res.json({ filename: "app/src/main/cpp/nawa_neon_jni.cpp", language: "cpp", code: generateAndroidNeonCpp() });
    } else {
      res.json({ filename: "src/nawa_weights.h", language: "cpp", code: generateWeightsHeader().slice(0, 6000) + "\n// ... (truncated preview, full weights included in download)" });
    }
  });

  // Download Real Artifacts (.wasm, .bin, .zip EXE kit, .zip APK kit)
  app.get("/api/packaging/download/:target", (req, res) => {
    const target = req.params.target;
    if (target === "wasm") {
      res.setHeader("Content-Type", "application/wasm");
      res.setHeader("Content-Disposition", 'attachment; filename="nawa_engine.wasm"');
      res.send(Buffer.from(kernel.wasmBytes));
      return;
    }
    if (target === "weights") {
      const bin = model.exportWeightsBinary();
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", 'attachment; filename="nawa_weights.bin"');
      res.send(Buffer.from(bin));
      return;
    }
    if (target === "exe-kit") {
      const zipBuf = buildZipArchive(buildWindowsExeKitEntries());
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="NawaCore-Windows-EXE-Kit.zip"');
      res.send(zipBuf);
      return;
    }
    if (target === "apk-kit") {
      const weightsBin = model.exportWeightsBinary();
      const zipBuf = buildZipArchive(buildAndroidApkKitEntries(weightsBin));
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="NawaCore-Android-APK-Kit.zip"');
      res.send(zipBuf);
      return;
    }
    res.status(404).json({ detail: "الحزمة المطلوبة غير موجودة" });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NawaCore Studio listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
