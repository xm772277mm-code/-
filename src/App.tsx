import React, { useState } from "react";
import {
  Bot,
  Box,
  Cpu,
  FolderKanban,
  Gauge,
  LogIn,
  LogOut,
  Menu,
  MessageSquarePlus,
  Monitor,
  Music,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Smartphone,
  Trash2,
} from "lucide-react";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { UiSettingsProvider, useUiSettings } from "./contexts/UiSettingsContext.tsx";
import OfflineChatView, { NawaSparkMark } from "./components/OfflineChatView.tsx";
import AgentWorkspaceView from "./components/AgentWorkspaceView.tsx";
import TaskStudioView from "./components/TaskStudioView.tsx";
import BenchmarkView from "./components/BenchmarkView.tsx";
import ModelAndPackagingView from "./components/ModelAndPackagingView.tsx";
import ThreeStudioView from "./components/ThreeStudioView.tsx";
import LyriaMusicStudioView from "./components/LyriaMusicStudioView.tsx";
import UiCustomizerModal from "./components/UiCustomizerModal.tsx";
import AppOpenAdOverlay from "./components/AppOpenAdOverlay.tsx";
import { useAppOpenAds } from "./hooks/useAppOpenAds.ts";
import { deleteCloudChatThread } from "./firebase.ts";

