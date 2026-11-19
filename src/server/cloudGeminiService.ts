import { GoogleGenAI, ThinkingLevel, type Content, type GenerateContentResponse } from "@google/genai";

export type CloudModelId =
  | "gemini-3.1-flash-lite"
  | "gemini-4-hydrogen"
  | "gemini-4-neon"
  | "gemini-4-carbon";

export type CloudThinkingMode = "fast" | "auto" | "deep";
export type CloudResponseStyle = "auto" | "simple" | "detailed" | "concise";
export type CloudGroundingMode = "none" | "search" | "maps";
export type CloudSystemRole = "assistant" | "coder" | "tutor" | "analyst";

export interface GroundingSource {
  title: string;
  uri: string;
  kind?: "web" | "maps";
  snippet?: string;
}

export interface CloudChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CloudGeminiRequest {
  message: string;
  history: CloudChatTurn[];
  compressedSummary?: string | null;
  style?: CloudResponseStyle;
  thinkingMode?: CloudThinkingMode;
  modelId?: CloudModelId;
  systemRole?: CloudSystemRole;
  groundingMode?: CloudGroundingMode;
  searchGrounding?: boolean;
  userLocation?: { latitude: number; longitude: number } | null;
  preferredDialect?: string;
}

export interface CloudGeminiResult {
  reply: string;
  modelName: string;
  thinkingLevelUsed: string;
  groundingSources: GroundingSource[];
  usageTokens: number;
  latencyMs: number;
}

let cachedClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw Object.assign(
      new Error("مفتاح GEMINI_API_KEY غير مضبوط في إعدادات الخادم (Settings > Secrets)."),
      { statusCode: 503 }
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 60000,
        retryOptions: {
          attempts: 1,
        },
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return cachedClient;
}

function buildSystemInstruction(
  style: CloudResponseStyle = "auto",
  systemRole: CloudSystemRole = "assistant",
  compressedSummary?: string | null
): string {
  const roleDirective =
    systemRole === "coder"
      ? "دورك: مهندس برمجيات خبير ومعماري أنظمة. ركّز على الكود النظيف، الأداء، الأمان، وأمثلة TypeScript/Python/SQL العملية."
      : systemRole === "tutor"
        ? "دورك: معلّم ومبسّط علوم وتقنية. اشرح المفاهيم بالتدريج مع أمثلة واقعية واضحة وأسئلة تفاعلية قصيرة."
        : systemRole === "analyst"
          ? "دورك: محلل استراتيجي ومالي وتقني. قدّم تحليلات منظمة بجداول مقارنة، مخاطر، وتوصيات عملية قابلة للتنفيذ."
          : "دورك: مساعد ذكي متكامل واسع المعرفة للكتابة والبرمجة والتخطيط والحياة اليومية.";

  const styleDirective =
    style === "concise"
      ? "قدّم إجابات مركّزة ومباشرة ومختصرة دون حشو."
      : style === "simple"
        ? "اشرح بأسلوب مبسّط وواضح وودود يناسب غير المتخصصين مع أمثلة قريبة للواقع."
        : style === "detailed"
          ? "قدّم تحليلاً عميقاً ومفصلاً ومنظماً مع الخطوات والأمثلة العملية وأفضل الممارسات."
          : "وازن بين الوضوح والعمق العملي حسب طبيعة السؤال.";

  const memoryDirective = compressedSummary
    ? `\nملخص السياق السابق للجلسة:\n${compressedSummary}`
    : "";

  return [
    "أنت «نواة» (NawaCore Cloud)، مساعد ذكاء اصطناعي متطور يعمل على البنية السحابية لـ Google Cloud.",
    roleDirective,
    "تتحدث العربية (الفصحى واللهجات العربية مثل المصرية والخليجية والشامية والمغاربية) والإنجليزية بطلاقة تامة وتفهم القصد حتى لو احتوت الرسالة على أخطاء إملائية أو تعبيرات عامية.",
    "التزم بالدقة العلمية والبرمجية والوضوح في تنسيق Markdown (عناوين قصيرة، نقاط منظمة، وأكواد نظيفة داخل ```).",
    "عند استخدام بيانات البحث أو خرائط Google، اعتمد على البيانات المرجعية المرفقة وأجب بدقة ووضوح.",
    `توجيه الأسلوب: ${styleDirective}${memoryDirective}`,
  ].join("\n");
}

