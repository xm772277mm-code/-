import "dotenv/config";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";
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
  type CloudGroundingMode,
  type CloudModelId,
  type CloudSystemRole,
  type CloudThinkingMode,
} from "./src/server/cloudGeminiService.ts";
import {
  checkUserCloudQuota,
  getUserQuotaSnapshot,
  recordUserCloudUsage,
  verifyFirebaseBearerToken,
} from "./src/server/firebaseAuthGuard.ts";
import { adminAuth } from "./src/lib/firebase-admin.ts";
import { requireAuth, type AuthenticatedRequest } from "./src/middleware/auth.ts";
import {
  createUserNote,
  deleteUserNote,
  listTopGameScores,
  listUserMediaCreations,
  listUserNotes,
  recordGameScore,
  recordMediaCreation,
} from "./src/db/workspaceStore.ts";
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

function createServerGeminiClient(timeoutMs = 60000): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw Object.assign(
      new Error("مفتاح GEMINI_API_KEY غير مضبوط في إعدادات الخادم (Settings > Secrets)."),
      { statusCode: 503 }
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: timeoutMs,
      retryOptions: { attempts: 1 },
      headers: { "User-Agent": "aistudio-build" },
    },
  });
}

async function startServer() {
  ensureWorkspaceSeeded();
  const model = getNawaModel();
  await model.syncToWasm();
  const kernel = await getWasmKernel();

  const app = express();
  app.use(express.json({ limit: "25mb" }));

  // Cloud Run / Firebase App Hosting health & readiness endpoint
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "nawacore-studio",
      engineDefault: "cloud",
      cloudModel: "gemini-3.1-flash-lite",
      cloudAuthRequired: true,
      billingMode: "per_user_verified_quota",
      hasGeminiKey: Boolean((process.env.GEMINI_API_KEY || "").trim()),
      hasMapsKey: Boolean(
        (process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "").trim()
      ),
      firebaseProjectId: "poised-subject-cfx4d",
      firestoreDatabaseId: "ai-studio-nawacorestudio-e14b41b7-0708-47e1-be76-958ba9b07dc2",
      region: process.env.CLOUD_RUN_REGION || "europe-west1",
      runtimeEnv: process.env.K_SERVICE ? "Google Cloud Run" : "AI Studio / Node Server",
      port: PORT,
    });
  });

  // Google Maps client key resolver (browser key restricted by HTTP referrer)
  app.get("/api/maps/config", (_req, res) => {
    const apiKey = (
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      ""
    ).trim();
    res.json({
      configured: Boolean(apiKey),
      apiKey,
    });
  });

  // Verified Google user daily usage & billing attribution summary
  app.get("/api/billing/account-usage", async (req, res) => {
    const authResult = await verifyFirebaseBearerToken(req);
    if (!authResult.ok) {
      res.status(authResult.statusCode).json({
        detail: authResult.message,
        authRequired: authResult.statusCode === 401,
      });
      return;
    }
    const snapshot = getUserQuotaSnapshot(authResult.user.uid, authResult.user.email);
    res.json({
      billingMode: "per_user_verified_quota",
      gcpBillingSource: "Settings > Secrets (GEMINI_API_KEY)",
      user: authResult.user,
      quota: snapshot,
    });
  });

  // Workspace file listing & reader
  app.get("/api/files", (_req, res) => {
    res.json({ tree: listFiles(".") });
  });

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

  // Session Management for Chatbot & Small Experimental Model
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

  // Cloud Gemini Chat + Grounding (Web Search / Google Maps) + Small Experimental Model Fallback
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
    const modelId = req.body?.modelId as CloudModelId | undefined;
    const systemRole = req.body?.systemRole as CloudSystemRole | undefined;
    const groundingMode = req.body?.groundingMode as CloudGroundingMode | undefined;
    const searchGrounding =
      typeof req.body?.searchGrounding === "boolean" ? req.body.searchGrounding : false;
    const userLocation =
      req.body?.userLocation &&
      typeof req.body.userLocation.latitude === "number" &&
      typeof req.body.userLocation.longitude === "number"
        ? {
            latitude: req.body.userLocation.latitude,
            longitude: req.body.userLocation.longitude,
          }
        : null;
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
      const authResult = await verifyFirebaseBearerToken(req);
      if (!authResult.ok) {
        res.status(authResult.statusCode).json({
          detail: authResult.message,
          authRequired: authResult.statusCode === 401,
        });
        return;
      }

      const quotaCheck = checkUserCloudQuota(authResult.user.uid, authResult.user.email);
      if (!quotaCheck.allowed) {
        res.status(quotaCheck.statusCode).json({
          detail: quotaCheck.message,
          accountBilling: quotaCheck.snapshot,
        });
        return;
      }

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
          modelId,
          systemRole,
          groundingMode,
          searchGrounding,
          userLocation,
        });

        ctx.history.push({ role: "user", content: message, topicTag: "cloud-gemini" });
        ctx.history.push({ role: "assistant", content: cloudRes.reply, topicTag: "cloud-gemini" });
        const comp = llm.compressContextIfNeeded(ctx);
        const accountBilling = recordUserCloudUsage(
          authResult.user.uid,
          authResult.user.email,
          cloudRes.usageTokens
        );

        res.json({
          reply: cloudRes.reply,
          engineMode: "cloud",
          modelName: cloudRes.modelName,
          thinkingLevelUsed: cloudRes.thinkingLevelUsed,
          groundingSources: cloudRes.groundingSources,
          usageTokens: cloudRes.usageTokens,
          latencyMs: cloudRes.latencyMs,
          accountBilling,
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
            "ما الخطوات العملية التالية؟",
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
        modelName: "نموذج صغير (النسخة التجريبية)",
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
    const modelId = req.body?.modelId as CloudModelId | undefined;
    const systemRole = req.body?.systemRole as CloudSystemRole | undefined;
    const groundingMode = req.body?.groundingMode as CloudGroundingMode | undefined;
    const searchGrounding =
      typeof req.body?.searchGrounding === "boolean" ? req.body.searchGrounding : false;
    const userLocation =
      req.body?.userLocation &&
      typeof req.body.userLocation.latitude === "number" &&
      typeof req.body.userLocation.longitude === "number"
        ? {
            latitude: req.body.userLocation.latitude,
            longitude: req.body.userLocation.longitude,
          }
        : null;
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

    let verifiedUser: { uid: string; email: string } | null = null;
    if (engineMode === "cloud") {
      const authResult = await verifyFirebaseBearerToken(req);
      if (!authResult.ok) {
        res.status(authResult.statusCode).json({
          detail: authResult.message,
          authRequired: authResult.statusCode === 401,
        });
        return;
      }
      const quotaCheck = checkUserCloudQuota(authResult.user.uid, authResult.user.email);
      if (!quotaCheck.allowed) {
        res.status(quotaCheck.statusCode).json({
          detail: quotaCheck.message,
          accountBilling: quotaCheck.snapshot,
        });
        return;
      }
      verifiedUser = { uid: authResult.user.uid, email: authResult.user.email };
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

    if (engineMode === "cloud" && verifiedUser) {
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
            modelName:
              groundingMode === "maps" ? "gemini-4-hydrogen" : modelId || "gemini-3.1-flash-lite",
            dialect: "سحابي شامل",
            topic: "cloud-gemini",
            groundingMode: groundingMode || (searchGrounding ? "search" : "none"),
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
            modelId,
            systemRole,
            groundingMode,
            searchGrounding,
            userLocation,
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
        const accountBilling = recordUserCloudUsage(
          verifiedUser.uid,
          verifiedUser.email,
          cloudRes.usageTokens
        );

        res.write(
          `data: ${JSON.stringify({
            type: "done",
            engineMode: "cloud",
            modelName: cloudRes.modelName,
            thinkingLevelUsed: cloudRes.thinkingLevelUsed,
            groundingSources: cloudRes.groundingSources,
            usageTokens: cloudRes.usageTokens,
            latencyMs: cloudRes.latencyMs,
            accountBilling,
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
              "تعمّق أكثر في التفاصيل العملية",
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
          modelName: "نموذج صغير (النسخة التجريبية)",
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
          modelName: "نموذج صغير (النسخة التجريبية)",
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

  // Task Studio endpoints
  app.post("/api/reset", (req, res) => {
    const sessionId = String(req.body?.session_id || "default");
    SESSIONS.delete(sessionId);
    res.json({ status: "ok" });
  });

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

  // Legacy model endpoints (preserved for API compatibility)
  app.get("/api/model/info", (_req, res) => {
    res.json({
      name: "NawaCore-Small-Exp",
      architecture: `${INPUT_DIM} -> ${HIDDEN1_DIM} -> ${HIDDEN2_DIM} -> ${OUTPUT_DIM}`,
      totalParams: model.totalParams,
      weightsSizeBytes: model.totalParams * 4 + 20,
      wasmSizeBytes: kernel.wasmBytes.byteLength,
      trainedEpochs: model.trainedEpochs,
      corpusCount: model.corpus.length,
      intents: INTENTS,
    });
  });

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
    });
  });

  app.post("/api/benchmark", (req, res) => {
    const requestedOps = Number(req.body?.targetOps || 50_000_000);
    const clampedOps = Math.min(Math.max(requestedOps, 10_000_000), 500_000_000);
    const result = kernel.runBenchmark(clampedOps);
    res.json({
      ...result,
      runtime: `Node.js ${process.version} (${os.arch()}/${os.platform()})`,
    });
  });

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
    });
  });

  app.get("/api/packaging/preview", (req, res) => {
    const target = String(req.query.target || "windows");
    if (target === "windows") {
      res.json({ filename: "src/nawa_agent.cpp", language: "cpp", code: generateWindowsCppEngine() });
    } else if (target === "android") {
      res.json({ filename: "app/src/main/cpp/nawa_neon_jni.cpp", language: "cpp", code: generateAndroidNeonCpp() });
    } else {
      res.json({ filename: "src/nawa_weights.h", language: "cpp", code: generateWeightsHeader().slice(0, 6000) });
    }
  });

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
    const staticArtifacts: Record<string, { file: string; mime: string }> = {
      deb: { file: "nawacore-studio_2.0.0_amd64.deb", mime: "application/vnd.debian.binary-package" },
      run: { file: "NawaCore-Setup.run", mime: "application/x-shellscript" },
      pyz: { file: "NawaCore-Agent.pyz", mime: "application/octet-stream" },
      "llm-weights": { file: "nawa_llm.bin", mime: "application/octet-stream" },
    };
    const matchedArtifact = staticArtifacts[target];
    if (matchedArtifact) {
      const fullPath = path.resolve(process.cwd(), matchedArtifact.file);
      if (fs.existsSync(fullPath)) {
        res.setHeader("Content-Type", matchedArtifact.mime);
        res.setHeader("Content-Disposition", `attachment; filename="${matchedArtifact.file}"`);
        res.sendFile(fullPath);
        return;
      }
    }
    res.status(404).json({ detail: "الحزمة المطلوبة غير موجودة" });
  });

  // Feature 6: Real Lyria Music Streaming Generation (lyria-3-clip-preview / lyria-3-pro-preview)
  app.post("/api/ai/music", async (req, res) => {
    const authResult = await verifyFirebaseBearerToken(req);
    if (!authResult.ok) {
      res.status(authResult.statusCode).json({
        detail: authResult.message,
        authRequired: authResult.statusCode === 401,
      });
      return;
    }
    const quotaCheck = checkUserCloudQuota(authResult.user.uid, authResult.user.email);
    if (!quotaCheck.allowed) {
      res.status(quotaCheck.statusCode).json({
        detail: quotaCheck.message,
        accountBilling: quotaCheck.snapshot,
      });
      return;
    }

    const prompt = String(req.body?.prompt || "").trim();
    const duration = String(req.body?.duration || "clip");
    if (!prompt) {
      res.status(400).json({ detail: "يرجى إدخال وصف الموسيقى المطلوبة" });
      return;
    }
    try {
      const ai = createServerGeminiClient(120000);
      const modelName = duration === "full" ? "lyria-3-pro-preview" : "lyria-3-clip-preview";
      const stream = await ai.models.generateContentStream({
        model: modelName,
        contents: prompt,
      });

      const audioChunks: Buffer[] = [];
      let audioMimeType = "audio/mpeg";
      let lyricsText = "";
      let usageTokens = 0;

      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              lyricsText += part.text;
            }
            if (part.inlineData?.data) {
              audioChunks.push(Buffer.from(part.inlineData.data, "base64"));
              if (part.inlineData.mimeType) {
                audioMimeType = part.inlineData.mimeType;
              }
            }
          }
        }
        if (chunk.usageMetadata?.totalTokenCount) {
          usageTokens = chunk.usageMetadata.totalTokenCount;
        }
      }

      const audioDataUrl =
        audioChunks.length > 0
          ? `data:${audioMimeType};base64,${Buffer.concat(audioChunks).toString("base64")}`
          : null;

      const finalTokens = usageTokens || 500;
      const accountBilling = recordUserCloudUsage(
        authResult.user.uid,
        authResult.user.email,
        finalTokens
      );

      res.json({
        ok: true,
        model: modelName,
        prompt,
        audioUri: audioDataUrl,
        text: lyricsText.trim() || "تم توليد المقطع الموسيقي بنجاح.",
        usageTokens: finalTokens,
        accountBilling,
      });
    } catch (err) {
      const mapped = normalizeGeminiApiError(err);
      res.status(mapped.statusCode).json({ detail: mapped.message });
    }
  });

  // Feature 10: Image Generation & Image Editing (gemini-nano-banana-2.1)
  app.post("/api/ai/image", async (req, res) => {
    const authResult = await verifyFirebaseBearerToken(req);
    if (!authResult.ok) {
      res.status(authResult.statusCode).json({
        detail: authResult.message,
        authRequired: authResult.statusCode === 401,
      });
      return;
    }
    const quotaCheck = checkUserCloudQuota(authResult.user.uid, authResult.user.email);
    if (!quotaCheck.allowed) {
      res.status(quotaCheck.statusCode).json({
        detail: quotaCheck.message,
        accountBilling: quotaCheck.snapshot,
      });
      return;
    }

    const prompt = String(req.body?.prompt || "").trim();
    const inputImageBase64 = typeof req.body?.inputImageBase64 === "string" ? req.body.inputImageBase64.trim() : "";
    const inputImageMimeType = typeof req.body?.inputImageMimeType === "string" ? req.body.inputImageMimeType.trim() : "image/png";
    const aspectRatio = typeof req.body?.aspectRatio === "string" ? req.body.aspectRatio.trim() : "1:1";
    const imageSize = typeof req.body?.imageSize === "string" ? req.body.imageSize.trim() : "1K";

    if (!prompt) {
      res.status(400).json({ detail: "يرجى إدخال وصف الصورة أو التعديل المطلوب" });
      return;
    }

    try {
      const ai = createServerGeminiClient(90000);
      const contents = inputImageBase64
        ? [
            { inlineData: { mimeType: inputImageMimeType, data: inputImageBase64 } },
            prompt,
          ]
        : prompt;

      const response = await ai.models.generateContent({
        model: "gemini-nano-banana-2.1",
        contents,
        config: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      const inlinePart = parts.find((p) => p.inlineData?.data && p.inlineData?.mimeType)?.inlineData;
      const imageDataUrl = inlinePart
        ? `data:${inlinePart.mimeType};base64,${inlinePart.data}`
        : null;
      const caption = parts
        .filter((p) => typeof p.text === "string")
        .map((p) => p.text)
        .join("\n")
        .trim();

      const usageTokens = response.usageMetadata?.totalTokenCount || 500;
      const accountBilling = recordUserCloudUsage(
        authResult.user.uid,
        authResult.user.email,
        usageTokens
      );

      res.json({
        ok: true,
        model: "gemini-nano-banana-2.1",
        prompt,
        imageDataUrl,
        text: caption || "تم إنشاء الصورة بنجاح.",
        usageTokens,
        accountBilling,
      });
    } catch (err) {
      const mapped = normalizeGeminiApiError(err);
      res.status(mapped.statusCode).json({ detail: mapped.message });
    }
  });

  // Features 11 & 12: Video Generation & Image-to-Video Animation (gemini-omni-1.2-flash via Interactions API)
  app.post("/api/ai/video", async (req, res) => {
    const authResult = await verifyFirebaseBearerToken(req);
    if (!authResult.ok) {
      res.status(authResult.statusCode).json({
        detail: authResult.message,
        authRequired: authResult.statusCode === 401,
      });
      return;
    }
    const quotaCheck = checkUserCloudQuota(authResult.user.uid, authResult.user.email);
    if (!quotaCheck.allowed) {
      res.status(quotaCheck.statusCode).json({
        detail: quotaCheck.message,
        accountBilling: quotaCheck.snapshot,
      });
      return;
    }

    const prompt = String(req.body?.prompt || "").trim();
    const inputImageBase64 = typeof req.body?.inputImageBase64 === "string" ? req.body.inputImageBase64.trim() : "";
    const inputImageMimeType = typeof req.body?.inputImageMimeType === "string" ? req.body.inputImageMimeType.trim() : "image/png";
    const aspectRatio = req.body?.aspectRatio === "9:16" ? "9:16" : "16:9";
    const duration = req.body?.duration === "10s" ? "10s" : "5s";

    if (!prompt) {
      res.status(400).json({ detail: "يرجى إدخال وصف الفيديو أو الحركة المطلوبة" });
      return;
    }

    try {
      const ai = createServerGeminiClient(300000);
      const interactionInput = inputImageBase64
        ? [
            {
              type: "image" as const,
              data: inputImageBase64,
              mime_type: inputImageMimeType as "image/png" | "image/jpeg" | "image/webp",
            },
            {
              type: "text" as const,
              text: prompt,
            },
          ]
        : prompt;

      const interaction = await ai.interactions.create(
        {
          model: "gemini-omni-1.2-flash",
          input: interactionInput,
          response_format: {
            type: "video",
            aspect_ratio: aspectRatio,
            duration,
            resolution: "720p",
          },
        },
        { timeout: 300000 }
      );

      const outVideo = interaction.output_video as
        | { data?: string; mime_type?: string; uri?: string }
        | undefined;
      const videoDataUrl = outVideo?.data
        ? `data:${outVideo.mime_type || "video/mp4"};base64,${outVideo.data}`
        : outVideo?.uri || null;

      if (!videoDataUrl) {
        throw new Error("لم يتم استلام ملف الفيديو من خادم التوليد.");
      }

      const usageTokens = interaction.usage?.total_tokens || 1200;
      const accountBilling = recordUserCloudUsage(
        authResult.user.uid,
        authResult.user.email,
        usageTokens
      );

      res.json({
        ok: true,
        model: "gemini-omni-1.2-flash",
        prompt,
        videoDataUrl,
        text: interaction.output_text || "تم توليد الفيديو بنجاح.",
        usageTokens,
        accountBilling,
      });
    } catch (err) {
      const mapped = normalizeGeminiApiError(err);
      res.status(mapped.statusCode).json({ detail: mapped.message });
    }
  });

  // Feature 14: Audio Transcription (gemini-3.5-transcribe)
  app.post("/api/ai/transcribe", async (req, res) => {
    const authResult = await verifyFirebaseBearerToken(req);
    if (!authResult.ok) {
      res.status(authResult.statusCode).json({
        detail: authResult.message,
        authRequired: authResult.statusCode === 401,
      });
      return;
    }
    const quotaCheck = checkUserCloudQuota(authResult.user.uid, authResult.user.email);
    if (!quotaCheck.allowed) {
      res.status(quotaCheck.statusCode).json({
        detail: quotaCheck.message,
        accountBilling: quotaCheck.snapshot,
      });
      return;
    }

    const audioBase64 = String(req.body?.audioBase64 || "").trim();
    const mimeType = String(req.body?.mimeType || "audio/webm");
    if (!audioBase64) {
      res.status(400).json({ detail: "البيانات الصوتية مطلوبة" });
      return;
    }
    try {
      const ai = createServerGeminiClient(45000);
      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: "قم بتفريغ النص الصوتي التالي بدقة باللغة العربية أو الإنجليزية دون إضافات." },
          ],
        },
      });
      const usageTokens = response.usageMetadata?.totalTokenCount || 200;
      const accountBilling = recordUserCloudUsage(
        authResult.user.uid,
        authResult.user.email,
        usageTokens
      );
      res.json({
        ok: true,
        transcript: response.text || "لم يتم اكتشاف صوت واضح.",
        usageTokens,
        accountBilling,
      });
    } catch (err) {
      const mapped = normalizeGeminiApiError(err);
      res.status(mapped.statusCode).json({ detail: mapped.message });
    }
  });

  // Feature 7: Cloud SQL PostgreSQL Routes (Notes, Game Leaderboard, Saved Media History)
  app.get("/api/sql/notes", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const notes = await listUserNotes(req.user!);
      res.json({ notes });
    } catch (err) {
      console.error("SQL notes read error:", err);
      res.status(500).json({ detail: "تعذر تحميل الملاحظات المحفوظة حالياً." });
    }
  });

  app.post("/api/sql/notes", requireAuth, async (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();
    const category = String(req.body?.category || "general").trim();
    if (!title || !content) {
      res.status(400).json({ detail: "يرجى كتابة عنوان ومحتوى الملاحظة." });
      return;
    }
    try {
      const note = await createUserNote(req.user!, title, content, category);
      res.status(201).json({ note });
    } catch (err) {
      console.error("SQL notes write error:", err);
      res.status(500).json({ detail: "تعذر حفظ الملاحظة حالياً." });
    }
  });

  app.delete("/api/sql/notes/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    const noteId = Number(req.params.id);
    if (!Number.isInteger(noteId) || noteId <= 0) {
      res.status(400).json({ detail: "معرف الملاحظة غير صالح." });
      return;
    }
    try {
      const removed = await deleteUserNote(req.user!, noteId);
      if (!removed) {
        res.status(404).json({ detail: "الملاحظة غير موجودة أو غير مصرح بحذفها." });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("SQL notes delete error:", err);
      res.status(500).json({ detail: "تعذر حذف الملاحظة." });
    }
  });

  app.get("/api/sql/scores", async (_req, res) => {
    try {
      const scores = await listTopGameScores();
      res.json({ scores });
    } catch (err) {
      console.error("SQL scores read error:", err);
      res.status(500).json({ detail: "تعذر تحميل لوحة النتائج." });
    }
  });

  app.post("/api/sql/scores", requireAuth, async (req: AuthenticatedRequest, res) => {
    const score = Number(req.body?.score);
    const wave = Number(req.body?.wave || 1);
    const outcome = String(req.body?.outcome || "completed");
    if (!Number.isFinite(score) || score < 0) {
      res.status(400).json({ detail: "قيمة النقاط غير صالحة." });
      return;
    }
    try {
      const saved = await recordGameScore(req.user!, score, wave, outcome);
      const scores = await listTopGameScores();
      res.status(201).json({ saved, scores });
    } catch (err) {
      console.error("SQL score save error:", err);
      res.status(500).json({ detail: "تعذر حفظ النتيجة." });
    }
  });

  app.get("/api/sql/creations", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const items = await listUserMediaCreations(req.user!);
      res.json({ items });
    } catch (err) {
      console.error("SQL creations read error:", err);
      res.status(500).json({ detail: "تعذر تحميل سجل الإبداعات." });
    }
  });

  app.post("/api/sql/creations", requireAuth, async (req: AuthenticatedRequest, res) => {
    const mediaType = String(req.body?.mediaType || "image").trim();
    const modelName = String(req.body?.modelName || "").trim();
    const prompt = String(req.body?.prompt || "").trim();
    const summaryText = typeof req.body?.summaryText === "string" ? req.body.summaryText : null;
    if (!prompt || !modelName) {
      res.status(400).json({ detail: "بيانات السجل ناقصة." });
      return;
    }
    try {
      const item = await recordMediaCreation(req.user!, mediaType, modelName, prompt, summaryText);
      res.status(201).json({ item });
    } catch (err) {
      console.error("SQL creation save error:", err);
      res.status(500).json({ detail: "تعذر حفظ السجل." });
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

  const httpServer = http.createServer(app);

  // Feature 9: Real-time Voice Conversations via Gemini Live API (gemini-3.8-live)
  const wss = new WebSocketServer({ server: httpServer, path: "/live" });
  wss.on("connection", async (ws, req) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null = null;
    let verifiedEmail = "";
    let verifiedUid = "";

    const safeSend = (payload: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    };

    try {
      const url = new URL(req.url || "/live", `http://${req.headers.host || "localhost"}`);
      const token = (url.searchParams.get("token") || "").trim();
      const voiceName = (url.searchParams.get("voice") || "Aoede").trim();
      if (!token) {
        safeSend({ type: "error", detail: "يلزم تسجيل الدخول بحساب Google لبدء المحادثة الصوتية المباشرة." });
        ws.close(4001, "Unauthorized");
        return;
      }

      const decoded = await adminAuth.verifyIdToken(token);
      verifiedUid = decoded.uid;
      verifiedEmail = decoded.email || `${decoded.uid}@users.local`;

      const quotaCheck = checkUserCloudQuota(verifiedUid, verifiedEmail);
      if (!quotaCheck.allowed) {
        safeSend({ type: "error", detail: quotaCheck.message });
        ws.close(4029, "Quota exceeded");
        return;
      }

      const ai = createServerGeminiClient(60000);
      liveSession = await ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction:
            "أنت «نواة» في وضع المحادثة الصوتية الفورية. تحدّث بلغة عربية واضحة وطبيعية وبإجابات صوتية رشيقة ومباشرة، وتفهم الإنجليزية عند التبديل إليها.",
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            recordUserCloudUsage(verifiedUid, verifiedEmail, 150);
            safeSend({ type: "ready" });
          },
          onmessage: (msg) => {
            const sc = msg.serverContent;
            if (!sc) return;
            if (sc.interrupted) {
              safeSend({ type: "interrupted" });
            }
            if (sc.inputTranscription?.text) {
              safeSend({ type: "input_transcript", text: sc.inputTranscription.text });
            }
            if (sc.outputTranscription?.text) {
              safeSend({ type: "output_transcript", text: sc.outputTranscription.text });
            }
            const parts = sc.modelTurn?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  safeSend({
                    type: "audio",
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || "audio/pcm;rate=24000",
                  });
                }
              }
            }
            if (sc.turnComplete) {
              safeSend({ type: "turn_complete" });
            }
          },
          onerror: (err) => {
            safeSend({
              type: "error",
              detail: err instanceof Error ? err.message : "حدث خطأ في قناة الصوت المباشر.",
            });
          },
          onclose: () => {
            safeSend({ type: "closed" });
          },
        },
      });
    } catch (err) {
      const mapped = normalizeGeminiApiError(err);
      safeSend({ type: "error", detail: mapped.message });
      ws.close(1011, "Live init failed");
      return;
    }

    ws.on("message", (raw) => {
      if (!liveSession) return;
      try {
        const msg = JSON.parse(String(raw)) as {
          type?: string;
          data?: string;
          text?: string;
        };
        if (msg.type === "audio" && msg.data) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" },
          });
        } else if (msg.type === "text" && msg.text) {
          liveSession.sendClientContent({
            turns: msg.text,
            turnComplete: true,
          });
        }
      } catch {
        // ignore malformed frames
      }
    });

    ws.on("close", () => {
      try {
        liveSession?.close();
      } catch {
        // ignore
      }
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`NawaCore Studio listening on http://0.0.0.0:${PORT}`);
    setImmediate(() => {
      try {
        getNawaTransformerLM();
      } catch (err) {
        console.error("NawaTransformerLM warmup error:", err);
      }
    });
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
