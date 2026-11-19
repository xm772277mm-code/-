import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  auth,
  getCurrentMonthKey,
  getGoogleAuthHeaders,
  saveUserSettingsToFirestore,
  signInWithGoogleAccount,
  signOutGoogleAccount,
  subscribeUserChats,
  subscribeUserMonthlyUsage,
  syncUserProfileToFirestore,
  type CloudChatThread,
  type UiSettings,
  type UserMonthlyUsage,
} from "../firebase.ts";

export interface DailyQuotaSnapshot {
  dayKey: string;
  requestsToday: number;
  tokensToday: number;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  remainingRequests: number;
  remainingTokens: number;
}

const STORAGE_KEY = "nawa_ui_settings_v2";

function detectDefaultDeviceProfile(): "desktop-50b" | "mobile-50m" {
  if (typeof window === "undefined") return "desktop-50b";
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const isNarrow = window.innerWidth > 0 && window.innerWidth < 768;
  return isMobileUa || isNarrow ? "mobile-50m" : "desktop-50b";
}

export function getDefaultUiSettings(): UiSettings {
  return {
    themePreset: "claude-light",
    accentColor: "hydrogen",
    fontFamily: "editorial",
    fontSize: "md",
    density: "comfortable",
    deviceProfile: detectDefaultDeviceProfile(),
    direction: "rtl",
  };
}

interface UiSettingsContextValue {
  settings: UiSettings;
  updateSettings: (patch: Partial<UiSettings>) => void;
  resetSettings: () => void;
  user: User | null;
  authReady: boolean;
  authError: string | null;
  signingIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  cloudChats: CloudChatThread[];
  cloudStatus: string | null;
  monthlyUsage: UserMonthlyUsage | null;
  dailyQuota: DailyQuotaSnapshot | null;
  refreshDailyQuota: () => Promise<void>;
}

const UiSettingsContext = createContext<UiSettingsContextValue | null>(null);

const THEME_PALETTES = {
  "claude-light": {
    isDark: false,
    bg: "#F8FAFC",
    sidebar: "#F1F5F9",
    surface: "#FFFFFF",
    elevated: "#F1F5F9",
    border: "rgba(15, 23, 42, 0.10)",
    text: "#0F172A",
    muted: "#475569",
    userBubble: "#E2E8F0",
    codeBg: "#0F172A",
    codeText: "#F8FAFC",
  },
  "claude-dark": {
    isDark: true,
    bg: "#131720",
    sidebar: "#0E1118",
    surface: "#1B212E",
    elevated: "#232B3A",
    border: "rgba(226, 232, 240, 0.11)",
    text: "#F1F5F9",
    muted: "#94A3B8",
    userBubble: "#252F42",
    codeBg: "#0B0E14",
    codeText: "#E2E8F0",
  },
  midnight: {
    isDark: true,
    bg: "#0B0F17",
    sidebar: "#080B11",
    surface: "#121824",
    elevated: "#1A2232",
    border: "rgba(226, 232, 240, 0.11)",
    text: "#EEF2F7",
    muted: "#94A3B8",
    userBubble: "#1E293B",
    codeBg: "#07090E",
    codeText: "#E2E8F0",
  },
  sand: {
    isDark: false,
    bg: "#F7F3EA",
    sidebar: "#EFE9DC",
    surface: "#FFFDF9",
    elevated: "#EFE8DA",
    border: "rgba(42, 33, 22, 0.11)",
    text: "#241C13",
    muted: "#5E503F",
    userBubble: "#E8DFCF",
    codeBg: "#1F1912",
    codeText: "#F5EFE4",
  },
};

const ACCENT_PALETTES = {
  terracotta: { main: "#C96442", hover: "#B45333", soft: "rgba(201, 100, 66, 0.12)" },
  hydrogen: { main: "#2563EB", hover: "#1D4ED8", soft: "rgba(37, 99, 235, 0.11)" },
  emerald: { main: "#059669", hover: "#047857", soft: "rgba(5, 150, 105, 0.11)" },
  plum: { main: "#7C3AED", hover: "#6D28D9", soft: "rgba(124, 58, 237, 0.11)" },
};

const FONT_PRESETS = {
  editorial: {
    display: "'Noto Naskh Arabic', 'Readex Pro', 'IBM Plex Sans Arabic', Georgia, serif",
    body: "'IBM Plex Sans Arabic', 'Noto Naskh Arabic', system-ui, sans-serif",
  },
  modern: {
    display: "'Readex Pro', 'IBM Plex Sans Arabic', system-ui, sans-serif",
    body: "'IBM Plex Sans Arabic', 'Readex Pro', system-ui, sans-serif",
  },
  technical: {
    display: "'Readex Pro', 'JetBrains Mono', monospace",
    body: "'IBM Plex Sans Arabic', 'JetBrains Mono', sans-serif",
  },
};

