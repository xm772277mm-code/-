import React, { useEffect, useState } from "react";
import { BookMarked, Bug, Cpu, Database, FileCode2, Play, Plus, Server, ShieldCheck, Terminal, Trash2 } from "lucide-react";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";
import { getGoogleAuthHeaders } from "../firebase.ts";

type IsolatedTaskId = "apis" | "databases" | "security" | "algorithms" | "debugger" | "notes";

interface UserNoteItem {
  id: number;
  title: string;
  content: string;
  category: string;
  updatedAt: string;
}

interface TaskRunState {
  busy: boolean;
  reply: string | null;
  planSteps: string[];
  steps: Array<{ tool: string; arguments: string; output: string }>;
  generatedFile: string | null;
  fileContent: string | null;
  error: string | null;
  inferenceMs: number | null;
}

const INITIAL_TASK_STATE: TaskRunState = {
  busy: false,
  reply: null,
  planSteps: [],
  steps: [],
  generatedFile: null,
  fileContent: null,
  error: null,
  inferenceMs: null,
};

const TASK_TABS: Array<{
  id: IsolatedTaskId;
  label: string;
  title: string;
  description: string;
  scope: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "apis",
    label: "بناء APIs",
    title: "بناء خوادم REST API واختبارها",
    description: "توليد واجهة برمجية كاملة بـ Python أو Node.js مع اختبارات وتنفيذ فوري.",
    scope: "create_fastapi_api",
    icon: Server,
  },
  {
    id: "databases",
    label: "قواعد SQLite",
    title: "تصميم قواعد بيانات SQLite",
    description: "بناء جداول وفهارس بحث مع استعلامات محمية واختبارات تكامل.",
    scope: "create_database_app",
    icon: Database,
  },
  {
    id: "security",
    label: "الأمان والمصادقة",
    title: "التشفير والمصادقة الآمنة",
    description: "توليد وحدة تجزئة كلمات المرور وتوكنات الجلسة الآمنة.",
    scope: "create_auth_security",
    icon: ShieldCheck,
  },
  {
    id: "algorithms",
    label: "الخوارزميات و C++",
    title: "الخوارزميات عالية الأداء",
    description: "توليد واختبار خوارزميات الفرز السريعة أو نوى C++ عالية الأداء.",
    scope: "create_algorithm_bench",
    icon: Cpu,
  },
  {
    id: "debugger",
    label: "فحص وإصلاح الأخطاء",
    title: "الفحص النحوي والتشخيص الشامل",
    description: "فحص ملفات المشروع وتشغيل الاختبارات لاكتشاف الأخطاء.",
    scope: "debug_and_fix",
    icon: Bug,
  },
  {
    id: "notes",
    label: "دفتر الملاحظات",
    title: "دفتر الملاحظات والمهام المحفوظة",
    description: "احفظ ملاحظاتك ومقتطفات الكود وأفكار مشاريعك في حسابك.",
    scope: "user_notes",
    icon: BookMarked,
  },
];

const DOMAINS = [
  { id: "المنتجات", label: "المنتجات" },
  { id: "الموظفين", label: "الموظفين" },
  { id: "الطلاب", label: "الطلاب" },
  { id: "الفواتير", label: "الفواتير" },
  { id: "الطلبات", label: "الطلبات" },
  { id: "المهام", label: "المهام" },
];

