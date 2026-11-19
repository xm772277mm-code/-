import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Box,
  Cpu,
  Gamepad2,
  Gauge,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { UiSettingsProvider, useUiSettings } from "./contexts/UiSettingsContext.tsx";
import OfflineChatView, { NawaSparkMark } from "./components/OfflineChatView.tsx";
import GoogleMapsView from "./components/GoogleMapsView.tsx";
import MediaStudioView from "./components/MediaStudioView.tsx";
import LiveVoiceView from "./components/LiveVoiceView.tsx";
import GameStudioView from "./components/GameStudioView.tsx";
import ThreeStudioView from "./components/ThreeStudioView.tsx";
import TaskStudioView from "./components/TaskStudioView.tsx";
import ModelAndPackagingView from "./components/ModelAndPackagingView.tsx";
import UiCustomizerModal from "./components/UiCustomizerModal.tsx";
import { deleteCloudChatThread } from "./firebase.ts";

type ActiveTab = "chat" | "maps" | "media" | "voice" | "game" | "three" | "tasks" | "engine";

interface LocalThread {
  id: string;
  title: string;
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.29V6.61H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4 3.1C6.23 6.87 8.88 4.76 12 4.76Z"
      />
    </svg>
  );
}

function ClaudeWorkspaceShell() {
  const {
    user,
    signingIn,
    authError,
    signInWithGoogle,
    signOutUser,
    cloudChats,
  } = useUiSettings();

  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [activeChatId, setActiveChatId] = useState<string>(() => "chat_" + Date.now());
  const [localThreads, setLocalThreads] = useState<LocalThread[]>(() => [
    { id: "chat_initial", title: "محادثة جديدة" },
  ]);

  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener("gmp-quota-exceeded", onQuota);
    return () => window.removeEventListener("gmp-quota-exceeded", onQuota);
  }, []);

  const currentChatId =
    activeChatId === "chat_initial" ? localThreads[0]?.id || activeChatId : activeChatId;

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  }> = [
    { id: "chat", label: "المحادثة الذكية", shortLabel: "المحادثة", icon: Bot },
    { id: "maps", label: "خرائط Google والمسارات", shortLabel: "الخرائط", icon: MapPin },
    { id: "media", label: "الصور والفيديو والموسيقى", shortLabel: "الوسائط", icon: Sparkles },
    { id: "voice", label: "المحادثة الصوتية المباشرة", shortLabel: "الصوت المباشر", icon: PhoneCall },
    { id: "game", label: "لعبة حارس النواة", shortLabel: "اللعبة", icon: Gamepad2 },
    { id: "three", label: "استوديو التصميم ثلاثي الأبعاد", shortLabel: "استوديو 3D", icon: Box },
    { id: "tasks", label: "المهام البرمجية والملاحظات", shortLabel: "المهام", icon: Cpu },
    { id: "engine", label: "النموذج المخصص وتصدير EXE / APK", shortLabel: "النموذج والتصدير", icon: Gauge },
  ];

  // Top Bar Contract: strictly 5 clean top navigation links
  const headerNavIds: ActiveTab[] = ["chat", "maps", "media", "game", "three"];

  const startNewChat = () => {
    const newId = "chat_" + Date.now();
    setLocalThreads((prev) => [{ id: newId, title: "محادثة جديدة" }, ...prev.slice(0, 14)]);
    setActiveChatId(newId);
    setActiveTab("chat");
    setMobileDrawerOpen(false);
  };

  const handleThreadTitleUpdate = (title: string) => {
    setLocalThreads((prev) => {
      const exists = prev.some((t) => t.id === currentChatId);
      if (!exists) return [{ id: currentChatId, title }, ...prev];
      return prev.map((t) =>
        t.id === currentChatId && t.title === "محادثة جديدة" ? { ...t, title } : t
      );
    });
  };

  const displayedThreads = user
    ? cloudChats.map((c) => ({ id: c.id, title: c.title }))
    : localThreads;

  const sidebarContent = (
    <div
      className="flex h-full w-[268px] flex-col border-l select-none"
      style={{
        backgroundColor: "var(--nawa-sidebar)",
        borderColor: "var(--nawa-border)",
        color: "var(--nawa-text)",
      }}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className="flex min-h-[40px] items-center gap-2.5 font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0"
        >
          <NawaSparkMark size={20} />
          <span>نواة</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSidebarOpen(false);
            setMobileDrawerOpen(false);
          }}
          aria-label="طي الشريط الجانبي"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:opacity-75"
          style={{ color: "var(--nawa-muted)" }}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={startNewChat}
          className="flex h-10 w-full items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition-colors whitespace-nowrap"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
            color: "var(--nawa-text)",
          }}
        >
          <MessageSquarePlus className="h-4 w-4 shrink-0" style={{ color: "var(--nawa-accent)" }} />
          <span>محادثة جديدة</span>
        </button>
      </div>

      <div className="px-3 space-y-0.5">
        <div className="px-2 pb-1 text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
          مساحة العمل
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileDrawerOpen(false);
              }}
              className="flex min-h-[38px] w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap"
              style={{
                backgroundColor: active ? "var(--nawa-surface)" : "transparent",
                color: active ? "var(--nawa-text)" : "var(--nawa-muted)",
              }}
            >
              <Icon
                className="h-4 w-4 shrink-0"
                style={{ color: active ? "var(--nawa-accent)" : "var(--nawa-muted)" }}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex-1 overflow-y-auto px-3">
        <div className="px-2 pb-1.5 text-xs font-semibold" style={{ color: "var(--nawa-muted)" }}>
          {user ? "محادثاتك السحابية" : "الجلسات الأخيرة"}
        </div>
        <div className="space-y-0.5">
          {displayedThreads.length === 0 ? (
            <div className="px-2 py-2 text-xs" style={{ color: "var(--nawa-muted)" }}>
              لا توجد محادثات محفوظة بعد.
            </div>
          ) : (
            displayedThreads.map((th) => {
              const isCurrent = activeTab === "chat" && currentChatId === th.id;
              return (
                <div
                  key={th.id}
                  className="group flex min-h-[38px] items-center justify-between gap-1 rounded-xl px-2.5 py-1.5 text-xs transition-colors"
                  style={{
                    backgroundColor: isCurrent ? "var(--nawa-surface)" : "transparent",
                    color: isCurrent ? "var(--nawa-text)" : "var(--nawa-muted)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveChatId(th.id);
                      setActiveTab("chat");
                      setMobileDrawerOpen(false);
                    }}
                    className="flex-1 truncate text-right"
                  >
                    {th.title}
                  </button>
                  {user && (
                    <button
                      type="button"
                      aria-label="حذف المحادثة"
                      onClick={() => void deleteCloudChatThread(user.uid, th.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div
        className="border-t p-3 space-y-1.5"
        style={{ borderColor: "var(--nawa-border)" }}
      >
        <button
          type="button"
          onClick={() => setCustomizerOpen(true)}
          className="flex min-h-[40px] w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors hover:opacity-85 whitespace-nowrap"
          style={{ color: "var(--nawa-text)" }}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" style={{ color: "var(--nawa-accent)" }} />
          <span>تخصيص المظهر والخطوط</span>
        </button>

        <div className="border-t pt-2" style={{ borderColor: "var(--nawa-border)" }}>
          {user ? (
            <div className="flex items-center justify-between gap-2 px-1 py-1">
              <div className="flex min-w-0 items-center gap-2">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "صورة الحساب"}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: "var(--nawa-accent)" }}
                  >
                    {(user.displayName || user.email || "N")[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">
                    {user.displayName || "مستخدم Google"}
                  </div>
                  <div className="truncate text-[11px]" style={{ color: "var(--nawa-muted)" }} dir="ltr">
                    {user.email}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void signOutUser()}
                aria-label="تسجيل الخروج"
                title="تسجيل الخروج"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:text-red-500"
                style={{ color: "var(--nawa-muted)" }}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void signInWithGoogle()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-60 whitespace-nowrap"
              style={{
                backgroundColor: "var(--nawa-surface)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-text)",
              }}
            >
              <GoogleGlyph />
              <span>{signingIn ? "جاري تسجيل الدخول..." : "دخول بحساب Google"}</span>
            </button>
          )}
        </div>

        {authError && <div className="px-1 text-xs text-red-600">{authError}</div>}
      </div>
    </div>
  );

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        backgroundColor: "var(--nawa-bg)",
        color: "var(--nawa-text)",
      }}
    >
      {sidebarOpen && <aside className="hidden h-full shrink-0 lg:block">{sidebarContent}</aside>}

      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-40 flex bg-black/45 lg:hidden"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div className="h-full" onClick={(e) => e.stopPropagation()}>
            {sidebarContent}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="flex h-14 shrink-0 items-center justify-between gap-8 border-b px-4 sm:px-6"
          style={{
            backgroundColor: "var(--nawa-bg)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 1024) setMobileDrawerOpen(true);
                else setSidebarOpen((v) => !v);
              }}
              aria-label="القائمة الجانبية"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:opacity-75"
              style={{ color: "var(--nawa-text)" }}
            >
              <span className="lg:hidden">
                <Menu className="h-4 w-4" />
              </span>
              <span className="hidden lg:inline">
                {sidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className="font-display text-base font-bold tracking-tight whitespace-nowrap shrink-0"
              style={{ color: "var(--nawa-text)" }}
            >
              NawaCore
            </button>
          </div>

          <nav className="hidden md:flex items-center gap-6 overflow-x-auto" aria-label="التنقل الرئيسي">
            {headerNavIds.map((tabId) => {
              const item = navItems.find((n) => n.id === tabId)!;
              const isActive = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setActiveTab(tabId)}
                  className="relative py-2 text-xs font-medium transition-colors hover:opacity-100 whitespace-nowrap shrink-0"
                  style={{
                    color: isActive ? "var(--nawa-text)" : "var(--nawa-muted)",
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  <span>{item.shortLabel}</span>
                  {isActive && (
                    <span
                      className="absolute inset-x-0 -bottom-[9px] h-[2px]"
                      style={{ backgroundColor: "var(--nawa-accent)" }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            {user ? (
              <button
                type="button"
                onClick={startNewChat}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                <span>محادثة جديدة</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void signInWithGoogle()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap shrink-0 disabled:opacity-60"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>دخول Google</span>
              </button>
            )}
          </div>
        </header>

        {/* Case A: Google Maps Demo Key Quota Exceeded Banner */}
        {mapsQuotaExceeded && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span>
                The Google Maps API key is currently out of quota. Please try again later or add your own Maps API key.
              </span>
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                Learn more
              </a>
            </div>
            <button
              type="button"
              onClick={() => setMapsQuotaExceeded(false)}
              className="rounded border border-amber-500/40 px-2 py-0.5 text-[11px] font-medium"
            >
              إغلاق
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          {activeTab === "chat" && (
            <OfflineChatView chatId={currentChatId} onTitleUpdate={handleThreadTitleUpdate} />
          )}
          {activeTab === "maps" && <GoogleMapsView />}
          {activeTab === "media" && <MediaStudioView />}
          {activeTab === "voice" && <LiveVoiceView />}
          {activeTab === "game" && <GameStudioView />}
          {activeTab === "three" && <ThreeStudioView />}
          {activeTab === "tasks" && <TaskStudioView />}
          {activeTab === "engine" && <ModelAndPackagingView />}
        </main>
      </div>

      <UiCustomizerModal open={customizerOpen} onClose={() => setCustomizerOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <UiSettingsProvider>
        <ClaudeWorkspaceShell />
      </UiSettingsProvider>
    </ErrorBoundary>
  );
}
