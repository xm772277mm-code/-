import React, { useEffect, useRef, useState } from "react";
import { LogIn, Mic, MicOff, PhoneCall, PhoneOff, Send, Volume2 } from "lucide-react";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";
import { auth } from "../firebase.ts";

interface TranscriptTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const VOICES = [
  { id: "Aoede", label: "Aoede — نبرة واضحة دافئة" },
  { id: "Kore", label: "Kore — هادئ ومباشر" },
  { id: "Puck", label: "Puck — حيوي سريع" },
  { id: "Charon", label: "Charon — صوت رخيم عميق" },
  { id: "Fenrir", label: "Fenrir — حازم وواضح" },
];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export default function LiveVoiceView() {
  const { user, signingIn, signInWithGoogle } = useUiSettings();
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [voice, setVoice] = useState("Aoede");
  const [muted, setMuted] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const stopScheduledPlayback = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // ignore
      }
    }
    activeSourcesRef.current = [];
    if (playCtxRef.current) {
      nextStartTimeRef.current = playCtxRef.current.currentTime;
    }
  };

  const cleanupSession = () => {
    stopScheduledPlayback();
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (captureCtxRef.current) {
      void captureCtxRef.current.close().catch(() => null);
      captureCtxRef.current = null;
    }
    if (playCtxRef.current) {
      void playCtxRef.current.close().catch(() => null);
      playCtxRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("idle");
  };

  useEffect(() => {
    return () => cleanupSession();
  }, []);

  const schedulePcmPlayback = (base64Pcm: string) => {
    const playCtx = playCtxRef.current;
    if (!playCtx) return;

    const bytes = base64ToUint8Array(base64Pcm);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    if (sampleCount === 0) return;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const f32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      f32[i] = view.getInt16(i * 2, true) / 32768;
    }

    const audioBuffer = playCtx.createBuffer(1, sampleCount, 24000);
    audioBuffer.copyToChannel(f32, 0);

    const source = playCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playCtx.destination);

    const startTime = Math.max(playCtx.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  };

  const appendTranscript = (role: "user" | "assistant", chunk: string) => {
    const clean = chunk.trim();
    if (!clean) return;
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text} ${clean}`.trim() },
        ];
      }
      return [...prev.slice(-24), { id: `${Date.now()}_${Math.random()}`, role, text: clean }];
    });
  };

  const startLiveSession = async () => {
    if (!user || !auth.currentUser) {
      setError("يلزم تسجيل الدخول بحساب Google لبدء المحادثة الصوتية المباشرة.");
      return;
    }
    setError(null);
    setStatus("connecting");

    try {
      const idToken = await auth.currentUser.getIdToken();
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      micStreamRef.current = micStream;

      const captureCtx = new AudioContext({ sampleRate: 16000 });
      captureCtxRef.current = captureCtx;
      const playCtx = new AudioContext({ sampleRate: 24000 });
      playCtxRef.current = playCtx;
      nextStartTimeRef.current = playCtx.currentTime;

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/live?token=${encodeURIComponent(idToken)}&voice=${encodeURIComponent(voice)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            type: string;
            data?: string;
            text?: string;
            detail?: string;
          };
          if (msg.type === "ready") {
            setStatus("live");
            const source = captureCtx.createMediaStreamSource(micStream);
            const processor = captureCtx.createScriptProcessor(2048, 1, 1);
            processorRef.current = processor;
            processor.onaudioprocess = (ev) => {
              if (mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
              const input = ev.inputBuffer.getChannelData(0);
              const pcm = new Int16Array(input.length);
              for (let i = 0; i < input.length; i++) {
                const s = Math.max(-1, Math.min(1, input[i]));
                pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
              }
              ws.send(
                JSON.stringify({
                  type: "audio",
                  data: arrayBufferToBase64(pcm.buffer),
                })
              );
            };
            source.connect(processor);
            processor.connect(captureCtx.destination);
          } else if (msg.type === "audio" && msg.data) {
            schedulePcmPlayback(msg.data);
          } else if (msg.type === "interrupted") {
            stopScheduledPlayback();
          } else if (msg.type === "input_transcript" && msg.text) {
            appendTranscript("user", msg.text);
          } else if (msg.type === "output_transcript" && msg.text) {
            appendTranscript("assistant", msg.text);
          } else if (msg.type === "error") {
            setError(msg.detail || "تعذر إكمال الاتصال الصوتي المباشر.");
            setStatus("error");
          } else if (msg.type === "closed") {
            cleanupSession();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        setError("انقطع الاتصال بخدمة المحادثة الصوتية المباشرة.");
        cleanupSession();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          cleanupSession();
        }
      };
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "يرجى السماح بالوصول إلى الميكروفون لبدء المحادثة الصوتية."
      );
      cleanupSession();
    }
  };

  const sendTextNudge = () => {
    const trimmed = textInput.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "text", text: trimmed }));
    appendTranscript("user", trimmed);
    setTextInput("");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div
        className="rounded-2xl border p-6 space-y-5"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Volume2 className="h-5 w-5" style={{ color: "var(--nawa-accent)" }} />
            <div>
              <h2 className="font-display text-xl font-bold">المحادثة الصوتية المباشرة</h2>
              <p className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                تحدّث صوتياً في الزمن الحقيقي مع إمكانية المقاطعة الفورية والنص المباشر.
              </p>
            </div>
          </div>

          <select
            aria-label="اختيار الصوت"
            disabled={status === "live" || status === "connecting"}
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="h-10 rounded-xl border px-3 text-xs focus:outline-none disabled:opacity-60"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
              color: "var(--nawa-text)",
            }}
          >
            {VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        {!user && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 text-xs"
            style={{
              backgroundColor: "var(--nawa-elevated)",
              borderColor: "var(--nawa-border)",
            }}
          >
            <span>سجّل الدخول بحساب Google لتشغيل المحادثة الصوتية التفاعلية.</span>
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void signInWithGoogle()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{signingIn ? "جاري الدخول..." : "دخول بحساب Google"}</span>
            </button>
          </div>
        )}

        <div
          className="flex flex-col items-center justify-center gap-4 rounded-2xl border py-8 px-4 text-center"
          style={{
            backgroundColor: "var(--nawa-elevated)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full border-2 transition-transform ${
              status === "live" ? "scale-105 animate-pulse" : ""
            }`}
            style={{
              backgroundColor:
                status === "live" ? "var(--nawa-accent-soft)" : "var(--nawa-surface)",
              borderColor: status === "live" ? "var(--nawa-accent)" : "var(--nawa-border)",
              color: status === "live" ? "var(--nawa-accent)" : "var(--nawa-muted)",
            }}
          >
            <Volume2 className="h-9 w-9" />
          </div>

          <div className="text-sm font-semibold">
            {status === "idle" && "جاهز لبدء مكالمة صوتية مباشرة"}
            {status === "connecting" && "جاري فتح القناة الصوتية..."}
            {status === "live" && (muted ? "الميكروفون مكتوم — يمكنك السماع أو الكتابة" : "المكالمة نشطة — تكلّم الآن")}
            {status === "error" && "تعذر الاتصال بالقناة الصوتية"}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {status !== "live" && status !== "connecting" ? (
              <button
                type="button"
                onClick={() => void startLiveSession()}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-6 text-xs font-semibold text-white"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                <PhoneCall className="h-4 w-4" />
                <span>بدء المحادثة الصوتية</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-xs font-semibold"
                  style={{
                    backgroundColor: "var(--nawa-surface)",
                    borderColor: "var(--nawa-border)",
                    color: muted ? "#DC2626" : "var(--nawa-text)",
                  }}
                >
                  {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  <span>{muted ? "إلغاء الكتم" : "كتم الميكروفون"}</span>
                </button>
                <button
                  type="button"
                  onClick={cleanupSession}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-xs font-semibold text-white"
                >
                  <PhoneOff className="h-4 w-4" />
                  <span>إنهاء المكالمة</span>
                </button>
              </>
            )}
          </div>

          {status === "live" && (
            <div className="mt-2 flex w-full max-w-md gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendTextNudge();
                  }
                }}
                placeholder="أو أرسل رسالة نصية أثناء المكالمة..."
                className="h-10 flex-1 rounded-xl border px-3 text-xs focus:outline-none"
                style={{
                  backgroundColor: "var(--nawa-surface)",
                  borderColor: "var(--nawa-border)",
                  color: "var(--nawa-text)",
                }}
              />
              <button
                type="button"
                onClick={sendTextNudge}
                disabled={!textInput.trim()}
                aria-label="إرسال"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white disabled:opacity-40"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-500">
          {error}
        </div>
      )}

      {turns.length > 0 && (
        <div
          className="rounded-2xl border p-5 space-y-3"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <h3 className="text-xs font-bold" style={{ color: "var(--nawa-muted)" }}>
            النص المباشر للمحادثة
          </h3>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {turns.map((t) => (
              <div
                key={t.id}
                className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  t.role === "user" ? "ms-8" : "me-8"
                }`}
                style={{
                  backgroundColor:
                    t.role === "user" ? "var(--nawa-user-bubble)" : "var(--nawa-elevated)",
                  color: "var(--nawa-text)",
                }}
              >
                <span className="font-bold me-1.5" style={{ color: "var(--nawa-accent)" }}>
                  {t.role === "user" ? "أنت:" : "نواة:"}
                </span>
                <span>{t.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
