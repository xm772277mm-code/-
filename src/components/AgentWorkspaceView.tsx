import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FileCode2,
  Folder,
  Mic,
  MicOff,
  RefreshCw,
  RotateCcw,
  Send,
  Terminal,
  X,
} from "lucide-react";

interface ToolStep {
  tool: string;
  arguments: string;
  output: string;
}

interface ActiveContext {
  lastFile: string | null;
  lastDomain: string;
  lastDomainObj?: { nameEn: string; nameAr: string; fields: string[] };
  lastLanguage?: string;
  turnCount: number;
}

interface InferencePrediction {
  intent: string;
  labelAr: string;
  confidence: number;
  dialectHint: string;
  wasmInferenceMs: number;
  wasmFlops: number;
  slots?: {
    usedContextMemory?: boolean;
    resolvedReferences?: string[];
  };
}

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  content: string;
  steps?: ToolStep[];
  planSteps?: string[];
  suggestedFollowUps?: Array<{ label: string; prompt: string }>;
  activeContext?: ActiveContext;
  prediction?: InferencePrediction;
  error?: string;
}

interface ParsedFileEntry {
  kind: "dir" | "file";
  path: string;
}

const DIALECT_VOICES = [
  { code: "ar-EG", label: "مصري" },
  { code: "ar-SA", label: "خليجي" },
  { code: "ar-LB", label: "شامي" },
  { code: "ar-MA", label: "مغربي" },
];

const SCOPE_OPTIONS = [
  { id: "auto", label: "تلقائي (فهم السياق)" },
  { id: "create_fastapi_api", label: "نطاق: بناء API" },
  { id: "create_database_app", label: "نطاق: SQLite" },
  { id: "create_auth_security", label: "نطاق: الأمان" },
  { id: "debug_and_fix", label: "نطاق: فحص الأخطاء" },
];

const QUICK_PROMPTS = [
  "اعملي API للمنتجات واختبره",
  "اعملي قاعدة بيانات SQLite لنفس المجال واختبرها",
  "اقراه ووريني مكتوب فيه ايه",
  "افحص ملفات المشروع وشوف لو فيها اخطاء",
];

function renderFormattedContent(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const inner = part.slice(3, -3);
      const firstNewline = inner.indexOf("\n");
      const codeBody = firstNewline >= 0 ? inner.slice(firstNewline + 1) : inner;
      return (
        <pre
          key={idx}
          dir="ltr"
          className="my-2.5 overflow-x-auto rounded-xl border p-3 text-left font-mono text-xs leading-relaxed"
          style={{
            backgroundColor: "var(--nawa-code-bg)",
            color: "var(--nawa-code-text)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <code>{codeBody}</code>
        </pre>
      );
    }
    const lines = part.split("\n");
    return (
      <span key={idx} className="whitespace-pre-wrap">
        {lines.map((line, lIdx) => {
          const inlineParts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
          return (
            <React.Fragment key={lIdx}>
              {inlineParts.map((seg, sIdx) => {
                if (seg.startsWith("`") && seg.endsWith("`")) {
                  return (
                    <code
                      key={sIdx}
                      dir="ltr"
                      className="mx-0.5 inline-block rounded px-1.5 py-0.5 font-mono text-xs"
                      style={{
                        backgroundColor: "var(--nawa-elevated)",
                        color: "var(--nawa-accent)",
                      }}
                    >
                      {seg.slice(1, -1)}
                    </code>
                  );
                }
                if (seg.startsWith("**") && seg.endsWith("**")) {
                  return (
                    <strong key={sIdx} className="font-semibold">
                      {seg.slice(2, -2)}
                    </strong>
                  );
                }
                return <React.Fragment key={sIdx}>{seg}</React.Fragment>;
              })}
              {lIdx < lines.length - 1 && <br />}
            </React.Fragment>
          );
        })}
      </span>
    );
  });
}