function mapThinkingLevelForModel(
  modelName: CloudModelId,
  mode: CloudThinkingMode = "auto"
): ThinkingLevel | undefined {
  if (mode === "auto") return undefined;

  if (modelName === "gemini-3.1-flash-lite") {
    return mode === "fast" ? ThinkingLevel.MINIMAL : ThinkingLevel.HIGH;
  }
  if (modelName === "gemini-4-carbon") {
    // Gemini 4 Carbon supports LOW/MEDIUM/HIGH (never XHIGH or MINIMAL)
    return mode === "fast" ? ThinkingLevel.LOW : ThinkingLevel.HIGH;
  }
  // gemini-4-hydrogen / gemini-4-neon support LOW/MEDIUM/HIGH/XHIGH
  return mode === "fast" ? ThinkingLevel.LOW : ThinkingLevel.XHIGH;
}

function buildContents(history: CloudChatTurn[], currentMessage: string): Content[] {
  const recent = history.slice(-14);
  const contents: Content[] = recent.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));
  contents.push({
    role: "user",
    parts: [{ text: currentMessage }],
  });
  return contents;
}

function extractGroundingSources(resp: GenerateContentResponse | undefined): GroundingSource[] {
  const chunks = resp?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const sources: GroundingSource[] = [];

  for (const ch of chunks) {
    const chunkObj = ch as {
      web?: { uri?: string; title?: string };
      maps?: {
        uri?: string;
        title?: string;
        placeAnswerSources?: {
          reviewSnippets?: Array<{ content?: string; author?: string }>;
        };
      };
    };

    if (chunkObj.maps?.uri && !seen.has(chunkObj.maps.uri)) {
      seen.add(chunkObj.maps.uri);
      const firstReview = chunkObj.maps.placeAnswerSources?.reviewSnippets?.find(
        (r) => typeof r?.content === "string" && r.content.trim().length > 0
      );
      sources.push({
        uri: chunkObj.maps.uri,
        title: (chunkObj.maps.title || "موقع على خرائط Google").trim(),
        kind: "maps",
        snippet: firstReview?.content?.trim().slice(0, 180),
      });
    } else if (chunkObj.web?.uri && !seen.has(chunkObj.web.uri)) {
      seen.add(chunkObj.web.uri);
      sources.push({
        uri: chunkObj.web.uri,
        title: (chunkObj.web.title || chunkObj.web.uri).trim(),
        kind: "web",
      });
    }
  }
  return sources.slice(0, 10);
}

