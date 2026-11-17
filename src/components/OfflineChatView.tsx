import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Cloud,
  Database,
  ExternalLink,
  Globe,
  HardDrive,
  Layers,
  Mic,
  MicOff,
  Monitor,
  ShieldCheck,
  Smartphone,
  Square,
} from "lucide-react";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";
import {
  saveCloudChatMessage,
  subscribeChatMessages,
  upsertCloudChatThread,
} from "../firebase.ts";
import type { DeviceKBProfile } from "../llm/NawaKnowledgeBase.ts";

type ResponseStyle = "auto" | "simple" | "detailed" | "concise";
type EngineMode = "cloud" | "offline";
type ThinkingMode = "fast" | "auto" | "deep";

interface GroundingSource {
  title: string;
  uri: string;
}

interface CompressionStats {
  enabled: boolean;
  activeTurnsInWindow: number;
  compressedTurns: number;
  savedRatioPct: number;
}

interface TokenCandidate {
  tokenId: number;
  token: string;
  prob: number;
}

interface NeuralTelemetry {
  modelName: string;
  totalParams: number;
  vocabSize: number;
  nLayers: number;
  nHeads: number;
  dModel: number;
  trainedEpochs: number;
  perplexity: number;
  generatedTokens: number;
  tokensPerSec: number;
  guardStatus: "verified_neural" | "filtered_regrounded" | "kb_synthesized" | "verified_tool";
  guardReason: string;
  topStepCandidates: Array<{ chosen: string; chosenProb: number; alternatives: TokenCandidate[] }>;
  kvCompression: {
    enabled: boolean;
    activeKvSlots: number;
    compressedKvSlots: number;
    savedRatioPct: number;
  };
}

interface KBMetadata {
  profile: DeviceKBProfile;
  capacityFormatted: string;
  shardCount: number;
  shardId: number;
  slotIndex: string;
  domainAr: string;
  intent: string;
  confidence: number;
}

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: {
    engineMode?: EngineMode;
    modelName?: string;
    thinkingLevelUsed?: string;
    usageTokens?: number;
    latencyMs?: number;
    groundingSources?: GroundingSource[];
    dialect: string;
    topic: string | null;
    questionType?: string;
    attentionScore?: number;
    wasmMs: number;
    neural?: NeuralTelemetry;
    kb?: KBMetadata;
  };
  suggestions?: string[];
  error?: string;
}

interface OfflineChatViewProps {
  chatId: string;
  onTitleUpdate?: (title: string) => void;
}

const DIALECT_VOICES = [
  { code: "ar-EG", label: "مصري" },
  { code: "ar-SA", label: "خليجي" },
  { code: "ar-LB", label: "شامي" },
  { code: "ar-MA", label: "مغربي" },
];

const STARTER_PROMPTS = [
  "اشرحلي الذكاء الاصطناعي والنماذج اللغوية العملاقة بأسلوب واضح",
  "ما هي أحدث تطورات التكنولوجيا والذكاء الاصطناعي مؤخراً؟",
  "التلفون بتاعي بيهنج وبقى تقيل أعمل إيه خطوة بخطوة؟",
  "اكتب لي دالة TypeScript ذكية وتطبيقاً متكاملاً لإدارة المهام",
];

const UI_WINDOW_LIMIT = 10;

