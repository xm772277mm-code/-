import { GoogleGenAI, ThinkingLevel, type Content, type GenerateContentResponse } from "@google/genai";

export type CloudThinkingMode = "fast" | "auto" | "deep";
export type CloudResponseStyle = "auto" | "simple" | "detailed" | "concise";

export interface GroundingSource {
  title: string;
  uri: string;
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
  searchGrounding?: boolean;
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
        timeout: 45000,
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
  compressedSummary?: string | null
): string {
  const styleDirective =
    style === "concise"
      ? "قدّم إجابات مركّزة ومباشرة ومختصرة دون حشو."
      : style === "simple"
        ? "اشرح بأسلوب مبسّط وواضح وودود يناسب غير المتخصصين مع أمثلة قريبة للواقع."
        : style === "detailed"
          ? "قدّم تحليلاً عميقاً ومفصلاً ومنظماً مع الخطوات والأمثلة العملية وأفضل الممارسات."
          : "وازن بين الوضوح والعمق العملي حسب طبيعة السؤال.";

  const memoryDirective = compressedSummary
    ? `\nملخص السياق المضغوط للجلسة السابقة:\n${compressedSummary}`
    : "";

  return [
    "أنت «نواة» (NawaCore Cloud)، مساعد ذكاء اصطناعي سحابي متطور واسع المعرفة يعمل على البنية السحابية لـ Google Cloud و Firebase.",
    "تتحدث العربية (الفصحى واللهجات العربية مثل المصرية والخليجية والشامية والمغاربية) والإنجليزية بطلاقة تامة وتفهم القصد حتى لو احتوت الرسالة على أخطاء إملائية أو تعبيرات عامية أو صياغة غير مكتملة.",
    "التزم بالدقة العلمية والبرمجية والوضوح في تنسيق Markdown (عناوين قصيرة، نقاط منظمة، وأكواد نظيفة داخل ```).",
    "لا تخترع معلومات إذا لم تكن متأكداً، وإذا استندت إلى بحث Google فاذكر المعلومات بوضوح ومباشرة.",
    `توجيه الأسلوب: ${styleDirective}${memoryDirective}`,
  ].join("\n");
}

function mapThinkingLevel(mode: CloudThinkingMode = "auto"): ThinkingLevel | undefined {
  if (mode === "fast") return ThinkingLevel.LOW;
  if (mode === "deep") return ThinkingLevel.XHIGH;
  return undefined;
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
    const web = (ch as { web?: { uri?: string; title?: string } })?.web;
    if (web?.uri && !seen.has(web.uri)) {
      seen.add(web.uri);
      sources.push({
        uri: web.uri,
        title: (web.title || web.uri).trim(),
      });
    }
  }
  return sources.slice(0, 8);
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
      message: "انتهت مهلة الاستجابة من خادم النموذج السحابي (504 DEADLINE_EXCEEDED). يرجى إعادة المحاولة أو التبديل مؤقتاً إلى الوضع المحلي.",
    };
  }
  if (/UNAVAILABLE|high demand|503/i.test(rawMsg) && !/GEMINI_API_KEY/.test(rawMsg)) {
    return {
      statusCode: 503,
      message: "النموذج السحابي (Gemini 4 Hydrogen) يشهد ضغط طلبات مرتفع حالياً (503 UNAVAILABLE). حاول مرة أخرى بعد لحظات أو بدّل مؤقتاً إلى الوضع المحلي.",
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

export async function generateCloudGeminiReply(
  req: CloudGeminiRequest
): Promise<CloudGeminiResult> {
  const t0 = performance.now();
  const ai = getGeminiClient();
  const modelName = "gemini-3.1-flash-lite";
  const thinkingLevel = mapThinkingLevel(req.thinkingMode);

  const response = await ai.models.generateContent({
    model: modelName,
    contents: buildContents(req.history, req.message),
    config: {
      systemInstruction: buildSystemInstruction(req.style, req.compressedSummary),
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      ...(req.searchGrounding !== false ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });

  const reply = (response.text || "").trim();
  if (!reply) {
    throw new Error("أعاد النموذج السحابي استجابة فارغة.");
  }

  const latencyMs = Math.round(performance.now() - t0);
  const usageTokens = response.usageMetadata?.totalTokenCount || Math.ceil(reply.length / 3);

  return {
    reply,
    modelName,
    thinkingLevelUsed: thinkingLevel ? String(thinkingLevel) : "AUTO",
    groundingSources: extractGroundingSources(response),
    usageTokens,
    latencyMs,
  };
}

export async function streamCloudGeminiReply(
  req: CloudGeminiRequest,
  onChunk: (chunkText: string) => void
): Promise<CloudGeminiResult> {
  const t0 = performance.now();
  const ai = getGeminiClient();
  const modelName = "gemini-3.1-flash-lite";
  const thinkingLevel = mapThinkingLevel(req.thinkingMode);

  const stream = await ai.models.generateContentStream({
    model: modelName,
    contents: buildContents(req.history, req.message),
    config: {
      systemInstruction: buildSystemInstruction(req.style, req.compressedSummary),
      ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      ...(req.searchGrounding !== false ? { tools: [{ googleSearch: {} }] } : {}),
    },
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
    fullReply = lastResp.text;
    onChunk(fullReply);
  }

  if (!fullReply.trim()) {
    throw new Error("أعاد البث السحابي استجابة فارغة.");
  }

  return {
    reply: fullReply.trim(),
    modelName,
    thinkingLevelUsed: thinkingLevel ? String(thinkingLevel) : "AUTO",
    groundingSources: collectedSources.slice(0, 8),
    usageTokens: usageTokens || Math.ceil(fullReply.length / 3),
    latencyMs: Math.round(performance.now() - t0),
  };
}