type ActiveTab = "chat" | "ide" | "tasks" | "benchmark" | "model" | "three" | "music";

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
    settings,
    updateSettings,
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
  const appOpenAds = useAppOpenAds();

  const [activeChatId, setActiveChatId] = useState<string>(() => "chat_" + Date.now());
  const [localThreads, setLocalThreads] = useState<LocalThread[]>(() => [
    { id: "chat_initial", title: "محادثة جديدة" },
  ]);

  // Keep initial activeChatId synced with localThreads[0] on guest mode
  const currentChatId = activeChatId === "chat_initial" ? localThreads[0]?.id || activeChatId : activeChatId;

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  }> = [
    { id: "chat", label: "المحادثة الذكية", icon: Bot },
    { id: "three", label: "استوديو 3D (Three.js)", icon: Box },
    { id: "music", label: "توليد الموسيقى (Lyria)", icon: Music },
    { id: "ide", label: "بيئة التطوير (IDE)", icon: FolderKanban },
    { id: "tasks", label: "استوديو المهام", icon: Cpu },
    { id: "benchmark", label: "اختبار 50M/ث", icon: Gauge },
    { id: "model", label: "النموذج والتصدير", icon: Package },
  ];

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
      return prev.map((t) => (t.id === currentChatId && t.title === "محادثة جديدة" ? { ...t, title } : t));
    });
  };

  const displayedThreads = user
    ? cloudChats.map((c) => ({ id: c.id, title: c.title }))
    : localThreads;

  const isDesktopKB = settings.deviceProfile === "desktop-50b";

  const sidebarContent = (
    <div
      className="flex h-full w-[268px] flex-col border-l select-none"
      style={{
        backgroundColor: "var(--nawa-sidebar)",
        borderColor: "var(--nawa-border)",
        color: "var(--nawa-text)",
      }}
    >
      {/* Brand + Collapse */}
      <div className="flex h-14 items-center justify-between px-4">
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0"
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:opacity-75"
          style={{ color: "var(--nawa-muted)" }}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Primary New Chat CTA */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={startNewChat}
          className="flex h-10 w-full items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors whitespace-nowrap"
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

      {/* Workspace Navigation */}
      <div className="px-3 space-y-0.5">
        <div className="px-2 pb-1 text-[11px] font-semibold" style={{ color: "var(--nawa-muted)" }}>
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
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap"
              style={{
                backgroundColor: active ? "var(--nawa-elevated)" : "transparent",
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

      {/* Recent Conversations */}
      <div className="mt-4 flex-1 overflow-y-auto px-3">
        <div className="px-2 pb-1.5 text-[11px] font-semibold" style={{ color: "var(--nawa-muted)" }}>
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
                  className="group flex items-center justify-between gap-1 rounded-xl px-2.5 py-2 text-xs transition-colors"
                  style={{
                    backgroundColor: isCurrent ? "var(--nawa-elevated)" : "transparent",
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
                      className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
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

      {/* Sidebar Bottom: KB Profile Toggle + UI Customizer + Google Auth */}
      <div
        className="border-t p-3 space-y-2"
        style={{ borderColor: "var(--nawa-border)" }}
      >
        {/* Quick Device KB Tier Switch */}
        <button
          type="button"
          onClick={() =>
            updateSettings({
              deviceProfile: isDesktopKB ? "mobile-50m" : "desktop-50b",
            })
          }
          className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs transition-colors"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
          }}
        >
          <span className="flex items-center gap-2">
            {isDesktopKB ? (
              <Monitor className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
            ) : (
              <Smartphone className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
            )}
            <span className="font-medium">
              {isDesktopKB ? "كمبيوتر · 50 مليار سؤال" : "هاتف · 50 مليون سؤال"}
            </span>
          </span>
          <span className="text-[11px]" style={{ color: "var(--nawa-accent)" }}>
            تبديل
          </span>
        </button>

        {/* Customize UI Button */}
        <button
          type="button"
          onClick={() => setCustomizerOpen(true)}
          className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors"
          style={{
            backgroundColor: "var(--nawa-surface)",
            borderColor: "var(--nawa-border)",
            color: "var(--nawa-text)",
          }}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
          <span>تخصيص واجهة المستخدم</span>
        </button>

        {/* Google Account Auth */}
        {user ? (
          <div
            className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
            style={{
              backgroundColor: "var(--nawa-surface)",
              borderColor: "var(--nawa-border)",
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "صورة الحساب"}
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
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
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:text-red-500"
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
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-60"
            style={{
              backgroundColor: "var(--nawa-surface)",
              borderColor: "var(--nawa-border)",
              color: "var(--nawa-text)",
            }}
          >
            <GoogleGlyph />
            <span>{signingIn ? "جاري تسجيل الدخول..." : "تسجيل الدخول بحساب Google"}</span>
          </button>
        )}

        {authError && (
          <div className="px-1 text-[11px] text-red-500">{authError}</div>
        )}
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
      {/* Desktop Sidebar */}
      {sidebarOpen && <aside className="hidden h-full shrink-0 lg:block">{sidebarContent}</aside>}

      {/* Mobile Slide-Over Drawer */}
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

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Clean 3-Zone Top Header */}
        <header
          className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-6"
          style={{
            backgroundColor: "var(--nawa-bg)",
            borderColor: "var(--nawa-border)",
          }}
        >
          {/* Zone 1: Sidebar Trigger & Active Brand/View Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 1024) setMobileDrawerOpen(true);
                else setSidebarOpen((v) => !v);
              }}
              aria-label="القائمة الجانبية"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors"
              style={{
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-text)",
              }}
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

            <span className="font-display text-sm font-bold truncate whitespace-nowrap">
              {navItems.find((n) => n.id === activeTab)?.label || "نواة"}
            </span>
          </div>

          {/* Zone 2: Concise Cloud Engine & Hosting Indicator */}
          <div className="hidden md:flex items-center gap-2 text-xs whitespace-nowrap" style={{ color: "var(--nawa-muted)" }}>
            <span>Gemini 4 Hydrogen</span>
            <span aria-hidden="true">·</span>
            <span>متصل بالإنترنت (Google Cloud &amp; Firebase)</span>
          </div>

          {/* Zone 3: Single Primary Action (Customize or Google Sign-In) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCustomizerOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              style={{
                backgroundColor: "var(--nawa-surface)",
                borderColor: "var(--nawa-border)",
                color: "var(--nawa-text)",
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" style={{ color: "var(--nawa-accent)" }} />
              <span className="hidden sm:inline">تخصيص الواجهة</span>
            </button>

            {!user && (
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void signInWithGoogle()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white transition-opacity whitespace-nowrap shrink-0 disabled:opacity-60"
                style={{ backgroundColor: "var(--nawa-accent)" }}
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>دخول Google</span>
              </button>
            )}
          </div>
        </header>

        {/* Active Tab Viewport */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === "chat" && (
            <OfflineChatView chatId={currentChatId} onTitleUpdate={handleThreadTitleUpdate} />
          )}
          {activeTab === "three" && <ThreeStudioView />}
          {activeTab === "music" && <LyriaMusicStudioView />}
          {activeTab === "ide" && <AgentWorkspaceView />}
          {activeTab === "tasks" && <TaskStudioView />}
          {activeTab === "benchmark" && <BenchmarkView />}
          {activeTab === "model" && <ModelAndPackagingView />}
        </main>
      </div>

      <UiCustomizerModal
        open={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        adConfig={appOpenAds.config}
        onUpdateAdConfig={appOpenAds.updateConfig}
        onPreviewAppOpenAd={appOpenAds.showPreviewAd}
      />

      <AppOpenAdOverlay
        open={appOpenAds.visible}
        creative={appOpenAds.creative}
        adConfig={appOpenAds.config}
        onDismiss={appOpenAds.dismissAd}
        onAdClick={appOpenAds.recordClick}
      />
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
