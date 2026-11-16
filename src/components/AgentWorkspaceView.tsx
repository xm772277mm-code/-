import React, { useEffect, useRef, useState } from "react";
import {
  FileCode2,
  Folder,
  Mic,
  MicOff,
  RefreshCw,
  RotateCcw,
  Send,
  Terminal,
  X,
  ChevronDown,
} from "lucide-react";

interface ToolStep {
  tool: string;
  arguments: string;
  output: string;
}

interface InferencePrediction {
  intent: string;
  labelAr: string;
  confidence: number;
  dialectHint: string;
  wasmInferenceMs: number;
  wasmFlops: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  content: string;
  steps?: ToolStep[];
  prediction?: InferencePrediction;
  error?: string;
}

interface ParsedFileEntry {
  kind: "dir" | "file";
  path: string;
}

const DIALECT_VOICES = [
  { code: "ar-EG", label: "مصري" },
  { code: "ar-SA", label: "سعودي / خليجي" },
  { code: "ar-LB", label: "شامي" },
  { code: "ar-MA", label: "مغربي" },
  { code: "ar-IQ", label: "عراقي" },
];

const QUICK_PROMPTS = [
  "عايزك تعملي API لادارة المهام وتختبره",
  "سويلي خوارزمية فرز سريعة واختبرها",
  "وريني الملفات اللي في المشروع",
  "اكتب نواة C++ سريعة تنجز 50 مليون عملية بالثانية",
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
          className="my-2.5 overflow-x-auto rounded-lg border border-white/10 bg-[#070A10] p-3 text-left font-mono text-xs leading-relaxed text-slate-200"
        >
          <code>{codeBody}</code>
        </pre>
      );
    }
    // Inline code and bold handling
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
                      className="mx-0.5 inline-block rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-xs text-blue-300"
                    >
                      {seg.slice(1, -1)}
                    </code>
                  );
                }
                if (seg.startsWith("**") && seg.endsWith("**")) {
                  return (
                    <strong key={sIdx} className="font-semibold text-white">
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "bot",
      content:
        "أهلاً بك في **نواة Studio**.\nهذا الوكيل يعمل بالكامل على نموذج **NawaCore-50M** المدمج محلياً عبر WebAssembly (بدون استدعاء أي نموذج خارجي). اكتب طلبك بأي لهجة عربية وسيتم تنفيذ الأدوات واختبار الكود فعلياً داخل `workspace/`.",
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

    const userMsg: ChatMessage = {
      id: "u_" + Date.now(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "تعذر تنفيذ الطلب");

      const botMsg: ChatMessage = {
        id: "b_" + Date.now(),
        role: "bot",
        content: data.reply,
        steps: data.steps,
        prediction: data.prediction,
      };
      setMessages((prev) => [...prev, botMsg]);
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
    setMessages([
      {
        id: "reset_" + Date.now(),
        role: "bot",
        content: "تم بدء جلسة برمجية جديدة مع النموذج المحلي.",
      },
    ]);
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
    if (!SR) {
      setMessages((prev) => [
        ...prev,
        {
          id: "sr_" + Date.now(),
          role: "bot",
          content: "",
          error: "التعرف الصوتي المباشر يتطلب متصفح Chrome أو Edge.",
        },
      ]);
      return;
    }
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
    <div className="grid h-[calc(100vh-65px)] grid-cols-1 lg:grid-cols-[290px_1fr]">
      {/* Workspace File Explorer Sidebar */}
      <aside className="flex flex-col border-b border-white/10 bg-[#111827] lg:border-b-0 lg:border-l">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-200">ملفات بيئة العمل</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={loadFiles}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-[#0B0F17] px-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap shrink-0"
              title="تحديث الملفات"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>تحديث</span>
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-[#0B0F17] px-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white whitespace-nowrap shrink-0"
              title="جلسة جديدة"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div dir="ltr" className="flex-1 overflow-y-auto p-3 text-left font-mono text-xs">
          {filesLoading ? (
            <div className="space-y-2 p-2">
              <div className="h-6 animate-pulse rounded bg-white/5" />
              <div className="h-6 animate-pulse rounded bg-white/5" />
              <div className="h-6 animate-pulse rounded bg-white/5" />
            </div>
          ) : files.length === 0 ? (
            <p className="p-2 text-slate-500">workspace/ is empty</p>
          ) : (
            <div className="space-y-0.5">
              {files.map((item) =>
                item.kind === "file" ? (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => openFile(item.path)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-slate-300 transition-colors hover:bg-white/5 hover:text-blue-300"
                  >
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    <span className="truncate">{item.path}</span>
                  </button>
                ) : (
                  <div
                    key={item.path}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-slate-500"
                  >
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.path}</span>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-3 text-xs text-slate-400">
          المسار المعزول: <span className="font-mono text-slate-300">workspace/</span>
        </div>
      </aside>

      {/* Main Agent Conversation Area */}
      <section className="flex flex-col overflow-hidden bg-[#0B0F17]">
        <div className="flex-1 overflow-y-auto p-5 lg:p-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-xl border p-4 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "self-start border-blue-500/30 bg-[#151E2E] text-slate-100 md:max-w-[82%]"
                    : "self-end w-full border-white/10 bg-[#111827] text-slate-200"
                }`}
              >
                {msg.prediction && (
                  <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/10 pb-2 text-xs text-slate-400">
                    <span>اللهجة: {msg.prediction.dialectHint}</span>
                    <span aria-hidden="true">·</span>
                    <span>النية: {msg.prediction.labelAr}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      الثقة {(msg.prediction.confidence * 100).toFixed(1)}%
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      WASM {msg.prediction.wasmInferenceMs} ms ({msg.prediction.wasmFlops.toLocaleString()} FLOPs)
                    </span>
                  </div>
                )}

                {msg.steps && msg.steps.length > 0 && (
                  <details className="mb-3 rounded-lg border border-white/10 bg-[#0B0F17] px-3 py-2 text-xs">
                    <summary className="flex cursor-pointer items-center justify-between font-medium text-emerald-400">
                      <span className="inline-flex items-center gap-2">
                        <Terminal className="h-3.5 w-3.5" />
                        <span>تم تنفيذ {msg.steps.length} خطوات فعلية في بيئة العمل</span>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </summary>
                    <div className="mt-2.5 space-y-2.5 border-t border-white/10 pt-2.5" dir="ltr">
                      {msg.steps.map((step, i) => (
                        <div key={i} className="text-left">
                          <div className="font-mono text-xs font-semibold text-blue-300">
                            {step.tool}({step.arguments})
                          </div>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-[#070A10] p-2 font-mono text-[11px] text-slate-300">
                            {step.output}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {msg.error ? (
                  <div className="text-sm text-red-400">{msg.error}</div>
                ) : (
                  <div>{renderFormattedContent(msg.content)}</div>
                )}
              </div>
            ))}

            {sending && (
              <div className="self-end w-full rounded-xl border border-white/10 bg-[#111827] p-4 text-sm text-slate-400">
                جاري تحليل اللهجة عبر نواة WebAssembly وتنفيذ أدوات بيئة العمل...
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Quick Dialect Suggestions + Composer */}
        <div className="border-t border-white/10 bg-[#111827] px-5 py-3.5">
          <div className="mx-auto max-w-4xl">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending}
                  onClick={() => sendMessage(q)}
                  className="rounded-md border border-white/10 bg-[#0B0F17] px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-blue-500/40 hover:text-white disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex items-center gap-2">
                <select
                  aria-label="لهجة الإدخال الصوتي"
                  value={dialectVoice}
                  onChange={(e) => setDialectVoice(e.target.value)}
                  className="h-11 rounded-lg border border-white/10 bg-[#0B0F17] px-3 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                >
                  {DIALECT_VOICES.map((d) => (
                    <option key={d.code} value={d.code}>
                      صوت: {d.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    listening
                      ? "border-red-500 bg-red-500/15 text-red-400"
                      : "border-white/10 bg-[#0B0F17] text-slate-300 hover:border-white/25 hover:text-white"
                  }`}
                  title="تحدث باللهجة العربية"
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
                placeholder="اكتب طلبك بأي لهجة عربية... مثال: عايزك تعملي API لادارة المهام وتختبره"
                className="min-h-[44px] max-h-36 flex-1 resize-none rounded-lg border border-white/10 bg-[#0B0F17] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />

              <button
                type="button"
                disabled={sending || !input.trim()}
                onClick={() => sendMessage()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Send className="h-4 w-4" />
                <span>إرسال</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* File Content Preview Modal */}
      {modalFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalFile(null);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-white/15 bg-[#111827]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3" dir="ltr">
              <span className="font-mono text-sm font-medium text-slate-200">{modalFile.path}</span>
              <button
                type="button"
                onClick={() => setModalFile(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre
              dir="ltr"
              className="flex-1 overflow-auto bg-[#070A10] p-4 text-left font-mono text-xs leading-relaxed text-slate-200"
            >
              {modalFile.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
