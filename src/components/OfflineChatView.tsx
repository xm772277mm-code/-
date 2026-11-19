import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Cloud,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  LogIn,
  MapPin,
  Mic,
  MicOff,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";
import {
  getGoogleAuthHeaders,
  recordCloudUsageInFirestore,
  saveCloudChatMessage,
  subscribeChatMessages,
  upsertCloudChatThread,
} from "../firebase.ts";
import type { DeviceKBProfile } from "../llm/NawaKnowledgeBase.ts";

type ResponseStyle = "auto" | "simple" | "detailed" | "concise";
type EngineMode = "cloud" | "offline";
type ThinkingMode = "fast" | "auto" | "deep";
type CloudModelId =
  | "gemini-3.1-flash-lite"
  | "gemini-4-hydrogen"
  | "gemini-4-neon"
  | "gemini-4-carbon";
type CloudSystemRole = "assistant" | "coder" | "tutor" | "analyst";
type CloudGroundingMode = "none" | "search" | "maps";

interface GroundingSource {
  title: string;
  uri: string;
  kind?: "web" | "maps";
  snippet?: string;
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

const CLOUD_STARTER_PROMPTS = [
  "اشرحلي الذكاء الاصطناعي والنماذج اللغوية العملاقة بأسلوب واضح",
  "ما هي أحدث تطورات التكنولوجيا والذكاء الاصطناعي مؤخراً؟",
  "التلفون بتاعي بيهنج وبقى تقيل أعمل إيه خطوة بخطوة؟",
  "اكتب لي دالة TypeScript ذكية وتطبيقاً متكاملاً لإدارة المهام",
];

const OFFLINE_STARTER_PROMPTS = [
  "اكتب دالة TypeScript ذكية لإدارة المهام",
  "احسب (250 * 4) + 15% من 2000",
  "اشرح قاعدة 50/30/20 للادخار وتنظيم الراتب",
  "ما هي تقنية RAG في الذكاء الاصطناعي؟",
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

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors in restricted iframes
    }
  };

  return (
    <div
      dir="ltr"
      className="my-3 overflow-hidden rounded-xl border"
      style={{
        backgroundColor: "var(--nawa-code-bg)",
        color: "var(--nawa-code-text)",
        borderColor: "var(--nawa-border)",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-3.5 py-1.5 font-mono text-[11px]"
        style={{ borderColor: "rgba(255,255,255,0.12)" }}
      >
        <span className="uppercase tracking-wider opacity-75">{lang || "code"}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex min-h-[28px] items-center gap-1 rounded px-2 py-0.5 text-[11px] font-sans transition-opacity hover:opacity-100 opacity-85 whitespace-nowrap shrink-0"
          style={{ color: "var(--nawa-code-text)" }}
          aria-label="نسخ الكود"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? "تم النسخ" : "نسخ الكود"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-left font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function CopyReplyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };
  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 hover:underline"
      style={{ color: copied ? "var(--nawa-accent)" : "var(--nawa-muted)" }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? "تم النسخ" : "نسخ"}</span>
    </button>
  );
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(trimmed);
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderMarkdownBlocks(segment: string, keyPrefix: string) {
  const lines = segment.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Table detection
    if (trimmed.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableCells(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|") && !isTableSeparator(lines[i])) {
        rows.push(parseTableCells(lines[i]));
        i++;
      }
      blocks.push(
        <div key={`${keyPrefix}_tbl_${i}`} className="nawa-table-wrap">
          <table className="nawa-table">
            <thead>
              <tr>
                {headers.map((h, hIdx) => (
                  <th key={hIdx}>{renderInlineSegments(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rIdx) => (
                <tr key={rIdx}>
                  {headers.map((_, cIdx) => (
                    <td key={cIdx}>{renderInlineSegments(r[cIdx] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    if (/^#{1,3}\s+/.test(trimmed)) {
      const level = trimmed.match(/^#{1,3}/)?.[0].length ?? 3;
      const titleText = trimmed.replace(/^#{1,3}\s+/, "");
      const cls =
        level === 1
          ? "mt-3 mb-1.5 font-display text-lg font-bold"
          : level === 2
            ? "mt-3 mb-1.5 font-display text-base font-bold"
            : "mt-2.5 mb-1 font-display text-[15px] font-bold";
      blocks.push(
        <div key={`${keyPrefix}_h_${i}`} className={cls} style={{ color: "var(--nawa-text)" }}>
          {renderInlineSegments(titleText)}
        </div>
      );
      i++;
      continue;
    }

    // Blockquote (clean surface fill + hairline border, zero border-l-4)
    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push(
        <blockquote
          key={`${keyPrefix}_q_${i}`}
          className="my-2.5 rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed"
          style={{
            backgroundColor: "var(--nawa-elevated)",
            borderColor: "var(--nawa-border)",
            color: "var(--nawa-muted)",
          }}
        >
          {quoteLines.map((ql, qIdx) => (
            <div key={qIdx}>{renderInlineSegments(ql)}</div>
          ))}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`${keyPrefix}_ul_${i}`} className="my-2 list-disc space-y-1 ps-5">
          {items.map((item, itIdx) => (
            <li key={itIdx}>{renderInlineSegments(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`${keyPrefix}_ol_${i}`} className="my-2 list-decimal space-y-1 ps-5 tabular-nums">
          {items.map((item, itIdx) => (
            <li key={itIdx}>{renderInlineSegments(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph (collect consecutive plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,3}\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("> ") &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !(lines[i].trim().includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`${keyPrefix}_p_${i}`} className="my-1.5 whitespace-pre-wrap leading-[1.75]">
        {paraLines.map((pl, pIdx) => (
          <React.Fragment key={pIdx}>
            {renderInlineSegments(pl)}
            {pIdx < paraLines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
    );
  }

  return blocks;
}

function renderFormattedProse(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const inner = part.slice(3, -3);
      const firstNewline = inner.indexOf("\n");
      const lang = firstNewline >= 0 ? inner.slice(0, firstNewline).trim() : "";
      const codeBody = firstNewline >= 0 ? inner.slice(firstNewline + 1) : inner;
      return <CodeBlock key={idx} lang={lang} code={codeBody} />;
    }
    return <React.Fragment key={idx}>{renderMarkdownBlocks(part, `seg_${idx}`)}</React.Fragment>;
  });
}

export default function OfflineChatView({ chatId, onTitleUpdate }: OfflineChatViewProps) {
  const { settings, user, signingIn, signInWithGoogle, refreshDailyQuota } = useUiSettings();
  const [engineMode, setEngineMode] = useState<EngineMode>("cloud");
  const [cloudModelId, setCloudModelId] = useState<CloudModelId>("gemini-3.1-flash-lite");
  const [systemRole, setSystemRole] = useState<CloudSystemRole>("assistant");
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("auto");
  const [groundingMode, setGroundingMode] = useState<CloudGroundingMode>("none");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [style, setStyle] = useState<ResponseStyle>("auto");
  const [dialectVoice, setDialectVoice] = useState("ar-EG");
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [compressionEnabled] = useState(true);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [compressedSummary, setCompressedSummary] = useState<string | null>(null);
  const [, setCompressionStats] = useState<CompressionStats>({
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Sync messages when switching chatId or loading from Firestore for signed-in users
  useEffect(() => {
    setMessages([]);
    setCompressedSummary(null);

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

  const stopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
  };

  const sendMessage = async (overrideText?: string, overrideEngineMode?: EngineMode) => {
    const text = (overrideText ?? input).trim();
    const targetEngine = overrideEngineMode ?? engineMode;
    if (!text || sending) return;
    if (targetEngine === "cloud" && !user) {
      await signInWithGoogle();
      return;
    }
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

    let cloudUsageRecorded = false;

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
        if (evt.engineMode === "cloud" && user && !cloudUsageRecorded) {
          cloudUsageRecorded = true;
          void recordCloudUsageInFirestore(
            user,
            Number(evt.usageTokens || 0),
            String(evt.modelName || "gemini-3.1-flash-lite")
          );
          void refreshDailyQuota();
        }
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
      const requestHeaders =
        targetEngine === "cloud"
          ? await getGoogleAuthHeaders()
          : { "Content-Type": "application/json" };

      const res = await fetch("/api/llm/stream", {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({
          message: text,
          session_id: chatId,
          engineMode: targetEngine,
          modelId: cloudModelId,
          systemRole,
          thinkingMode,
          groundingMode,
          searchGrounding: groundingMode === "search",
          userLocation: groundingMode === "maps" ? userLocation : null,
          style,
          temperature: 0.16,
          topK: 6,
          compressionEnabled,
          deviceProfile: settings.deviceProfile,
          clientHistory: clientHistorySnapshot,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `تعذر الاتصال بالخادم (HTTP ${res.status})`);
      }

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
          headers: requestHeaders,
          body: JSON.stringify({
            message: text,
            session_id: chatId,
            engineMode: targetEngine,
            modelId: cloudModelId,
            systemRole,
            thinkingMode,
            groundingMode,
            searchGrounding: groundingMode === "search",
            userLocation: groundingMode === "maps" ? userLocation : null,
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
        if (data.engineMode === "cloud" && user && !cloudUsageRecorded) {
          cloudUsageRecorded = true;
          void recordCloudUsageInFirestore(
            user,
            Number(data.usageTokens || 0),
            String(data.modelName || "gemini-3.1-flash-lite")
          );
          void refreshDailyQuota();
        }
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
                    engineMode: data.engineMode || targetEngine,
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
        const rawErr = err instanceof Error ? err.message : "خطأ غير متوقع";
        const friendlyErr = /Failed to fetch|NetworkError|Load failed/i.test(rawErr)
          ? "تعذر الوصول إلى الخادم حالياً. يمكنك إعادة المحاولة أو التبديل إلى نموذج صغير (النسخة التجريبية)."
          : rawErr;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  error: friendlyErr,
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

  const handleSelectGrounding = (mode: CloudGroundingMode) => {
    setGroundingMode(mode);
    if (mode === "maps" && !userLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => null,
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  };

  // Feature 14: Real microphone recording -> Gemini 3.5 Transcribe (/api/ai/transcribe), with Web Speech fallback
  const toggleVoice = async () => {
    if (listening && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setListening(false);
      return;
    }

    if (user && typeof MediaRecorder !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
        const recorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          if (blob.size < 400) return;
          setTranscribing(true);
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result || ""));
              r.onerror = reject;
              r.readAsDataURL(blob);
            });
            const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
            const headers = await getGoogleAuthHeaders();
            const res = await fetch("/api/ai/transcribe", {
              method: "POST",
              headers,
              body: JSON.stringify({ audioBase64: b64, mimeType }),
            });
            const data = await res.json();
            if (res.ok && data.transcript) {
              setInput((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
              void recordCloudUsageInFirestore(user, Number(data.usageTokens || 200), "gemini-3.5-transcribe");
              void refreshDailyQuota();
            }
          } catch {
            // ignore transient transcription failure
          } finally {
            setTranscribing(false);
          }
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setListening(true);
        return;
      } catch {
        // fall through to browser SpeechRecognition if mic blocked or unsupported
      }
    }

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
      {engineMode === "cloud" && !user && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-xs"
          style={{
            backgroundColor: "var(--nawa-elevated)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <span style={{ color: "var(--nawa-text)" }}>
            سجّل الدخول بحساب Google لاستخدام المحادثة السحابية عبر الإنترنت.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void signInWithGoogle()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 whitespace-nowrap shrink-0"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{signingIn ? "جاري الدخول..." : "دخول Google"}</span>
            </button>
            <button
              type="button"
              onClick={() => setEngineMode("offline")}
              className="min-h-[40px] rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
              style={{
                backgroundColor: "var(--nawa-surface)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-muted)",
              }}
            >
              نموذج صغير (النسخة التجريبية) مجاناً
            </button>
          </div>
        </div>
      )}
      <div className="relative px-4 pt-3.5 pb-2">
        <textarea
          rows={centeredHero ? 2 : 1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          placeholder={
            engineMode === "cloud"
              ? "اسأل نواة عن أي شيء في بالك..."
              : "اسأل نموذج صغير (النسخة التجريبية): كود، حسابات، علوم، مالية، أو تلخيص..."
          }
          className="max-h-40 min-h-[44px] w-full resize-none bg-transparent pe-9 text-[15px] leading-relaxed focus:outline-none"
          style={{ color: "var(--nawa-text)" }}
        />
        {input.trim().length > 0 && (
          <button
            type="button"
            onClick={() => setInput("")}
            aria-label="مسح النص"
            className="absolute end-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:opacity-80"
            style={{ color: "var(--nawa-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2"
        style={{ borderColor: "var(--nawa-border)" }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Cloud vs Small Experimental Model Toggle */}
          <button
            type="button"
            onClick={() => setEngineMode((m) => (m === "cloud" ? "offline" : "cloud"))}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            style={{
              backgroundColor: engineMode === "cloud" ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
              borderColor: engineMode === "cloud" ? "var(--nawa-accent)" : "var(--nawa-border)",
              color: engineMode === "cloud" ? "var(--nawa-accent)" : "var(--nawa-text)",
            }}
          >
            {engineMode === "cloud" ? (
              <Cloud className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>{engineMode === "cloud" ? "سحابي (إنترنت)" : "نموذج صغير (النسخة التجريبية)"}</span>
          </button>

          {engineMode === "cloud" && (
            <>
              <select
                aria-label="اختيار النموذج السحابي"
                value={cloudModelId}
                onChange={(e) => setCloudModelId(e.target.value as CloudModelId)}
                className="h-10 rounded-lg border px-2 text-xs focus:outline-none whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
              >
                <option value="gemini-3.1-flash-lite">نموذج سريع</option>
                <option value="gemini-4-hydrogen">هيدروجين (متوازن)</option>
                <option value="gemini-4-neon">نيون (متقدم)</option>
                <option value="gemini-4-carbon">كاربون (تحليل عميق)</option>
              </select>

              <select
                aria-label="شخصية المساعد"
                value={systemRole}
                onChange={(e) => setSystemRole(e.target.value as CloudSystemRole)}
                className="h-10 rounded-lg border px-2 text-xs focus:outline-none whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
              >
                <option value="assistant">الدور: مساعد عام</option>
                <option value="coder">مهندس برمجيات</option>
                <option value="tutor">معلّم مبسّط</option>
                <option value="analyst">محلل استراتيجي</option>
              </select>

              <select
                aria-label="مستوى التفكير"
                value={thinkingMode}
                onChange={(e) => setThinkingMode(e.target.value as ThinkingMode)}
                className="h-10 rounded-lg border px-2 text-xs focus:outline-none whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
              >
                <option value="auto">تفكير: متوازن</option>
                <option value="deep">تفكير عميق</option>
                <option value="fast">سريع</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  handleSelectGrounding(groundingMode === "search" ? "none" : "search")
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: groundingMode === "search" ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                  borderColor: groundingMode === "search" ? "var(--nawa-accent)" : "var(--nawa-border)",
                  color: groundingMode === "search" ? "var(--nawa-accent)" : "var(--nawa-muted)",
                }}
              >
                <Globe className="h-3.5 w-3.5" />
                <span>بحث Google</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSelectGrounding(groundingMode === "maps" ? "none" : "maps")
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: groundingMode === "maps" ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                  borderColor: groundingMode === "maps" ? "var(--nawa-accent)" : "var(--nawa-border)",
                  color: groundingMode === "maps" ? "var(--nawa-accent)" : "var(--nawa-muted)",
                }}
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>خرائط Google</span>
              </button>
            </>
          )}

          {/* Response Style Selector */}
          <select
            aria-label="أسلوب الرد"
            value={style}
            onChange={(e) => setStyle(e.target.value as ResponseStyle)}
            className="h-10 rounded-lg border px-2.5 text-xs focus:outline-none whitespace-nowrap shrink-0"
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
        </div>

        <div className="flex items-center gap-1.5">
          <select
            aria-label="لهجة الصوت"
            value={dialectVoice}
            onChange={(e) => setDialectVoice(e.target.value)}
            className="hidden h-10 rounded-lg border px-2 text-xs sm:inline-block focus:outline-none"
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
            disabled={transcribing}
            onClick={() => void toggleVoice()}
            aria-label="تسجيل صوتي وتفريغ النص"
            title={listening ? "إيقاف التسجيل وتفريغ الكلام" : "تسجيل صوتي وتفريغ الكلام"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors shrink-0 disabled:opacity-50"
            style={{
              borderColor: listening ? "#DC2626" : "var(--nawa-border)",
              backgroundColor: listening ? "rgba(220,38,38,0.12)" : "transparent",
              color: listening ? "#DC2626" : "var(--nawa-muted)",
            }}
          >
            {transcribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : listening ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>

          {sending ? (
            <button
              type="button"
              onClick={stopGeneration}
              aria-label="إيقاف التوليد"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white transition-opacity shrink-0"
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white transition-opacity disabled:opacity-40 shrink-0"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const starterPrompts = engineMode === "offline" ? OFFLINE_STARTER_PROMPTS : CLOUD_STARTER_PROMPTS;

  // Centered Hero State when conversation is empty
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-2xl flex-col items-center text-center">
          <div className="mb-3 flex items-center gap-3">
            <NawaSparkMark size={30} />
            <h1
              className="font-display text-2xl font-bold sm:text-3xl"
              style={{ color: "var(--nawa-text)", textWrap: "balance" }}
            >
              {firstName ? `مرحباً ${firstName}، بمَ نفكّر اليوم؟` : "مساء الإبداع، بمَ نفكّر اليوم؟"}
            </h1>
          </div>

          <p className="mb-5 text-sm" style={{ color: "var(--nawa-muted)" }}>
            {engineMode === "cloud"
              ? "مساعد ذكي متكامل للكتابة والبرمجة والتحليل وبحث وخرائط Google"
              : "نموذج صغير (النسخة التجريبية) بقاعدة معرفة موسّعة للبرمجة والعلوم والمالية والحسابات"}
          </p>

          {/* Segmented Cloud vs Small Experimental Model Switcher */}
          <div
            className="mb-4 inline-grid grid-cols-2 gap-1 rounded-xl border p-1"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
            }}
            role="tablist"
            aria-label="وضع المحرك"
          >
            <button
              type="button"
              role="tab"
              aria-selected={engineMode === "offline"}
              onClick={() => setEngineMode("offline")}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              style={{
                backgroundColor: engineMode === "offline" ? "var(--nawa-surface)" : "transparent",
                color: engineMode === "offline" ? "var(--nawa-accent)" : "var(--nawa-muted)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>نموذج صغير (النسخة التجريبية)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={engineMode === "cloud"}
              onClick={() => setEngineMode("cloud")}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              style={{
                backgroundColor: engineMode === "cloud" ? "var(--nawa-surface)" : "transparent",
                color: engineMode === "cloud" ? "var(--nawa-accent)" : "var(--nawa-muted)",
              }}
            >
              <Cloud className="h-3.5 w-3.5" />
              <span>سحابي (بالإنترنت)</span>
            </button>
          </div>

          {renderComposer(true)}

          <div className="mt-5 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendMessage(prompt)}
                className="min-h-[44px] rounded-xl border px-3.5 py-2.5 text-right text-xs font-medium leading-relaxed transition-colors hover:opacity-90"
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
                <span>تم إخفاء {hiddenCount} رسائل قديمة لتسريع العرض.</span>
                {compressedSummary && (
                  <div className="mt-0.5 text-[11px] opacity-85">{compressedSummary}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAllHistory(true)}
                className="min-h-[36px] rounded-lg border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0"
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
                className="min-h-[36px] rounded-lg border px-3 py-1 text-xs"
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
                    <div className="space-y-2.5">
                      <div className="text-sm text-red-500">{msg.error}</div>
                      {idx > 0 && visibleMessages[idx - 1]?.role === "user" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => void sendMessage(visibleMessages[idx - 1].content)}
                            className="min-h-[40px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                            style={{
                              backgroundColor: "var(--nawa-surface)",
                              borderColor: "var(--nawa-border)",
                              color: "var(--nawa-text)",
                            }}
                          >
                            إعادة المحاولة
                          </button>
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => {
                              setEngineMode("offline");
                              void sendMessage(visibleMessages[idx - 1].content, "offline");
                            }}
                            className="min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity whitespace-nowrap shrink-0"
                            style={{ backgroundColor: "var(--nawa-accent)" }}
                          >
                            الرد عبر نموذج صغير (النسخة التجريبية)
                          </button>
                        </div>
                      )}
                    </div>
                  ) : msg.content ? (
                    <div
                      className="font-display text-[15.5px] leading-[1.75]"
                      style={{ color: "var(--nawa-text)" }}
                    >
                      {renderFormattedProse(msg.content)}
                    </div>
                  ) : (
                    <div className="text-sm" style={{ color: "var(--nawa-muted)" }}>
                      جاري التفكير...
                    </div>
                  )}

                  {/* Clean end-user reply actions & grounding links (no internal model telemetry) */}
                  {(msg.content || (msg.meta?.groundingSources && msg.meta.groundingSources.length > 0)) && (
                    <div className="space-y-2 pt-0.5">
                      {msg.content && (
                        <div className="flex items-center justify-end">
                          <CopyReplyButton text={msg.content} />
                        </div>
                      )}

                      {msg.meta?.groundingSources && msg.meta.groundingSources.length > 0 && (
                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold" style={{ color: "var(--nawa-muted)" }}>
                              المصادر:
                            </span>
                            {msg.meta.groundingSources.map((src) => (
                              <a
                                key={src.uri}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex max-w-[260px] items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] transition-colors hover:opacity-85"
                                style={{
                                  backgroundColor: "var(--nawa-elevated)",
                                  borderColor: "var(--nawa-border)",
                                  color: "var(--nawa-text)",
                                }}
                              >
                                {src.kind === "maps" ? (
                                  <MapPin className="h-3 w-3 shrink-0 text-emerald-500" />
                                ) : (
                                  <ExternalLink className="h-3 w-3 shrink-0" style={{ color: "var(--nawa-accent)" }} />
                                )}
                                <span className="truncate">{src.title}</span>
                              </a>
                            ))}
                          </div>
                          {msg.meta.groundingSources.some((s) => s.snippet) && (
                            <div className="space-y-1">
                              {msg.meta.groundingSources
                                .filter((s) => s.snippet)
                                .slice(0, 3)
                                .map((s) => (
                                  <div
                                    key={`${s.uri}-snip`}
                                    className="rounded-lg border px-2.5 py-1.5 text-[11px] leading-relaxed"
                                    style={{
                                      backgroundColor: "var(--nawa-elevated)",
                                      borderColor: "var(--nawa-border)",
                                      color: "var(--nawa-muted)",
                                    }}
                                  >
                                    <span className="font-semibold" style={{ color: "var(--nawa-text)" }}>
                                      {s.title}:
                                    </span>{" "}
                                    «{s.snippet}»
                                  </div>
                                ))}
                            </div>
                          )}
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
                            className="min-h-[40px] rounded-xl border px-3.5 py-2 text-xs font-medium transition-colors"
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