export function NawaSparkMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ color: "var(--nawa-accent)" }}
    >
      <path
        d="M12 2.5V21.5M3.77 7.25L20.23 16.75M20.23 7.25L3.77 16.75"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function renderInlineSegments(line: string) {
  const inlineParts = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return inlineParts.map((seg, sIdx) => {
    if (seg.startsWith("`") && seg.endsWith("`")) {
      return (
        <code
          key={sIdx}
          dir="ltr"
          className="mx-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-[0.86em]"
          style={{
            backgroundColor: "var(--nawa-elevated)",
            color: "var(--nawa-accent)",
            border: "1px solid var(--nawa-border)",
          }}
        >
          {seg.slice(1, -1)}
        </code>
      );
    }
    if (seg.startsWith("**") && seg.endsWith("**")) {
      return (
        <strong key={sIdx} className="font-semibold" style={{ color: "var(--nawa-text)" }}>
          {seg.slice(2, -2)}
        </strong>
      );
    }
    if (seg.startsWith("*") && seg.endsWith("*") && seg.length > 2) {
      return (
        <em key={sIdx} style={{ color: "var(--nawa-muted)" }}>
          {seg.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={sIdx}>{seg}</React.Fragment>;
  });
}

function renderFormattedProse(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const inner = part.slice(3, -3);
      const firstNewline = inner.indexOf("\n");
      const lang = firstNewline >= 0 ? inner.slice(0, firstNewline).trim() : "";
      const codeBody = firstNewline >= 0 ? inner.slice(firstNewline + 1) : inner;
      return (
        <div
          key={idx}
          dir="ltr"
          className="my-3 overflow-hidden rounded-xl border"
          style={{
            backgroundColor: "var(--nawa-code-bg)",
            color: "var(--nawa-code-text)",
            borderColor: "var(--nawa-border)",
          }}
        >
          {lang && (
            <div
              className="border-b px-3.5 py-1.5 font-mono text-[11px] opacity-75"
              style={{ borderColor: "rgba(255,255,255,0.1)" }}
            >
              {lang}
            </div>
          )}
          <pre className="overflow-x-auto p-3.5 text-left font-mono text-xs leading-relaxed">
            <code>{codeBody}</code>
          </pre>
        </div>
      );
    }
    const lines = part.split("\n");
    return (
      <span key={idx} className="whitespace-pre-wrap">
        {lines.map((line, lIdx) => {
          if (line.startsWith("### ")) {
            return (
              <span
                key={lIdx}
                className="mb-1.5 mt-2 block font-display text-base font-bold"
                style={{ color: "var(--nawa-text)" }}
              >
                {renderInlineSegments(line.slice(4))}
              </span>
            );
          }
          return (
            <React.Fragment key={lIdx}>
              {renderInlineSegments(line)}
              {lIdx < lines.length - 1 && <br />}
            </React.Fragment>
          );
        })}
      </span>
    );
  });
}