export default function AgentWorkspaceView() {
  const [sessionId] = useState(() => "session_" + Math.random().toString(36).slice(2, 9));
  const [files, setFiles] = useState<ParsedFileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [activeContext, setActiveContext] = useState<ActiveContext | null>(null);
  const [taskScope, setTaskScope] = useState("auto");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "bot",
      content:
        "أهلاً بك في **بيئة التطوير السياقية (IDE Agent)**.\nجرب بناء API للمنتجات ثم اطلب: «اعملي قاعدة بيانات SQLite لنفس المجال» أو «اقراه».",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [dialectVoice, setDialectVoice] = useState("ar-EG");
  const [listening, setListening] = useState(false);
  const [modalFile, setModalFile] = useState<{ path: string; content: string } | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadFiles = async () => {
    setFilesLoading(true);
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      const lines = String(data.tree || "")
        .split("\n")
        .filter(Boolean);
      const parsed: ParsedFileEntry[] = [];
      for (const line of lines) {
        if (line.startsWith("[FILE] ")) {
          parsed.push({ kind: "file", path: line.replace("[FILE] ", "").trim() });
        } else if (line.startsWith("[DIR]")) {
          parsed.push({ kind: "dir", path: line.replace(/^\[DIR\]\s+/, "").trim() });
        }
      }
      setFiles(parsed);
    } catch {
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openFile = async (filePath: string) => {
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) return;
      const data = await res.json();
      setModalFile({ path: data.path, content: data.content });
    } catch {
      // ignore
    }
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    if (!overrideText) setInput("");

    setMessages((prev) => [...prev, { id: "u_" + Date.now(), role: "user", content: text }]);
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId, taskScope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "تعذر تنفيذ الطلب");

      if (data.activeContext) setActiveContext(data.activeContext);

      setMessages((prev) => [
        ...prev,
        {
          id: "b_" + Date.now(),
          role: "bot",
          content: data.reply,
          steps: data.steps,
          planSteps: data.planSteps,
          suggestedFollowUps: data.suggestedFollowUps,
          activeContext: data.activeContext,
          prediction: data.prediction,
        },
      ]);
      loadFiles();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: "e_" + Date.now(),
          role: "bot",
          content: "",
          error: err instanceof Error ? err.message : "خطأ غير متوقع",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleReset = async () => {
    await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    setActiveContext(null);
    setMessages([{ id: "reset_" + Date.now(), role: "bot", content: "تم تصفير الذاكرة السياقية." }]);
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
      const transcript = e.results[0]?.[0]?.transcript || "";
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[270px_1fr]">
      {/* Workspace File Explorer */}
      <aside
        className="flex flex-col border-b lg:border-b-0 lg:border-l"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--nawa-border)" }}
        >
          <h2 className="text-sm font-semibold">ملفات بيئة العمل</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={loadFiles}
              className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-medium"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-medium"
              style={{
                backgroundColor: "var(--nawa-elevated)",
                borderColor: "var(--nawa-border)",
              }}
              title="تصفير السياق"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div dir="ltr" className="flex-1 overflow-y-auto p-3 text-left font-mono text-xs">
          {filesLoading ? (
            <div className="space-y-2 p-2">
              <div className="h-6 rounded" style={{ backgroundColor: "var(--nawa-elevated)" }} />
              <div className="h-6 rounded" style={{ backgroundColor: "var(--nawa-elevated)" }} />
            </div>
          ) : files.length === 0 ? (
            <p className="p-2" style={{ color: "var(--nawa-muted)" }}>
              workspace/ is empty
            </p>
          ) : (
            <div className="space-y-0.5">
              {files.map((item) =>
                item.kind === "file" ? (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => openFile(item.path)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors"
                    style={{
                      backgroundColor: activeContext?.lastFile === item.path ? "var(--nawa-accent-soft)" : "transparent",
                      color: activeContext?.lastFile === item.path ? "var(--nawa-accent)" : "var(--nawa-text)",
                    }}
                  >
                    <FileCode2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--nawa-accent)" }} />
                    <span className="truncate">{item.path}</span>
                  </button>
                ) : (
                  <div key={item.path} className="flex items-center gap-2 px-2.5 py-1.5" style={{ color: "var(--nawa-muted)" }}>
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.path}</span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Agent Conversation Area */}
      <section className="flex flex-col overflow-hidden">
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-2.5 text-xs"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
            color: "var(--nawa-muted)",
          }}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold" style={{ color: "var(--nawa-text)" }}>
              الذاكرة السياقية:
            </span>
            <span>المجال {activeContext?.lastDomainObj?.nameAr || "المهام"}</span>
            <span aria-hidden="true">·</span>
            <span>اللغة {activeContext?.lastLanguage || "python"}</span>
            <span aria-hidden="true">·</span>
            <span>
              الملف:{" "}
              <span className="font-mono" style={{ color: "var(--nawa-accent)" }} dir="ltr">
                {activeContext?.lastFile || "لا يوجد"}
              </span>
            </span>
          </div>
          {activeContext && (
            <button type="button" onClick={handleReset} className="text-xs font-medium hover:underline">
              تصفير السياق
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 lg:p-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {messages.map((msg, msgIdx) => (
              <div
                key={msg.id}
                className={`rounded-2xl border p-4 text-sm leading-relaxed ${
                  msg.role === "user" ? "self-start md:max-w-[82%]" : "self-end w-full"
                }`}
                style={{
                  backgroundColor: msg.role === "user" ? "var(--nawa-user-bubble)" : "var(--nawa-surface)",
                  borderColor: "var(--nawa-border)",
                }}
              >
                {msg.prediction && (
                  <div
                    className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-b pb-2 text-xs"
                    style={{ borderColor: "var(--nawa-border)", color: "var(--nawa-muted)" }}
                  >
                    <span>اللهجة: {msg.prediction.dialectHint}</span>
                    <span aria-hidden="true">·</span>
                    <span>النية: {msg.prediction.labelAr}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">WASM {msg.prediction.wasmInferenceMs} ms</span>
                  </div>
                )}

                {msg.steps && msg.steps.length > 0 && (
                  <details
                    className="mb-3 rounded-xl border px-3 py-2 text-xs"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                    }}
                  >
                    <summary className="flex cursor-pointer items-center justify-between font-medium">
                      <span className="inline-flex items-center gap-2">
                        <Terminal className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
                        <span>تم تنفيذ {msg.steps.length} خطوات فعلية</span>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </summary>
                    <div className="mt-2.5 space-y-2 border-t pt-2" style={{ borderColor: "var(--nawa-border)" }} dir="ltr">
                      {msg.steps.map((step, i) => (
                        <div key={i} className="text-left">
                          <div className="font-mono text-xs font-semibold" style={{ color: "var(--nawa-accent)" }}>
                            {step.tool}({step.arguments})
                          </div>
                          <pre
                            className="mt-1 max-h-40 overflow-auto rounded-lg p-2 font-mono text-[11px]"
                            style={{ backgroundColor: "var(--nawa-code-bg)", color: "var(--nawa-code-text)" }}
                          >
                            {step.output}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {msg.error ? <div className="text-sm text-red-500">{msg.error}</div> : <div>{renderFormattedContent(msg.content)}</div>}

                {msg.role === "bot" && msgIdx === messages.length - 1 && msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--nawa-border)" }}>
                    {msg.suggestedFollowUps.map((f) => (
                      <button
                        key={f.label}
                        type="button"
                        disabled={sending}
                        onClick={() => sendMessage(f.prompt)}
                        className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: "var(--nawa-elevated)",
                          borderColor: "var(--nawa-border)",
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div
                className="w-full rounded-2xl border p-4 text-sm"
                style={{
                  backgroundColor: "var(--nawa-surface)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-muted)",
                }}
              >
                جاري ربط السياق وتنفيذ الأدوات...
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div
          className="border-t px-5 py-3.5"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="mx-auto max-w-4xl">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending}
                  onClick={() => sendMessage(q)}
                  className="rounded-lg border px-2.5 py-1 text-xs transition-colors"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex items-center gap-2">
                <select
                  aria-label="نطاق المهمة"
                  value={taskScope}
                  onChange={(e) => setTaskScope(e.target.value)}
                  className="h-11 rounded-xl border px-3 text-xs focus:outline-none"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                >
                  {SCOPE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={toggleVoice}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                  style={{
                    backgroundColor: listening ? "rgba(220,38,38,0.12)" : "var(--nawa-elevated)",
                    borderColor: listening ? "#DC2626" : "var(--nawa-border)",
                  }}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              </div>

              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="اكتب أمرك البرمجي بأي لهجة عربية..."
                className="min-h-[44px] max-h-36 flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
              />

              <button
                type="button"
                disabled={sending || !input.trim()}
                onClick={() => sendMessage()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50 whitespace-nowrap shrink-0"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                <Send className="h-4 w-4" />
                <span>إرسال</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {modalFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalFile(null);
          }}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border"
            style={{
              backgroundColor: "var(--nawa-surface)",
              borderColor: "var(--nawa-border)",
            }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--nawa-border)" }} dir="ltr">
              <span className="font-mono text-sm font-medium">{modalFile.path}</span>
              <button
                type="button"
                onClick={() => setModalFile(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border"
                style={{ borderColor: "var(--nawa-border)" }}
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre
              dir="ltr"
              className="flex-1 overflow-auto p-4 text-left font-mono text-xs leading-relaxed"
              style={{
                backgroundColor: "var(--nawa-code-bg)",
                color: "var(--nawa-code-text)",
              }}
            >
              {modalFile.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
