import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";
import type { DeviceKBProfile } from "./llm/NawaKnowledgeBase.ts";

const app = initializeApp(firebaseConfig);

let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = dbInstance;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
void testConnection();

export type ThemePreset = "claude-light" | "claude-dark" | "midnight" | "sand";
export type AccentPreset = "terracotta" | "hydrogen" | "emerald" | "plum";
export type FontPreset = "editorial" | "modern" | "technical";
export type FontSizePreset = "sm" | "md" | "lg";
export type DensityPreset = "comfortable" | "compact";
export type DirectionPreset = "rtl" | "ltr";

export interface UiSettings {
  themePreset: ThemePreset;
  accentColor: AccentPreset;
  fontFamily: FontPreset;
  fontSize: FontSizePreset;
  density: DensityPreset;
  deviceProfile: DeviceKBProfile;
  direction: DirectionPreset;
}

export interface CloudChatThread {
  id: string;
  ownerId: string;
  title: string;
  deviceProfile: DeviceKBProfile;
  activeTopic?: string;
}

export interface CloudChatMessage {
  id: string;
  ownerId: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  dialect?: string;
  kbTier?: DeviceKBProfile;
}

const VALID_ID_RE = /^[a-zA-Z0-9_\-]+$/;

function clampStr(val: string, maxLen: number): string {
  return val.trim().slice(0, maxLen);
}

export async function signInWithGoogleAccount(): Promise<User> {
  const res = await signInWithPopup(auth, googleProvider);
  return res.user;
}

export async function signOutGoogleAccount(): Promise<void> {
  await signOut(auth);
}