export default function TaskStudioView() {
  const { user, signInWithGoogle } = useUiSettings();
  const [activeTask, setActiveTask] = useState<IsolatedTaskId>("apis");

  const [taskStates, setTaskStates] = useState<Record<IsolatedTaskId, TaskRunState>>({
    apis: { ...INITIAL_TASK_STATE },
    databases: { ...INITIAL_TASK_STATE },
    security: { ...INITIAL_TASK_STATE },
    algorithms: { ...INITIAL_TASK_STATE },
    debugger: { ...INITIAL_TASK_STATE },
    notes: { ...INITIAL_TASK_STATE },
  });

  const [notes, setNotes] = useState<UserNoteItem[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const loadNotes = async () => {
    if (!user) {
      setNotes([]);
      return;
    }
    try {
      const headers = await getGoogleAuthHeaders();
      const res = await fetch("/api/sql/notes", { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.notes)) setNotes(data.notes);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadNotes();
  }, [user?.uid]);

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim() || noteBusy) return;
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setNoteBusy(true);
    try {
      const headers = await getGoogleAuthHeaders();
      const res = await fetch("/api/sql/notes", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: noteTitle, content: noteContent, category: "workspace" }),
      });
      if (res.ok) {
        setNoteTitle("");
        setNoteContent("");
        await loadNotes();
      }
    } finally {
      setNoteBusy(false);
    }
  };

  const handleDeleteNote = async (id: number) => {
    if (!user) return;
    const headers = await getGoogleAuthHeaders();
    const res = await fetch(`/api/sql/notes/${id}`, { method: "DELETE", headers });
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
    }
  };

  const [apiDomain, setApiDomain] = useState("المنتجات");
  const [apiRuntime, setApiRuntime] = useState<"python" | "node">("python");
  const [dbDomain, setDbDomain] = useState("المنتجات");
  const [customPrompts, setCustomPrompts] = useState<Record<IsolatedTaskId, string>>({
    apis: "",
    databases: "",
    security: "",
    algorithms: "",
    debugger: "",
    notes: "",
  });

  const currentTabMeta = TASK_TABS.find((t) => t.id === activeTask)!;
  const currentState = taskStates[activeTask];

  const executeIsolatedTask = async (taskId: IsolatedTaskId, prompt: string, scope: string) => {
    setTaskStates((prev) => ({
      ...prev,
      [taskId]: { ...prev[taskId], busy: true, error: null },
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          session_id: `isolated_task_${taskId}`,
          taskScope: scope,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "تعذر تنفيذ المهمة");

      const targetFile: string | null = data.activeContext?.lastFile || null;
      let fileContent: string | null = null;
      if (targetFile) {
        try {
          const fRes = await fetch(`/api/file?path=${encodeURIComponent(targetFile)}`);
          if (fRes.ok) {
            const fData = await fRes.json();
            fileContent = fData.content;
          }
        } catch {
          // ignore
        }
      }

      setTaskStates((prev) => ({
        ...prev,
        [taskId]: {
          busy: false,
          reply: data.reply,
          planSteps: data.planSteps || [],
          steps: data.steps || [],
          generatedFile: targetFile,
          fileContent,
          error: null,
          inferenceMs: data.prediction?.wasmInferenceMs ?? null,
        },
      }));
    } catch (err) {
      setTaskStates((prev) => ({
        ...prev,
        [taskId]: {
          ...prev[taskId],
          busy: false,
          error: err instanceof Error ? err.message : "خطأ غير متوقع",
        },
      }));
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="border-b pb-5" style={{ borderColor: "var(--nawa-border)" }}>
        <h1 className="font-display text-2xl font-bold" style={{ textWrap: "balance" }}>
          استوديو المهام البرمجية
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: "var(--nawa-muted)" }}>
          اختر المهمة المطلوبة لتوليد الكود واختباره عملياً في مساحة مستقلة.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--nawa-border)" }}>
          {TASK_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTask === tab.id;
            const hasDone = Boolean(taskStates[tab.id].reply);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTask(tab.id)}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                style={{
                  backgroundColor: active ? "var(--nawa-accent)" : "var(--nawa-surface)",
                  borderColor: active ? "var(--nawa-accent)" : "var(--nawa-border)",
                  color: active ? "#FFFFFF" : "var(--nawa-text)",
                }}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {hasDone && !active && <span className="text-[11px] opacity-75">· منجز</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
        <div
          className="space-y-5 rounded-2xl border p-5"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div>
            <h2 className="text-base font-semibold">{currentTabMeta.title}</h2>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
              {currentTabMeta.description}
            </p>
          </div>

          <div className="space-y-4 border-t pt-4" style={{ borderColor: "var(--nawa-border)" }}>
            {activeTask === "apis" && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--nawa-muted)" }}>
                    مجال البيانات (Entity)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {DOMAINS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setApiDomain(d.id)}
                        className="rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: apiDomain === d.id ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                          borderColor: apiDomain === d.id ? "var(--nawa-accent)" : "var(--nawa-border)",
                          color: apiDomain === d.id ? "var(--nawa-accent)" : "var(--nawa-text)",
                        }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--nawa-muted)" }}>
                    بيئة التشغيل
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["python", "node"] as const).map((rt) => (
                      <button
                        key={rt}
                        type="button"
                        onClick={() => setApiRuntime(rt)}
                        className="rounded-lg border px-3 py-2 text-xs font-medium"
                        style={{
                          backgroundColor: apiRuntime === rt ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                          borderColor: apiRuntime === rt ? "var(--nawa-accent)" : "var(--nawa-border)",
                          color: apiRuntime === rt ? "var(--nawa-accent)" : "var(--nawa-text)",
                        }}
                      >
                        {rt === "python" ? "Python HTTP + unittest" : "Node.js + node:test"}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={currentState.busy}
                  onClick={() =>
                    executeIsolatedTask(
                      "apis",
                      `اعملي API لـ ${apiDomain} بـ ${apiRuntime === "node" ? "Node.js" : "Python"} واختبره`,
                      "create_fastapi_api"
                    )
                  }
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "var(--nawa-accent)" }}
                >
                  <Play className="h-4 w-4" />
                  <span>{currentState.busy ? "جاري البناء والاختبار..." : "بناء واختبار الـ API"}</span>
                </button>
              </>
            )}

            {activeTask === "databases" && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--nawa-muted)" }}>
                    الكيان (Table Schema)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {DOMAINS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDbDomain(d.id)}
                        className="rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors"
                        style={{
                          backgroundColor: dbDomain === d.id ? "var(--nawa-accent-soft)" : "var(--nawa-elevated)",
                          borderColor: dbDomain === d.id ? "var(--nawa-accent)" : "var(--nawa-border)",
                          color: dbDomain === d.id ? "var(--nawa-accent)" : "var(--nawa-text)",
                        }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={currentState.busy}
                  onClick={() =>
                    executeIsolatedTask(
                      "databases",
                      `اعملي قاعدة بيانات SQLite لـ ${dbDomain} واختبرها`,
                      "create_database_app"
                    )
                  }
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "var(--nawa-accent)" }}
                >
                  <Play className="h-4 w-4" />
                  <span>{currentState.busy ? "جاري الإنشاء والاختبار..." : "إنشاء قاعدة SQLite واختبارها"}</span>
                </button>
              </>
            )}

            {activeTask === "security" && (
              <button
                type="button"
                disabled={currentState.busy}
                onClick={() =>
                  executeIsolatedTask(
                    "security",
                    "سويلي نظام مصادقة وتشفير كلمات المرور PBKDF2 وتوكنات HMAC واختبره",
                    "create_auth_security"
                  )
                }
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                <Play className="h-4 w-4" />
                <span>{currentState.busy ? "جاري التوليد والاختبار..." : "توليد وحدة الأمان واختبارها"}</span>
              </button>
            )}

            {activeTask === "algorithms" && (
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={currentState.busy}
                  onClick={() =>
                    executeIsolatedTask(
                      "algorithms",
                      "اعمل خوارزمية فرز سريعة واختبرها على 100 الف عنصر",
                      "create_algorithm_bench"
                    )
                  }
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "var(--nawa-accent)" }}
                >
                  <Play className="h-4 w-4" />
                  <span>{currentState.busy ? "جاري التنفيذ..." : "بناء واختبار خوارزمية الفرز"}</span>
                </button>
                <button
                  type="button"
                  disabled={currentState.busy}
                  onClick={() =>
                    executeIsolatedTask(
                      "algorithms",
                      "اكتب دالة C++ سريعة لضرب المتجهات بتعليمات AVX2",
                      "generate_native_kernel"
                    )
                  }
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                >
                  <Cpu className="h-4 w-4" style={{ color: "var(--nawa-accent)" }} />
                  <span>توليد كود C++ AVX2</span>
                </button>
              </div>
            )}

            {activeTask === "debugger" && (
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={currentState.busy}
                  onClick={() =>
                    executeIsolatedTask("debugger", "افحص ملفات المشروع وشوف لو فيها اخطاء", "debug_and_fix")
                  }
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "var(--nawa-accent)" }}
                >
                  <Play className="h-4 w-4" />
                  <span>{currentState.busy ? "جاري الفحص..." : "فحص نحوّي وتشغيل كل الاختبارات"}</span>
                </button>
                <button
                  type="button"
                  disabled={currentState.busy}
                  onClick={() =>
                    executeIsolatedTask("debugger", "اشرحلي معمارية المشروع واحصائيات الملفات", "explain_architecture")
                  }
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                >
                  <span>تحليل إحصائيات وهيكلة الكود</span>
                </button>
              </div>
            )}

            {activeTask === "notes" && (
              <form onSubmit={(e) => void handleSaveNote(e)} className="space-y-3">
                {!user && (
                  <p className="text-xs" style={{ color: "var(--nawa-muted)" }}>
                    سجّل الدخول بحساب Google لحفظ ملاحظاتك ومزامنتها عبر جلساتك.
                  </p>
                )}
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="عنوان الملاحظة..."
                  className="h-10 w-full rounded-xl border px-3 text-xs focus:outline-none"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                />
                <textarea
                  rows={4}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="اكتب الملاحظة أو خطة العمل أو مقتطف الكود..."
                  className="w-full rounded-xl border p-3 text-xs focus:outline-none"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                    color: "var(--nawa-text)",
                  }}
                />
                <button
                  type="submit"
                  disabled={noteBusy || !noteTitle.trim() || !noteContent.trim()}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--nawa-accent)" }}
                >
                  <Plus className="h-4 w-4" />
                  <span>{user ? (noteBusy ? "جاري الحفظ..." : "حفظ الملاحظة") : "دخول Google للحفظ"}</span>
                </button>
              </form>
            )}

            {activeTask !== "notes" && (
              <form
                className="space-y-2 border-t pt-4"
                style={{ borderColor: "var(--nawa-border)" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = customPrompts[activeTask].trim();
                  if (!text || currentState.busy) return;
                  executeIsolatedTask(activeTask, text, currentTabMeta.scope);
                }}
              >
                <label className="block text-xs" style={{ color: "var(--nawa-muted)" }}>
                  أو اكتب أمراً مخصصاً داخل نطاق هذه المهمة:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customPrompts[activeTask]}
                    onChange={(e) => setCustomPrompts((prev) => ({ ...prev, [activeTask]: e.target.value }))}
                    placeholder="أمر باللهجة العربية..."
                    className="flex-1 rounded-xl border px-3 py-2 text-xs focus:outline-none"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                      color: "var(--nawa-text)",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={currentState.busy || !customPrompts[activeTask].trim()}
                    className="rounded-xl border px-3 py-2 text-xs font-medium disabled:opacity-40"
                    style={{
                      backgroundColor: "var(--nawa-elevated)",
                      borderColor: "var(--nawa-border)",
                      color: "var(--nawa-text)",
                    }}
                  >
                    تنفيذ
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div
          className="space-y-5 rounded-2xl border p-5"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          {currentState.error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
              {currentState.error}
            </div>
          )}

          {activeTask === "notes" ? (
            <div className="space-y-3">
              <div className="text-xs font-bold" style={{ color: "var(--nawa-muted)" }}>
                ملاحظاتك المحفوظة ({notes.length})
              </div>
              {notes.length === 0 ? (
                <div
                  className="flex min-h-[260px] flex-col items-center justify-center text-center text-xs"
                  style={{ color: "var(--nawa-muted)" }}
                >
                  <BookMarked className="mb-2.5 h-8 w-8 opacity-40" />
                  <p>لا توجد ملاحظات محفوظة بعد.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border p-3.5 space-y-1.5"
                      style={{
                        backgroundColor: "var(--nawa-elevated)",
                        borderColor: "var(--nawa-border)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{n.title}</span>
                        <button
                          type="button"
                          aria-label="حذف الملاحظة"
                          onClick={() => void handleDeleteNote(n.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--nawa-muted)" }}>
                        {n.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !currentState.reply && !currentState.busy ? (
            <div
              className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-sm"
              style={{ color: "var(--nawa-muted)" }}
            >
              <Terminal className="mb-3 h-8 w-8 opacity-40" />
              <p>هذه المساحة مخصصة لمخرجات مهمة «{currentTabMeta.label}» فقط.</p>
              <p className="mt-1 text-xs opacity-75">
                اضغط على زر التنفيذ لتوليد الكود واختباره فعلياً في بيئة العمل.
              </p>
            </div>
          ) : currentState.busy ? (
            <div className="space-y-3 py-8">
              <div className="h-6 w-1/2 rounded-lg" style={{ backgroundColor: "var(--nawa-elevated)" }} />
              <div className="h-32 rounded-lg" style={{ backgroundColor: "var(--nawa-elevated)" }} />
            </div>
          ) : (
            <div className="space-y-4">
              {currentState.generatedFile && (
                <div
                  className="flex flex-wrap items-center gap-2 border-b pb-2 text-xs"
                  style={{ borderColor: "var(--nawa-border)", color: "var(--nawa-muted)" }}
                >
                  <span>القسم: {currentTabMeta.label}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-semibold" style={{ color: "var(--nawa-accent)" }} dir="ltr">
                    {currentState.generatedFile}
                  </span>
                </div>
              )}

              {currentState.planSteps.length > 0 && (
                <div
                  className="rounded-xl border p-3 text-xs"
                  style={{
                    backgroundColor: "var(--nawa-elevated)",
                    borderColor: "var(--nawa-border)",
                  }}
                >
                  <div className="mb-1 font-semibold" style={{ color: "var(--nawa-accent)" }}>
                    خطوات التنفيذ
                  </div>
                  <ol className="list-inside list-decimal space-y-0.5" style={{ color: "var(--nawa-muted)" }}>
                    {currentState.planSteps.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}

              {currentState.steps.length > 0 && (
                <div className="space-y-2" dir="ltr">
                  {currentState.steps
                    .filter((s) => s.tool === "run_command")
                    .map((s, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border p-3 text-left"
                        style={{
                          backgroundColor: "var(--nawa-code-bg)",
                          color: "var(--nawa-code-text)",
                          borderColor: "var(--nawa-border)",
                        }}
                      >
                        <div className="font-mono text-[11px] font-semibold text-emerald-400">
                          $ {JSON.parse(s.arguments).command}
                        </div>
                        <pre className="mt-1.5 max-h-48 overflow-auto font-mono text-[11px] opacity-90">
                          {s.output}
                        </pre>
                      </div>
                    ))}
                </div>
              )}

              {currentState.fileContent && (
                <div
                  className="overflow-hidden rounded-xl border"
                  style={{
                    backgroundColor: "var(--nawa-code-bg)",
                    color: "var(--nawa-code-text)",
                    borderColor: "var(--nawa-border)",
                  }}
                >
                  <div
                    dir="ltr"
                    className="flex items-center gap-2 border-b px-3 py-2 font-mono text-xs opacity-80"
                    style={{ borderColor: "rgba(255,255,255,0.1)" }}
                  >
                    <FileCode2 className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
                    <span>{currentState.generatedFile}</span>
                  </div>
                  <pre dir="ltr" className="max-h-80 overflow-auto p-3 text-left font-mono text-xs leading-relaxed">
                    {currentState.fileContent}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