export function normalizeGeminiApiError(err: unknown): { statusCode: number; message: string } {
  const rawMsg = err instanceof Error ? err.message : String(err);
  const statusFromErr =
    typeof (err as { statusCode?: unknown })?.statusCode === "number"
      ? (err as { statusCode: number }).statusCode
      : typeof (err as { status?: unknown })?.status === "number"
        ? (err as { status: number }).status
        : 500;

  if (/API_KEY_INVALID|PERMISSION_DENIED|403|401/.test(rawMsg)) {
    return {
      statusCode: 403,
      message: "تعذر التحقق من مفتاح Gemini API. يرجى مراجعة المفتاح في لوحة Settings > Secrets.",
    };
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(rawMsg)) {
    return {
      statusCode: 429,
      message: "تم تجاوز حد الطلبات المؤقت (Quota / 429). حاول بعد قليل أو راجع خطة الفوترة في Settings > Secrets.",
    };
  }
  if (/NOT_FOUND|404/.test(rawMsg)) {
    return {
      statusCode: 404,
      message: "تعذر الوصول إلى معرف النموذج السحابي المطلوب.",
    };
  }
  if (/AbortError|aborted|ETIMEDOUT|timeout|DEADLINE_EXCEEDED|504/i.test(rawMsg)) {
    return {
      statusCode: 504,
      message: "انتهت مهلة الاستجابة من الخادم السحابي (504). يرجى إعادة المحاولة أو استخدام نموذج صغير (النسخة التجريبية).",
    };
  }
  if (/UNAVAILABLE|high demand|503/i.test(rawMsg) && !/GEMINI_API_KEY/.test(rawMsg)) {
    return {
      statusCode: 503,
      message: "الخدمة السحابية تشهد ضغط طلبات مرتفع حالياً (503). حاول مرة أخرى بعد لحظات أو استخدم نموذج صغير (النسخة التجريبية).",
    };
  }
  if (/GEMINI_API_KEY/.test(rawMsg)) {
    return { statusCode: 503, message: rawMsg };
  }
  return {
    statusCode: statusFromErr >= 400 && statusFromErr < 600 ? statusFromErr : 500,
    message: `حدث خطأ أثناء الاتصال بالنموذج السحابي: ${rawMsg}`,
  };
}

function isQuotaOrTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED|429|quota|UNAVAILABLE|high demand|503/i.test(msg);
}

interface CloudAttemptPlan {
  modelName: CloudModelId;
  grounding: CloudGroundingMode;
}

function normalizeModelId(id?: string): CloudModelId {
  if (
    id === "gemini-4-hydrogen" ||
    id === "gemini-4-neon" ||
    id === "gemini-4-carbon" ||
    id === "gemini-3.1-flash-lite"
  ) {
    return id;
  }
  return "gemini-3.1-flash-lite";
}

function buildAttemptPlans(
  requestedModel: CloudModelId,
  groundingMode: CloudGroundingMode
): CloudAttemptPlan[] {
  const plans: CloudAttemptPlan[] = [];

  if (groundingMode === "maps") {
    // Google Maps Grounding requires gemini-4-hydrogen and CANNOT be combined with googleSearch
    plans.push({ modelName: "gemini-4-hydrogen", grounding: "maps" });
    plans.push({ modelName: "gemini-4-hydrogen", grounding: "none" });
    return plans;
  }

  if (groundingMode === "search") {
    plans.push({ modelName: requestedModel, grounding: "search" });
    plans.push({ modelName: requestedModel, grounding: "none" });
  } else {
    plans.push({ modelName: requestedModel, grounding: "none" });
  }

  if (requestedModel !== "gemini-4-hydrogen") {
    plans.push({ modelName: "gemini-4-hydrogen", grounding: "none" });
  } else {
    plans.push({ modelName: "gemini-3.1-flash-lite", grounding: "none" });
  }
  return plans;
}

function buildRequestConfig(
  plan: CloudAttemptPlan,
  req: CloudGeminiRequest
): Record<string, unknown> {
  const thinkingLevel = mapThinkingLevelForModel(plan.modelName, req.thinkingMode);
  const config: Record<string, unknown> = {
    systemInstruction: buildSystemInstruction(
      req.style,
      req.systemRole,
      req.compressedSummary
    ),
  };

  if (thinkingLevel) {
    config.thinkingConfig = { thinkingLevel };
  }

  if (plan.grounding === "maps") {
    config.tools = [{ googleMaps: {} }];
    if (
      req.userLocation &&
      Number.isFinite(req.userLocation.latitude) &&
      Number.isFinite(req.userLocation.longitude)
    ) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: req.userLocation.latitude,
            longitude: req.userLocation.longitude,
          },
        },
      };
    }
  } else if (plan.grounding === "search") {
    config.tools = [{ googleSearch: {} }];
  }

  return config;
}