export function UiSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UiSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...getDefaultUiSettings(), ...JSON.parse(saved) };
      }
    } catch {
      // ignore storage errors
    }
    return getDefaultUiSettings();
  });

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [cloudChats, setCloudChats] = useState<CloudChatThread[]>([]);
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<UserMonthlyUsage | null>(null);
  const [dailyQuota, setDailyQuota] = useState<DailyQuotaSnapshot | null>(null);

  const refreshDailyQuota = async () => {
    if (!auth.currentUser) {
      setDailyQuota(null);
      return;
    }
    try {
      const headers = await getGoogleAuthHeaders();
      const res = await fetch("/api/billing/account-usage", { headers });
      if (res.ok) {
        const data = await res.json();
        if (data?.quota) {
          setDailyQuota(data.quota as DailyQuotaSnapshot);
        }
      }
    } catch {
      // ignore transient network errors
    }
  };

  // Apply CSS variables & Tailwind dark class cleanly
  useEffect(() => {
    const root = document.documentElement;
    const theme = THEME_PALETTES[settings.themePreset] || THEME_PALETTES["claude-light"];
    const accent = ACCENT_PALETTES[settings.accentColor] || ACCENT_PALETTES.terracotta;
    const fonts = FONT_PRESETS[settings.fontFamily] || FONT_PRESETS.editorial;

    if (theme.isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    root.dir = settings.direction;
    root.lang = settings.direction === "rtl" ? "ar" : "en";

    root.style.setProperty("--nawa-bg", theme.bg);
    root.style.setProperty("--nawa-sidebar", theme.sidebar);
    root.style.setProperty("--nawa-surface", theme.surface);
    root.style.setProperty("--nawa-elevated", theme.elevated);
    root.style.setProperty("--nawa-border", theme.border);
    root.style.setProperty("--nawa-text", theme.text);
    root.style.setProperty("--nawa-muted", theme.muted);
    root.style.setProperty("--nawa-user-bubble", theme.userBubble);
    root.style.setProperty("--nawa-code-bg", theme.codeBg);
    root.style.setProperty("--nawa-code-text", theme.codeText);
    root.style.setProperty("--nawa-accent", accent.main);
    root.style.setProperty("--nawa-accent-hover", accent.hover);
    root.style.setProperty("--nawa-accent-soft", accent.soft);
    root.style.setProperty("--font-display", fonts.display);
    root.style.setProperty("--font-sans", fonts.body);

    const fontPx = settings.fontSize === "sm" ? "14px" : settings.fontSize === "lg" ? "17px" : "15.5px";
    root.style.setProperty("--nawa-font-size", fontPx);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Listen to Firebase Auth state & sync user profile + recent chats + usage
  useEffect(() => {
    let unsubChats: (() => void) | null = null;
    let unsubUsage: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (unsubChats) {
        unsubChats();
        unsubChats = null;
      }
      if (unsubUsage) {
        unsubUsage();
        unsubUsage = null;
      }

      if (currentUser) {
        try {
          setCloudStatus("جاري مزامنة الإعدادات...");
          const synced = await syncUserProfileToFirestore(currentUser, settings);
          setSettings(synced);
          setCloudStatus("متصل بحساب Google");
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          setCloudStatus(
            msg.includes("offline")
              ? "وضع العمل المؤقت (بانتظار اتصال السحابة)"
              : "تعذرت مزامنة الإعدادات السحابية"
          );
        }
        unsubChats = subscribeUserChats(
          currentUser.uid,
          (list) => setCloudChats(list),
          (err) => {
            const msg = err?.message || "";
            setCloudStatus(
              msg.includes("offline")
                ? "وضع العمل المؤقت (بانتظار اتصال السحابة)"
                : "تعذر تحديث قائمة المحادثات السحابية"
            );
          }
        );
        unsubUsage = subscribeUserMonthlyUsage(
          currentUser.uid,
          getCurrentMonthKey(),
          (usage) => setMonthlyUsage(usage)
        );
        void refreshDailyQuota();
      } else {
        setCloudChats([]);
        setCloudStatus(null);
        setMonthlyUsage(null);
        setDailyQuota(null);
      }
    });

    return () => {
      unsubAuth();
      if (unsubChats) unsubChats();
      if (unsubUsage) unsubUsage();
    };
  }, []);

  const updateSettings = (patch: Partial<UiSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (auth.currentUser) {
        void saveUserSettingsToFirestore(auth.currentUser, next).catch(() => null);
      }
      return next;
    });
  };

  const resetSettings = () => {
    const def = getDefaultUiSettings();
    setSettings(def);
    if (auth.currentUser) {
      void saveUserSettingsToFirestore(auth.currentUser, def).catch(() => null);
    }
  };

  const signInWithGoogle = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogleAccount();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "تعذر إتمام تسجيل الدخول بجوجل");
    } finally {
      setSigningIn(false);
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    await signOutGoogleAccount();
  };

  return (
    <UiSettingsContext.Provider
      value={{
        settings,
        updateSettings,
        resetSettings,
        user,
        authReady,
        authError,
        signingIn,
        signInWithGoogle,
        signOutUser,
        cloudChats,
        cloudStatus,
        monthlyUsage,
        dailyQuota,
        refreshDailyQuota,
      }}
    >
      {children}
    </UiSettingsContext.Provider>
  );
}

export function useUiSettings() {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) throw new Error("useUiSettings must be used inside UiSettingsProvider");
  return ctx;
}