export default function OfflineChatView({ chatId, onTitleUpdate }: OfflineChatViewProps) {
  const { settings, updateSettings, user } = useUiSettings();
  const [engineMode, setEngineMode] = useState<EngineMode>("cloud");
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("auto");
  const [searchGrounding, setSearchGrounding] = useState<boolean>(true);
  const [style, setStyle] = useState<ResponseStyle>("auto");
  const [dialectVoice, setDialectVoice] = useState("ar-EG");
  const [listening, setListening] = useState(false);
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [expandedInspectorId, setExpandedInspectorId] = useState<string | null>(null);
  const [compressedSummary, setCompressedSummary] = useState<string | null>(null);
  const [compressionStats, setCompressionStats] = useState<CompressionStats>({
    enabled: true,
    activeTurnsInWindow: 0,
    compressedTurns: 0,
    savedRatioPct: 0,
  });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef<boolean>(false);

  // Sync messages when switching chatId or loading from Firestore for signed-in users
  useEffect(() => {
    setMessages([]);
    setCompressedSummary(null);
    setExpandedInspectorId(null);

    if (!user) {
      try {
        const localRaw = localStorage.getItem(`nawa_chat_${chatId}`);
        if (localRaw) {
          setMessages(JSON.parse(localRaw));
        }
      } catch {
        // ignore
      }
      return;
    }

    const unsub = subscribeChatMessages(
      user.uid,
      chatId,
      (cloudMsgs) => {
        if (isStreamingRef.current) return;
        setMessages((prev) => {
          if (cloudMsgs.length === 0 && prev.length > 0) return prev;
          const cloudIds = new Set(cloudMsgs.map((c) => c.id));
          const pendingLocal = prev.filter(
            (p) => !cloudIds.has(p.id) && (p.content.trim().length > 0 || Boolean(p.meta))
          );
          const merged = cloudMsgs.map((cm) => {
            const existing = prev.find((p) => p.id === cm.id);
            return {
              id: cm.id,
              role: cm.role,
              content: cm.content,
              meta: existing?.meta,
              suggestions: existing?.suggestions,
            };
          });
          return [...merged, ...pendingLocal];
        });
      },
      () => null
    );
    return () => unsub();
  }, [chatId, user?.uid]);

  useEffect(() => {
    if (!user && messages.length > 0) {
      try {
        localStorage.setItem(`nawa_chat_${chatId}`, JSON.stringify(messages.slice(-24)));
      } catch {
        // ignore
      }
    }
  }, [messages, chatId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: compressionEnabled ? "auto" : "smooth" });
  }, [messages.length, sending, compressionEnabled]);

  const hiddenCount =
    compressionEnabled && !showAllHistory && messages.length > UI_WINDOW_LIMIT
      ? messages.length - UI_WINDOW_LIMIT
      : 0;

  const visibleMessages = useMemo(() => {
    if (hiddenCount > 0) return messages.slice(-UI_WINDOW_LIMIT);
    return messages;
  }, [messages, hiddenCount]);

  const toggleCompression = async () => {
    const next = !compressionEnabled;
    setCompressionEnabled(next);
    if (next) setShowAllHistory(false);
    try {
      const res = await fetch("/api/llm/compress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: chatId, compressionEnabled: next }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.compressionStats) setCompressionStats(data.compressionStats);
        if (data.compressedSummary !== undefined) setCompressedSummary(data.compressedSummary);
      }
    } catch {
      // keep toggle state
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    if (!overrideText) setInput("");

    const userMsgId = "u_" + Date.now();
    const assistantMsgId = "a_" + (Date.now() + 1);
    const isFirstTurn = messages.length === 0;

    isStreamingRef.current = true;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: text },
      { id: assistantMsgId, role: "assistant", content: "" },
    ]);
    setSending(true);

    if (isFirstTurn) {
      onTitleUpdate?.(text.slice(0, 60));
    }

    if (user) {
      void upsertCloudChatThread(
        user.uid,
        chatId,
        text.slice(0, 80),
        settings.deviceProfile
      )
        .then(() =>
          saveCloudChatMessage(
            user.uid,
            chatId,
            userMsgId,
            "user",
            text,
            undefined,
            settings.deviceProfile
          )
        )
        .catch(() => null);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let finalAssistantText = "";
    let finalDialect = "";
    let finalTopic: string | null = null;

    const clientHistorySnapshot = messages
      .filter((m) => m.content.trim().length > 0 && !m.error)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    const handleSsePayload = (payloadStr: string) => {
      if (!payloadStr) return;
      const evt = JSON.parse(payloadStr);
      if (evt.type === "meta") {
        finalDialect = evt.dialect || "";
        finalTopic = evt.topic || null;
        if (evt.compressionStats) setCompressionStats(evt.compressionStats);
        if (evt.compressedSummary !== undefined) setCompressedSummary(evt.compressedSummary);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  meta: {
                    engineMode: evt.engineMode || engineMode,
                    modelName: evt.modelName,
                    dialect: evt.dialect || "",
                    topic: evt.topic || null,
                    questionType: evt.analysis?.questionType,
                    attentionScore: evt.attentionMatch?.score,
                    wasmMs: evt.wasmInferenceMs || 0,
                    neural: evt.neuralTelemetry,
                    kb: evt.kbMetadata,
                  },
                }
              : m
          )
        );
      } else if (evt.type === "token") {
        finalAssistantText += evt.chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: m.content + evt.chunk } : m
          )
        );
      } else if (evt.type === "done") {
        if (evt.compressionStats) setCompressionStats(evt.compressionStats);
        if (evt.compressedSummary !== undefined) setCompressedSummary(evt.compressedSummary);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  suggestions: evt.suggestions,
                  meta: {
                    ...(m.meta || { dialect: finalDialect, topic: finalTopic, wasmMs: 0 }),
                    engineMode: evt.engineMode || m.meta?.engineMode || engineMode,
                    modelName: evt.modelName || m.meta?.modelName,
                    thinkingLevelUsed: evt.thinkingLevelUsed,
                    groundingSources: evt.groundingSources,
                    usageTokens: evt.usageTokens,
                    latencyMs: evt.latencyMs,
                  },
                }
              : m
          )
        );
      } else if (evt.type === "error") {
        throw new Error(evt.detail || "خطأ أثناء البث");
      }
    };

    try {
      const res = await fetch("/api/llm/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: chatId,
          engineMode,
          thinkingMode,
          searchGrounding,
          style,
          temperature: 0.16,
          topK: 6,
          compressionEnabled,
          deviceProfile: settings.deviceProfile,
          clientHistory: clientHistorySnapshot,
        }),
        signal: controller.signal,
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIndex = buffer.indexOf("\n\n");
          while (sepIndex !== -1) {
            const rawEvent = buffer.slice(0, sepIndex).trim();
            buffer = buffer.slice(sepIndex + 2);
            if (rawEvent.startsWith("data:")) {
              handleSsePayload(rawEvent.slice(5).trim());
            }
            sepIndex = buffer.indexOf("\n\n");
          }
        }

        const tail = buffer.trim();
        if (tail.startsWith("data:")) {
          handleSsePayload(tail.slice(5).trim());
        }
      }

      // Guaranteed JSON fallback if stream ended without tokens
      if (!finalAssistantText.trim()) {
        const jsonRes = await fetch("/api/llm/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            session_id: chatId,
            engineMode,
            thinkingMode,
            searchGrounding,
            style,
            temperature: 0.16,
            topK: 6,
            compressionEnabled,
            deviceProfile: settings.deviceProfile,
            clientHistory: clientHistorySnapshot,
          }),
          signal: controller.signal,
        });
        if (!jsonRes.ok) {
          const errBody = await jsonRes.json().catch(() => ({}));
          throw new Error(errBody.detail || "تعذر الاتصال بمحرك التوليد");
        }
        const data = await jsonRes.json();
        finalAssistantText = data.reply || "";
        finalDialect = data.dialect || "";
        finalTopic = data.topic || null;
        if (data.compressionStats) setCompressionStats(data.compressionStats);
        if (data.compressedSummary !== undefined) setCompressedSummary(data.compressedSummary);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: finalAssistantText,
                  suggestions: data.suggestions,
                  meta: {
                    engineMode: data.engineMode || engineMode,
                    modelName: data.modelName,
                    thinkingLevelUsed: data.thinkingLevelUsed,
                    groundingSources: data.groundingSources,
                    usageTokens: data.usageTokens,
                    latencyMs: data.latencyMs,
                    dialect: data.dialect || "",
                    topic: data.topic || null,
                    questionType: data.analysis?.questionType,
                    attentionScore: data.attentionMatch?.score,
                    wasmMs: data.wasmInferenceMs || 0,
                    neural: data.neuralTelemetry,
                    kb: data.kbMetadata,
                  },
                }
              : m
          )
        );
      }

      if (user && finalAssistantText.trim()) {
        void upsertCloudChatThread(
          user.uid,
          chatId,
          text.slice(0, 80),
          settings.deviceProfile,
          finalTopic
        )
          .then(() =>
            saveCloudChatMessage(
              user.uid,
              chatId,
              assistantMsgId,
              "assistant",
              finalAssistantText,
              finalDialect,
              settings.deviceProfile
            )
          )
          .catch(() => null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId && !m.content
              ? { ...m, content: "تم إيقاف التوليد." }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  error: err instanceof Error ? err.message : "خطأ غير متوقع",
                }
              : m
          )
        );
      }
    } finally {
      isStreamingRef.current = false;
      abortRef.current = null;
      setSending(false);
    }
  };

  const toggleVoice = () => {
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onend: () => void;
        onerror: () => void;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onend: () => void;
        onerror: () => void;
        start: () => void;
      };
    };
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = dialectVoice;
    rec.interimResults = false;
    setListening(true);
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript || "";
      setInput((prev) => (prev ? prev + " " + t : t));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
  };

  const isDesktopKB = settings.deviceProfile === "desktop-50b";
  const firstName = user?.displayName?.split(" ")[0];
  const densitySpacing = settings.density === "compact" ? "gap-4 py-4" : "gap-7 py-7";

  const renderComposer = (centeredHero: boolean) => (
    <div
      className={`w-full rounded-2xl border transition-shadow ${
        centeredHero ? "max-w-2xl shadow-sm" : "mx-auto max-w-3xl shadow-sm"
      }`}
      style={{
        backgroundColor: "var(--nawa-surface)",
        borderColor: "var(--nawa-border)",
      }}
    >
      <div className="px-4 pt-3.5 pb-2">
        <textarea
          rows={centeredHero ? 2 : 1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={
            engineMode === "cloud"
              ? "اسأل نواة السحابي (Gemini 4 Hydrogen + بحث Google) عن أي شيء في بالك..."
              : isDesktopKB
                ? "كيف يمكنني مساعدتك محلياً؟ (قاعدة الكمبيوتر: 50 مليار)"
                : "كيف يمكنني مساعدتك محلياً؟ (قاعدة الهاتف: 50 مليون)"
          }
          className="max-h-40 min-h-[44px] w-full resize-none bg-transparent text-[15px] leading-relaxed focus:outline-none"
          style={{ color: "var(--nawa-text)" }}
        />
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2"
        style={{ borderColor: "var(--nawa-border)" }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Cloud vs Offline Engine Toggle */}
          <button
            type="button"
            onClick={() => setEngineMode((m) => (m === "cloud" ? "offline" : "cloud"))}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            style={{
              backgroundColor: engineMode === "cloud" ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
              borderColor: engineMode === "cloud" ? "var(--nawa-accent)" : "var(--nawa-border)",
              color: engineMode === "cloud" ? "var(--nawa-accent)" : "var(--nawa-text)",
            }}
            title="التبديل بين النموذج السحابي الضخم (بالإنترنت) والوضع المحلي"
          >
            {engineMode === "cloud" ? (
              <Cloud className="h-3.5 w-3.5" />
            ) : (
              <HardDrive className="h-3.5 w-3.5" />
            )}
            <span>{engineMode === "cloud" ? "سحابي ضخم (إنترنت)" : "محلي (أوفلاين)"}</span>
          </button>

          {engineMode === "cloud" ? (
            <>
              <select
                aria-label="مستوى التفكير"
                value={thinkingMode}
                onChange={(e) => setThinkingMode(e.target.value as ThinkingMode)}
                className="h-8 rounded-lg border px-2 text-xs focus:outline-none whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
              >
                <option value="auto">تفكير: متوازن</option>
                <option value="deep">تفكير عميق جداً (XHigh)</option>
                <option value="fast">سريع</option>
              </select>

              <button
                type="button"
                onClick={() => setSearchGrounding((v) => !v)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: searchGrounding ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                  borderColor: searchGrounding ? "var(--nawa-accent)" : "var(--nawa-border)",
                  color: searchGrounding ? "var(--nawa-accent)" : "var(--nawa-muted)",
                }}
              >
                <Globe className="h-3.5 w-3.5" />
                <span>بحث Google</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() =>
                updateSettings({
                  deviceProfile: isDesktopKB ? "mobile-50m" : "desktop-50b",
                })
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-text)",
              }}
              title="التبديل بين قاعدة الكمبيوتر (50 مليار سؤال) وقاعدة الهاتف (50 مليون سؤال)"
            >
              {isDesktopKB ? (
                <Monitor className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
              ) : (
                <Smartphone className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
              )}
              <span className="tabular-nums">
                {isDesktopKB ? "كمبيوتر · 50B سؤال" : "هاتف · 50M سؤال"}
              </span>
            </button>
          )}

          {/* Response Style Selector */}
          <select
            aria-label="أسلوب الرد"
            value={style}
            onChange={(e) => setStyle(e.target.value as ResponseStyle)}
            className="h-8 rounded-lg border px-2 text-xs focus:outline-none whitespace-nowrap shrink-0"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
              color: "var(--nawa-text)",
            }}
          >
            <option value="auto">أسلوب الرد: تلقائي</option>
            <option value="simple">مبسّط</option>
            <option value="detailed">مفصّل</option>
            <option value="concise">مختصر</option>
          </select>

          {/* Activity Compression Toggle */}
          <button
            type="button"
            onClick={toggleCompression}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            style={{
              backgroundColor: compressionEnabled ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
              borderColor: compressionEnabled ? "var(--nawa-accent)" : "var(--nawa-border)",
              color: compressionEnabled ? "var(--nawa-accent)" : "var(--nawa-muted)",
            }}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>ضغط النشاط</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            aria-label="لهجة الصوت"
            value={dialectVoice}
            onChange={(e) => setDialectVoice(e.target.value)}
            className="hidden h-8 rounded-lg border px-2 text-xs sm:inline-block focus:outline-none"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
              color: "var(--nawa-muted)",
            }}
          >
            {DIALECT_VOICES.map((d) => (
              <option key={d.code} value={d.code}>
                {d.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={toggleVoice}
            aria-label="إدخال صوتي"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
            style={{
              borderColor: listening ? "#DC2626" : "var(--nawa-border)",
              backgroundColor: listening ? "rgba(220,38,38,0.12)" : "transparent",
              color: listening ? "#DC2626" : "var(--nawa-muted)",
            }}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          {sending ? (
            <button
              type="button"
              onClick={stopGeneration}
              aria-label="إيقاف التوليد"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white transition-opacity"
              style={{ backgroundColor: "#DC2626" }}
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!input.trim()}
              onClick={() => sendMessage()}
              aria-label="إرسال"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Claude-inspired Centered Hero State when conversation is empty
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-2xl flex-col items-center text-center">
          <div className="mb-4 flex items-center gap-3">
            <NawaSparkMark size={30} />
            <h1
              className="font-display text-2xl font-bold sm:text-3xl"
              style={{ color: "var(--nawa-text)", textWrap: "balance" }}
            >
              {firstName ? `مرحباً ${firstName}، بمَ نفكّر اليوم؟` : "مساء الإبداع، بمَ نفكّر اليوم؟"}
            </h1>
          </div>

          <p className="mb-6 text-sm" style={{ color: "var(--nawa-muted)" }}>
            {engineMode === "cloud" ? (
              <>
                مدعوم بنموذج <span className="font-semibold">Gemini 3.1 Flash Lite</span> السحابي السريع وبحث Google الحي{" "}
                <span aria-hidden="true">·</span>{" "}
                <span>مستضاف على Google Cloud &amp; Firebase</span>
              </>
            ) : (
              <>
                نموذج <span className="font-semibold">NawaLM</span> المحلي الاحتياطي{" "}
                <span aria-hidden="true">·</span>{" "}
                <span className="tabular-nums">
                  {isDesktopKB ? "50,000,000,000 سؤال (كمبيوتر)" : "50,000,000 سؤال (هاتف)"}
                </span>
              </>
            )}
          </p>

          {renderComposer(true)}

          <div className="mt-5 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendMessage(prompt)}
                className="rounded-xl border px-3.5 py-2.5 text-right text-xs font-medium transition-colors hover:opacity-90"
                style={{
                  backgroundColor: "var(--nawa-surface)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable Claude Editorial Conversation Canvas */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
        <div className={`mx-auto flex max-w-3xl flex-col pb-8 ${densitySpacing}`}>
          {hiddenCount > 0 && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-xs"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-muted)",
              }}
            >
              <div>
                <span>
                  تم ضغط {hiddenCount} رسائل قديمة من العرض ({compressionStats.savedRatioPct}% توفير).
                </span>
                {compressedSummary && (
                  <div className="mt-0.5 text-[11px] opacity-85">{compressedSummary}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAllHistory(true)}
                className="rounded-lg border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: "var(--nawa-surface)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-accent)",
                }}
              >
                عرض السجل الكامل
              </button>
            </div>
          )}

          {compressionEnabled && showAllHistory && messages.length > UI_WINDOW_LIMIT && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllHistory(false)}
                className="rounded-lg border px-3 py-1 text-xs"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-muted)",
                }}
              >
                طي الرسائل القديمة
              </button>
            </div>
          )}

          {visibleMessages.map((msg, idx) => {
            const neural = msg.meta?.neural;
            const kb = msg.meta?.kb;
            const isExpanded = expandedInspectorId === msg.id;

            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-start">
                  <div
                    className="max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed"
                    style={{
                      backgroundColor: "var(--nawa-user-bubble)",
                      color: "var(--nawa-text)",
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex items-start gap-3.5">
                <div className="mt-1 shrink-0">
                  <NawaSparkMark size={20} />
                </div>

                <div className="min-w-0 flex-1 space-y-2.5">
                  {msg.error ? (
                    <div className="text-sm text-red-500">{msg.error}</div>
                  ) : msg.content ? (
                    <div
                      className="font-display text-[15.5px] leading-[1.75]"
                      style={{ color: "var(--nawa-text)" }}
                    >
                      {renderFormattedProse(msg.content)}
                    </div>
                  ) : (
                    <div className="text-sm" style={{ color: "var(--nawa-muted)" }}>
                      جاري التفكير وبناء الرد المنضبط...
                    </div>
                  )}

                  {/* Subtle unboxed Claude-style metadata & Google Search Grounding Sources */}
                  {msg.meta && (
                    <div className="space-y-2 pt-1">
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 text-xs"
                        style={{ color: "var(--nawa-muted)" }}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {msg.meta.engineMode === "cloud" ? (
                            <>
                              <span className="inline-flex items-center gap-1">
                                <Cloud className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
                                <span>{msg.meta.modelName || "gemini-3.1-flash-lite"}</span>
                              </span>
                              {msg.meta.latencyMs ? (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums" dir="ltr">
                                    {(msg.meta.latencyMs / 1000).toFixed(2)}s
                                    {msg.meta.usageTokens ? ` · ${msg.meta.usageTokens} tok` : ""}
                                  </span>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <>
                              {neural && (
                                <span className="inline-flex items-center gap-1">
                                  <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
                                  <span>
                                    {neural.guardStatus === "filtered_regrounded"
                                      ? "تم حجب السياق الغريب"
                                      : "سياق متماسك"}
                                  </span>
                                </span>
                              )}
                              {kb && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-1 tabular-nums">
                                    <Database className="h-3 w-3" />
                                    <span>
                                      {kb.profile === "desktop-50b" ? "كمبيوتر 50B" : "هاتف 50M"} · شريحة #{kb.shardId}
                                    </span>
                                  </span>
                                </>
                              )}
                              {neural && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums" dir="ltr">
                                    {neural.tokensPerSec} tok/s · PPL {neural.perplexity}
                                  </span>
                                </>
                              )}
                            </>
                          )}
                        </div>

                        {neural && (
                          <button
                            type="button"
                            onClick={() => setExpandedInspectorId(isExpanded ? null : msg.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline whitespace-nowrap shrink-0"
                            style={{ color: "var(--nawa-accent)" }}
                          >
                            <span>تفاصيل السياق والتوكن</span>
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        )}
                      </div>

                      {msg.meta.groundingSources && msg.meta.groundingSources.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[11px] font-semibold" style={{ color: "var(--nawa-muted)" }}>
                            مصادر Google Search:
                          </span>
                          {msg.meta.groundingSources.map((src) => (
                            <a
                              key={src.uri}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex max-w-[220px] items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] transition-colors hover:opacity-85"
                              style={{
                                backgroundColor: "var(--nawa-elevated)",
                                borderColor: "var(--nawa-border)",
                                color: "var(--nawa-text)",
                              }}
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" style={{ color: "var(--nawa-accent)" }} />
                              <span className="truncate">{src.title}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {isExpanded && neural && (
                    <div
                      className="rounded-xl border p-3.5 text-xs space-y-2"
                      style={{
                        backgroundColor: "var(--nawa-elevated)",
                        borderColor: "var(--nawa-border)",
                        color: "var(--nawa-text)",
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">حارس التماسك: {neural.guardReason}</span>
                        {kb && (
                          <span className="font-mono tabular-nums text-[11px]" style={{ color: "var(--nawa-muted)" }} dir="ltr">
                            Slot #{kb.slotIndex} / {kb.capacityFormatted}
                          </span>
                        )}
                      </div>
                      {neural.topStepCandidates.length > 0 && (
                        <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
                          {neural.topStepCandidates.slice(0, 4).map((step, sIdx) => (
                            <div
                              key={sIdx}
                              className="flex items-center justify-between rounded-lg border px-2.5 py-1.5"
                              style={{
                                backgroundColor: "var(--nawa-surface)",
                                borderColor: "var(--nawa-border)",
                              }}
                            >
                              <span className="font-mono">
                                #{sIdx + 1}: «{step.chosen}»
                              </span>
                              <span
                                className="font-mono tabular-nums font-semibold"
                                style={{ color: "var(--nawa-accent)" }}
                                dir="ltr"
                              >
                                {step.chosenProb}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {idx === visibleMessages.length - 1 &&
                    !sending &&
                    msg.suggestions &&
                    msg.suggestions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {msg.suggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => sendMessage(s)}
                            className="rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors"
                            style={{
                              backgroundColor: "var(--nawa-surface)",
                              borderColor: "var(--nawa-border)",
                              color: "var(--nawa-text)",
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom Docked Claude Composer */}
      <div className="px-4 pb-4 pt-2 sm:px-6">
        {renderComposer(false)}
      </div>
    </div>
  );
}