export async function generateCloudGeminiReply(
  req: CloudGeminiRequest
): Promise<CloudGeminiResult> {
  const t0 = performance.now();
  const ai = getGeminiClient();
  const requestedModel = normalizeModelId(req.modelId);
  const effectiveGrounding: CloudGroundingMode =
    req.groundingMode || (req.searchGrounding ? "search" : "none");
  const plans = buildAttemptPlans(requestedModel, effectiveGrounding);

  let lastErr: unknown;
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const thinkingLevel = mapThinkingLevelForModel(plan.modelName, req.thinkingMode);
    try {
      const response = await ai.models.generateContent({
        model: plan.modelName,
        contents: buildContents(req.history, req.message),
        config: buildRequestConfig(plan, req),
      });

      const reply = (response.text || "").trim();
      if (!reply) {
        throw new Error("أعاد النموذج السحابي استجابة فارغة.");
      }

      const latencyMs = Math.round(performance.now() - t0);
      const usageTokens =
        response.usageMetadata?.totalTokenCount || Math.ceil(reply.length / 3);

      return {
        reply,
        modelName: plan.modelName,
        thinkingLevelUsed: thinkingLevel ? String(thinkingLevel) : "AUTO",
        groundingSources: extractGroundingSources(response),
        usageTokens,
        latencyMs,
      };
    } catch (err) {
      lastErr = err;
      if (!isQuotaOrTransientError(err) || i === plans.length - 1) {
        throw err;
      }
    }
  }
  throw lastErr;
}

export async function streamCloudGeminiReply(
  req: CloudGeminiRequest,
  onChunk: (chunkText: string) => void
): Promise<CloudGeminiResult> {
  const t0 = performance.now();
  const ai = getGeminiClient();
  const requestedModel = normalizeModelId(req.modelId);
  const effectiveGrounding: CloudGroundingMode =
    req.groundingMode || (req.searchGrounding ? "search" : "none");
  const plans = buildAttemptPlans(requestedModel, effectiveGrounding);

  let lastErr: unknown;
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const thinkingLevel = mapThinkingLevelForModel(plan.modelName, req.thinkingMode);
    let emittedAnyChunk = false;
    try {
      const stream = await ai.models.generateContentStream({
        model: plan.modelName,
        contents: buildContents(req.history, req.message),
        config: buildRequestConfig(plan, req),
      });

      let fullReply = "";
      let lastResp: GenerateContentResponse | undefined;
      let usageTokens = 0;
      const collectedSources: GroundingSource[] = [];
      const seenUris = new Set<string>();

      for await (const chunk of stream) {
        lastResp = chunk;
        const textPart = chunk.text || "";
        if (textPart) {
          emittedAnyChunk = true;
          fullReply += textPart;
          onChunk(textPart);
        }
        for (const src of extractGroundingSources(chunk)) {
          if (!seenUris.has(src.uri)) {
            seenUris.add(src.uri);
            collectedSources.push(src);
          }
        }
        if (chunk.usageMetadata?.totalTokenCount) {
          usageTokens = chunk.usageMetadata.totalTokenCount;
        }
      }

      if (!fullReply.trim() && lastResp?.text) {
        emittedAnyChunk = true;
        fullReply = lastResp.text;
        onChunk(fullReply);
      }

      if (!fullReply.trim()) {
        throw new Error("أعاد البث السحابي استجابة فارغة.");
      }

      return {
        reply: fullReply.trim(),
        modelName: plan.modelName,
        thinkingLevelUsed: thinkingLevel ? String(thinkingLevel) : "AUTO",
        groundingSources: collectedSources.slice(0, 10),
        usageTokens: usageTokens || Math.ceil(fullReply.length / 3),
        latencyMs: Math.round(performance.now() - t0),
      };
    } catch (err) {
      lastErr = err;
      if (emittedAnyChunk || !isQuotaOrTransientError(err) || i === plans.length - 1) {
        throw err;
      }
    }
  }
  throw lastErr;
}