export async function syncUserProfileToFirestore(
  user: User,
  settings: UiSettings
): Promise<UiSettings> {
  if (!VALID_ID_RE.test(user.uid)) return settings;
  const userPath = `users/${user.uid}`;
  const ref = doc(db, "users", user.uid);

  try {
    const snap = await getDoc(ref);
    const displayName = clampStr(user.displayName || "مستخدم نواة", 100) || "مستخدم نواة";
    const email = clampStr(user.email || "user@nawa.local", 150);
    const photoURL = user.photoURL ? clampStr(user.photoURL, 500) : undefined;

    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        uid: user.uid,
        displayName,
        email,
        themePreset: settings.themePreset,
        accentColor: settings.accentColor,
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        density: settings.density,
        deviceProfile: settings.deviceProfile,
        direction: settings.direction,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoURL) payload.photoURL = photoURL;
      await setDoc(ref, payload);
      return settings;
    }

    const data = snap.data();
    return {
      themePreset: data.themePreset || settings.themePreset,
      accentColor: data.accentColor || settings.accentColor,
      fontFamily: data.fontFamily || settings.fontFamily,
      fontSize: data.fontSize || settings.fontSize,
      density: data.density || settings.density,
      deviceProfile: data.deviceProfile || settings.deviceProfile,
      direction: data.direction || settings.direction,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function saveUserSettingsToFirestore(
  user: User,
  settings: UiSettings
): Promise<void> {
  if (!VALID_ID_RE.test(user.uid)) return;
  const userPath = `users/${user.uid}`;
  const ref = doc(db, "users", user.uid);
  const displayName = clampStr(user.displayName || "مستخدم نواة", 100) || "مستخدم نواة";
  const email = clampStr(user.email || "user@nawa.local", 150);
  const photoURL = user.photoURL ? clampStr(user.photoURL, 500) : undefined;

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        uid: user.uid,
        displayName,
        email,
        themePreset: settings.themePreset,
        accentColor: settings.accentColor,
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        density: settings.density,
        deviceProfile: settings.deviceProfile,
        direction: settings.direction,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoURL) payload.photoURL = photoURL;
      await setDoc(ref, payload);
      return;
    }

    await updateDoc(ref, {
      displayName,
      email,
      ...(photoURL ? { photoURL } : {}),
      themePreset: settings.themePreset,
      accentColor: settings.accentColor,
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      density: settings.density,
      deviceProfile: settings.deviceProfile,
      direction: settings.direction,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export function subscribeUserChats(
  userId: string,
  onData: (threads: CloudChatThread[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const chatsPath = `users/${userId}/chats`;
  const q = query(
    collection(db, "users", userId, "chats"),
    where("ownerId", "==", userId),
    orderBy("updatedAt", "desc"),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: CloudChatThread[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId || userId),
          title: String(data.title || "محادثة جديدة"),
          deviceProfile: (data.deviceProfile as DeviceKBProfile) || "desktop-50b",
          activeTopic: data.activeTopic ? String(data.activeTopic) : undefined,
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, chatsPath);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertCloudChatThread(
  userId: string,
  chatId: string,
  title: string,
  deviceProfile: DeviceKBProfile,
  activeTopic?: string | null
): Promise<void> {
  if (!VALID_ID_RE.test(userId) || !VALID_ID_RE.test(chatId)) return;
  const chatPath = `users/${userId}/chats/${chatId}`;
  const userRef = doc(db, "users", userId);
  const ref = doc(db, "users", userId, "chats", chatId);
  const cleanTitle = clampStr(title || "محادثة جديدة", 140) || "محادثة جديدة";

  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: userId,
        displayName: "مستخدم نواة",
        email: auth.currentUser?.email || "user@nawa.local",
        themePreset: "claude-light",
        accentColor: "terracotta",
        fontFamily: "editorial",
        fontSize: "md",
        density: "comfortable",
        deviceProfile: "desktop-50b",
        direction: "rtl",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const existing = await getDoc(ref);
    if (!existing.exists()) {
      const payload: Record<string, unknown> = {
        ownerId: userId,
        title: cleanTitle,
        deviceProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (activeTopic) payload.activeTopic = clampStr(activeTopic, 80);
      await setDoc(ref, payload);
    } else {
      const patch: Record<string, unknown> = {
        title: cleanTitle,
        deviceProfile,
        updatedAt: serverTimestamp(),
      };
      if (activeTopic) patch.activeTopic = clampStr(activeTopic, 80);
      await updateDoc(ref, patch);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, chatPath);
  }
}

export async function saveCloudChatMessage(
  userId: string,
  chatId: string,
  messageId: string,
  role: "user" | "assistant",
  content: string,
  dialect?: string,
  kbTier?: DeviceKBProfile
): Promise<void> {
  if (!VALID_ID_RE.test(userId) || !VALID_ID_RE.test(chatId) || !VALID_ID_RE.test(messageId)) return;
  const msgPath = `users/${userId}/chats/${chatId}/messages/${messageId}`;
  const ref = doc(db, "users", userId, "chats", chatId, "messages", messageId);
  try {
    const payload: Record<string, unknown> = {
      ownerId: userId,
      chatId,
      role,
      content: clampStr(content || " ", 16000) || " ",
      createdAt: serverTimestamp(),
    };
    if (dialect) payload.dialect = clampStr(dialect, 64);
    if (kbTier) payload.kbTier = kbTier;
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, msgPath);
  }
}

export function subscribeChatMessages(
  userId: string,
  chatId: string,
  onData: (msgs: CloudChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}/chats/${chatId}/messages`;
  const q = query(
    collection(db, "users", userId, "chats", chatId, "messages"),
    where("ownerId", "==", userId),
    orderBy("createdAt", "asc"),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: CloudChatMessage[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId || userId),
          chatId: String(data.chatId || chatId),
          role: data.role === "user" ? "user" : "assistant",
          content: String(data.content || ""),
          dialect: data.dialect ? String(data.dialect) : undefined,
          kbTier: data.kbTier as DeviceKBProfile | undefined,
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function deleteCloudChatThread(userId: string, chatId: string): Promise<void> {
  if (!VALID_ID_RE.test(userId) || !VALID_ID_RE.test(chatId)) return;
  const path = `users/${userId}/chats/${chatId}`;
  try {
    await deleteDoc(doc(db, "users", userId, "chats", chatId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
