import "dotenv/config";
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
  type AgentSessionContext,
} from "./src/engine/agentRuntime.ts";
import {
  getNawaOfflineLLM,
  type OfflineLLMContext,
  type ResponseStyle,
} from "./src/llm/NawaOfflineLLM.ts";
import {
  generateCloudGeminiReply,
  normalizeGeminiApiError,
  streamCloudGeminiReply,
  type CloudChatTurn,
  type CloudThinkingMode,
} from "./src/server/cloudGeminiService.ts";
import { GoogleGenAI } from "@google/genai";
import {
  fineTuneNawaTransformer,
  getNawaTransformerLM,
} from "./src/llm/NawaTransformerLM.ts";
import {
  KB_PROFILES,
  type DeviceKBProfile,
} from "./src/llm/NawaKnowledgeBase.ts";
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

const PORT = Number(process.env.PORT) || 3000;
const SESSIONS = new Map<
  string,
  { history: Array<{ role: string; content: string }>; context: AgentSessionContext }
>();
const LLM_SESSIONS = new Map<string, OfflineLLMContext>();

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
  // Warm up Intent MLP, WASM kernel, and NawaLM Transformer checkpoint on boot
  const model = getNawaModel();
  await model.syncToWasm();
  const kernel = await getWasmKernel();
  getNawaTransformerLM();

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Cloud Run / Firebase App Hosting health & readiness endpoint
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "nawacore-studio",
      engineDefault: "cloud",
      cloudModel: "gemini-3.1-flash-lite",
      hasGeminiKey: Boolean((process.env.GEMINI_API_KEY || "").trim()),
      firebaseProjectId: "poised-subject-cfx4d",
      firestoreDatabaseId: "ai-studio-nawacorestudio-e14b41b7-0708-47e1-be76-958ba9b07dc2",
      region: process.env.CLOUD_RUN_REGION || "europe-west1",
      runtimeEnv: process.env.K_SERVICE ? "Google Cloud Run" : "AI Studio / Node Server",
      port: PORT,
    });
  });

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

  // Standalone Offline Language Model (Decoupled from IDE Workspace)
  const getOrCreateLlmSession = (
    sessionId: string,
    style: ResponseStyle,
    compressionEnabled?: boolean,
    deviceProfile?: DeviceKBProfile
  ): OfflineLLMContext => {
    let ctx = LLM_SESSIONS.get(sessionId);
    if (!ctx) {
      ctx = {
        activeTopic: null,
        lastEntities: [],
        lastUserDialect: "فصحى / تقني",
        history: [],
        compressedSummary: null,
        compressedTurnsCount: 0,
        compressionEnabled: typeof compressionEnabled === "boolean" ? compressionEnabled : true,
        preferredStyle: style,
        deviceProfile: deviceProfile || "desktop-50b",
        userConstraints: [],
      };
      LLM_SESSIONS.set(sessionId, ctx);
    }
    ctx.preferredStyle = style;
    if (typeof compressionEnabled === "boolean") {
      ctx.compressionEnabled = compressionEnabled;
    }
    if (deviceProfile === "desktop-50b" || deviceProfile === "mobile-50m") {
      ctx.deviceProfile = deviceProfile;
    }
    return ctx;
  };

  app.get("/api/llm/kb-stats", (_req, res) => {
    res.json({ profiles: KB_PROFILES });
  });

  app.post("/api/llm/reset", (req, res) => {
    const sessionId = String(req.body?.session_id || "default");
    LLM_SESSIONS.delete(sessionId);
    res.json({ status: "ok" });
  });

  app.post("/api/llm/compress", (req, res) => {
    const sessionId = String(req.body?.session_id || "default");
    const compressionEnabled =
      typeof req.body?.compressionEnabled === "boolean" ? req.body.compressionEnabled : true;
    const ctx = getOrCreateLlmSession(sessionId, "auto", compressionEnabled);
    const llm = getNawaOfflineLLM();
    const { savedRatioPct } = llm.compressContextIfNeeded(ctx);
    res.json({
      status: "ok",
      compressionStats: {
        enabled: ctx.compressionEnabled,
        activeTurnsInWindow: ctx.history.length,
        compressedTurns: ctx.compressedTurnsCount,
        savedRatioPct,
      },
      compressedSummary: ctx.compressedSummary,
    });
  });

  app.get("/api/llm/model-info", (_req, res) => {
    res.json({
      ...getNawaTransformerLM().getModelInfo(),
      kbProfiles: KB_PROFILES,
    });
  });

  app.post("/api/llm/train", (req, res) => {
    const prompt = String(req.body?.prompt || "").trim();
    const response = String(req.body?.response || "").trim();
    const topic = String(req.body?.topic || "custom").trim();
    const epochs = Number(req.body?.epochs || 12);
    if (!prompt || !response) {
      res.status(400).json({ detail: "يرجى إدخال السؤال التدريبي والإجابة المستهدفة" });
      return;
    }
    try {
      const result = fineTuneNawaTransformer(prompt, response, topic, epochs);
      res.json({ status: "ok", ...result });
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : "فشل تدريب المحول" });
    }
  });

  app.post("/api/llm/chat", async (req, res) => {
    const message = String(req.body?.message || "").trim();
    const sessionId = String(req.body?.session_id || "default");
    const style = String(req.body?.style || "auto") as ResponseStyle;
    const engineMode = req.body?.engineMode === "offline" ? "offline" : "cloud";
    const thinkingMode = (
      req.body?.thinkingMode === "fast" || req.body?.thinkingMode === "deep"
        ? req.body.thinkingMode
        : "auto"
    ) as CloudThinkingMode;
    const searchGrounding =
      typeof req.body?.searchGrounding === "boolean" ? req.body.searchGrounding : true;
    const deviceProfile = req.body?.deviceProfile as DeviceKBProfile | undefined;
    const compressionEnabled =
      typeof req.body?.compressionEnabled === "boolean" ? req.body.compressionEnabled : undefined;
    const temperature =
      typeof req.body?.temperature === "number" ? req.body.temperature : undefined;
    const topK = typeof req.body?.topK === "number" ? req.body.topK : undefined;
    const clientHistory = Array.isArray(req.body?.clientHistory)
      ? (req.body.clientHistory as CloudChatTurn[]).filter(
          (h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string"
        )
      : [];
    if (!message) {
      res.status(400).json({ detail: "الرسالة فارغة" });
      return;
    }

    const ctx = getOrCreateLlmSession(sessionId, style, compressionEnabled, deviceProfile);
    const llm = getNawaOfflineLLM();

    if (engineMode === "cloud") {
      try {
        const mergedHistory: CloudChatTurn[] =
          ctx.history.length > 0
            ? ctx.history.map((h) => ({ role: h.role, content: h.content }))
            : clientHistory;

        const cloudRes = await generateCloudGeminiReply({
          message,
          history: mergedHistory,
          compressedSummary: ctx.compressedSummary,
          style,
          thinkingMode,
          searchGrounding,
        });

        ctx.history.push({ role: "user", content: message, topicTag: "cloud-gemini" });
        ctx.history.push({ role: "assistant", content: cloudRes.reply, topicTag: "cloud-gemini" });
        const comp = llm.compressContextIfNeeded(ctx);

        res.json({
          reply: cloudRes.reply,
          engineMode: "cloud",
          modelName: cloudRes.modelName,
          thinkingLevelUsed: cloudRes.thinkingLevelUsed,
          groundingSources: cloudRes.groundingSources,
          usageTokens: cloudRes.usageTokens,
          latencyMs: cloudRes.latencyMs,
          dialect: "سحابي متعدد اللغات",
          topic: "cloud-gemini",
          compressionStats: {
            enabled: ctx.compressionEnabled,
            activeTurnsInWindow: ctx.history.length,
            compressedTurns: ctx.compressedTurnsCount,
            savedRatioPct: comp.savedRatioPct,
          },
          compressedSummary: ctx.compressedSummary,
          suggestions: [
            "اشرحلي بمثال عملي أوضح",
            "لخصلي أهم النقاط في 5 سطور",
            "إيه أحدث التطورات في الموضوع ده؟",
          ],
        });
      } catch (err) {
        const mapped = normalizeGeminiApiError(err);
        res.status(mapped.statusCode).json({ detail: mapped.message });
      }
      return;
    }

    try {
      const result = await llm.generateReply(message, ctx, {
        temperature,
        topK,
        deviceProfile: ctx.deviceProfile,
      });
      res.json({
        ...result,
        engineMode: "offline",
        compressedSummary: ctx.compressedSummary,
      });
    } catch (err) {
      res.status(500).json({ detail: err instanceof Error ? err.message : "خطأ في النموذج اللغوي" });
    }
  });

  app.post("/api/llm/stream", async (req, res) => {
    const message = String(req.body?.message || "").trim();
    const sessionId = String(req.body?.session_id || "default");
    const style = String(req.body?.style || "auto") as ResponseStyle;
    const engineMode = req.body?.engineMode === "offline" ? "offline" : "cloud";
    const thinkingMode = (
      req.body?.thinkingMode === "fast" || req.body?.thinkingMode === "deep"
        ? req.body.thinkingMode
        : "auto"
    ) as CloudThinkingMode;
    const searchGrounding =
      typeof req.body?.searchGrounding === "boolean" ? req.body.searchGrounding : true;
    const deviceProfile = req.body?.deviceProfile as DeviceKBProfile | undefined;
    const compressionEnabled =
      typeof req.body?.compressionEnabled === "boolean" ? req.body.compressionEnabled : undefined;
    const temperature =
      typeof req.body?.temperature === "number" ? req.body.temperature : undefined;
    const topK = typeof req.body?.topK === "number" ? req.body.topK : undefined;
    const clientHistory = Array.isArray(req.body?.clientHistory)
      ? (req.body.clientHistory as CloudChatTurn[]).filter(
          (h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string"
        )
      : [];
    if (!message) {
      res.status(400).json({ detail: "الرسالة فارغة" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    let closed = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        closed = true;
      }
    });

    const ctx = getOrCreateLlmSession(sessionId, style, compressionEnabled, deviceProfile);
    const llm = getNawaOfflineLLM();

    if (engineMode === "cloud") {
      try {
        const mergedHistory: CloudChatTurn[] =
          ctx.history.length > 0
            ? ctx.history.map((h) => ({ role: h.role, content: h.content }))
            : clientHistory;

        if (closed) return;
        res.write(
          `data: ${JSON.stringify({
            type: "meta",
            engineMode: "cloud",
            modelName: "gemini-3.1-flash-lite",
            dialect: "سحابي شامل",
            topic: "cloud-gemini",
            searchGrounding,
            thinkingMode,
            compressedSummary: ctx.compressedSummary,
          })}\n\n`
        );

        const cloudRes = await streamCloudGeminiReply(
          {
            message,
            history: mergedHistory,
            compressedSummary: ctx.compressedSummary,
            style,
            thinkingMode,
            searchGrounding,
          },
          (chunkText) => {
            if (closed) return;
            res.write(`data: ${JSON.stringify({ type: "token", chunk: chunkText })}\n\n`);
          }
        );

        if (closed) return;
        ctx.history.push({ role: "user", content: message, topicTag: "cloud-gemini" });
        ctx.history.push({ role: "assistant", content: cloudRes.reply, topicTag: "cloud-gemini" });
        const comp = llm.compressContextIfNeeded(ctx);

        res.write(
          `data: ${JSON.stringify({
            type: "done",
            engineMode: "cloud",
            modelName: cloudRes.modelName,
            thinkingLevelUsed: cloudRes.thinkingLevelUsed,
            groundingSources: cloudRes.groundingSources,
            usageTokens: cloudRes.usageTokens,
            latencyMs: cloudRes.latencyMs,
            compressionStats: {
              enabled: ctx.compressionEnabled,
              activeTurnsInWindow: ctx.history.length,
              compressedTurns: ctx.compressedTurnsCount,
              savedRatioPct: comp.savedRatioPct,
            },
            compressedSummary: ctx.compressedSummary,
            suggestions: [
              "اشرحلي بمثال عملي أوضح",
              "لخصلي أهم النقاط في 5 سطور",
              "تعمّق أكثر في التفاصيل التقنية",
            ],
          })}\n\n`
        );
        res.end();
      } catch (err) {
        if (!closed) {
          const mapped = normalizeGeminiApiError(err);
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              statusCode: mapped.statusCode,
              detail: mapped.message,
            })}\n\n`
          );
          res.end();
        }
      }
      return;
    }

    try {
      const result = await llm.generateReply(message, ctx, {
        temperature,
        topK,
        deviceProfile: ctx.deviceProfile,
      });

      if (closed) return;
      res.write(
        `data: ${JSON.stringify({
          type: "meta",
          engineMode: "offline",
          topic: result.topic,
          dialect: result.dialect,
          intentCategory: result.intentCategory,
          analysis: result.analysis,
          attentionMatch: result.attentionMatch,
          compressionStats: result.compressionStats,
          neuralTelemetry: result.neuralTelemetry,
          kbMetadata: result.kbMetadata,
          compressedSummary: ctx.compressedSummary,
          wasmInferenceMs: result.wasmInferenceMs,
          tokensProcessed: result.tokensProcessed,
        })}\n\n`
      );

      const tokens = result.reply.match(/\S+\s*/g) || [result.reply];
      const chunkSize = 3;
      for (let i = 0; i < tokens.length; i += chunkSize) {
        if (closed) return;
        const chunk = tokens.slice(i, i + chunkSize).join("");
        res.write(`data: ${JSON.stringify({ type: "token", chunk })}\n\n`);
        await new Promise((r) => setTimeout(r, 12));
      }

      if (closed) return;
      res.write(
        `data: ${JSON.stringify({
          type: "done",
          engineMode: "offline",
          suggestions: result.suggestions,
          compressionStats: result.compressionStats,
          compressedSummary: ctx.compressedSummary,
        })}\n\n`
      );
      res.end();
    } catch (err) {
      if (!closed) {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            detail: err instanceof Error ? err.message : "خطأ في البث",
          })}\n\n`
        );
        res.end();
      }
    }
  });

  // Reset IDE agent session
  app.post("/api/reset", (req, res) => {
    const sessionId = String(req.body?.session_id || "default");
    SESSIONS.delete(sessionId);
    res.json({ status: "ok" });
  });

  // Custom Local Neural Agent Chat (with persistent context memory + optional taskScope)
  app.post("/api/chat", async (req, res) => {
    const message = String(req.body?.message || "").trim();
    const sessionId = String(req.body?.session_id || "default");
    const taskScope = String(req.body?.taskScope || "auto") as AgentIntentId | "auto";
    if (!message) {
      res.status(400).json({ detail: "الرسالة فارغة" });
      return;
    }
    try {
      let session = SESSIONS.get(sessionId);
      if (!session) {
        session = {
          history: [],
          context: {
            lastFile: null,
            lastDomain: "tasks",
            lastDomainObj: { nameEn: "tasks", nameAr: "المهام", fields: ["title", "priority", "done"] },
            lastLanguage: "python",
            lastIntent: null,
            createdFiles: [],
            turnCount: 0,
          },
        };
        SESSIONS.set(sessionId, session);
      }
      session.history.push({ role: "user", content: message });
      const result = await runCustomAgent(message, session.context, taskScope);
      session.history.push({ role: "assistant", content: result.reply });
      if (session.history.length > 40) {
        session.history = session.history.slice(-40);
      }
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
      const adMobAppId = typeof req.query.adMobAppId === "string" ? req.query.adMobAppId : undefined;
      const adMobUnitId = typeof req.query.adMobUnitId === "string" ? req.query.adMobUnitId : undefined;
      const zipBuf = buildZipArchive(buildAndroidApkKitEntries(weightsBin, { adMobAppId, adMobUnitId }));
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="NawaCore-Android-APK-Kit.zip"');
      res.send(zipBuf);
      return;
    }
    const rootFiles: Record<string, { filename: string; mime: string }> = {
      deb: { filename: "nawacore-studio_2.0.0_amd64.deb", mime: "application/vnd.debian.binary-package" },
      run: { filename: "NawaCore-Setup.run", mime: "application/x-shellscript" },
      pyz: { filename: "NawaCore-Agent.pyz", mime: "application/octet-stream" },
      "llm-weights": { filename: "nawa_llm.bin", mime: "application/octet-stream" },
    };
    if (rootFiles[target]) {
      const filePath = path.resolve(process.cwd(), rootFiles[target].filename);
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", rootFiles[target].mime);
        res.setHeader("Content-Disposition", `attachment; filename="${rootFiles[target].filename}"`);
        res.sendFile(filePath);
        return;
      }
    }
    res.status(404).json({ detail: "الحزمة المطلوبة غير موجودة" });
  });

  // Lyria Music Generation (lyria-3-clip-preview / lyria-3-pro-preview)
  app.post("/api/ai/music", async (req, res) => {
    const prompt = String(req.body?.prompt || "").trim();
    const duration = String(req.body?.duration || "clip");
    if (!prompt) {
      res.status(400).json({ detail: "يرجى إدخال وصف الموسيقى المطلوبة" });
      return;
    }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = duration === "full" ? "lyria-3-pro-preview" : "lyria-3-clip-preview";
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      res.json({
        ok: true,
        model,
        prompt,
        audioUri: response.candidates?.[0]?.content?.parts?.[0]?.fileData?.fileUri || null,
        text: response.text || "تم توليد المقطع الموسيقي بنجاح.",
      });
    } catch (err) {
      const mapped = normalizeGeminiApiError(err);
      res.status(mapped.statusCode).json({ detail: mapped.message });
    }
  });

  // Image Generation (gemini-nano-banana-2.1)
  app.post("/api/ai/image", async (req, res) => {
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) {
      res.status(400).json({ detail: "يرجى إدخال وصف الصورة" });
      return;
    }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-nano-banana-2.1",
        contents: prompt,
      });
      res.json({
        ok: true,
        model: "gemini-nano-banana-2.1",
        prompt,
        text: response.text || "تم توليد الصورة بنجاح.",
      });
    } catch (err) {
      const mapped = normalizeGeminiApiError(err);
      res.status(mapped.statusCode).json({ detail: mapped.message });
    }
  });

  // Audio Transcription (gemini-3.5-transcribe)
  app.post("/api/ai/transcribe", async (req, res) => {
    const audioBase64 = String(req.body?.audioBase64 || "").trim();
    const mimeType = String(req.body?.mimeType || "audio/webm");
    if (!audioBase64) {
      res.status(400).json({ detail: "البيانات الصوتية مطلوبة" });
      return;
    }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: "قم بتفريغ النص الصوتي التالي بدقة باللغة العربية أو الإنجليزية." },
          ],
        },
      });
      res.json({
        ok: true,
        transcript: response.text || "لم يتم اكتشاف صوت واضح.",
      });
    } catch (err) {
      const mapped = normalizeGeminiApiError(err);
      res.status(mapped.statusCode).json({ detail: mapped.message });
    }
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
