import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  name?: string;
  emailVerified: boolean;
}

export interface UserUsageQuotaSnapshot {
  uid: string;
  email: string;
  dayKey: string;
  requestsToday: number;
  tokensToday: number;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  remainingRequests: number;
  remainingTokens: number;
}

interface FirebaseAppletConfig {
  projectId?: string;
}

function loadProjectId(): string | null {
  try {
    const cfgPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(cfgPath)) return null;
    const raw = JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as FirebaseAppletConfig;
    const pid = (raw.projectId || "").trim();
    if (!pid || pid === "remixed-project-id") return null;
    return pid;
  } catch {
    return null;
  }
}

function getFirebaseAdminAuth() {
  const projectId = loadProjectId();
  if (!projectId) {
    throw Object.assign(
      new Error("إعدادات مشروع Firebase غير مكتملة للتحقق من حساب المستخدم."),
      { statusCode: 503 }
    );
  }
  const app = getApps().length ? getApp() : initializeApp({ projectId });
  return getAuth(app);
}

const DAILY_REQUEST_LIMIT = Math.max(
  1,
  Number(process.env.CLOUD_USER_DAILY_LIMIT || 60)
);
const DAILY_TOKEN_LIMIT = Math.max(
  1000,
  Number(process.env.CLOUD_USER_DAILY_TOKEN_LIMIT || 150000)
);

interface DailyUsageBucket {
  dayKey: string;
  email: string;
  requestsToday: number;
  tokensToday: number;
}

const USER_DAILY_USAGE = new Map<string, DailyUsageBucket>();

function getUtcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getOrCreateBucket(uid: string, email: string): DailyUsageBucket {
  const dayKey = getUtcDayKey();
  const existing = USER_DAILY_USAGE.get(uid);
  if (!existing || existing.dayKey !== dayKey) {
    const fresh: DailyUsageBucket = {
      dayKey,
      email,
      requestsToday: 0,
      tokensToday: 0,
    };
    USER_DAILY_USAGE.set(uid, fresh);
    return fresh;
  }
  if (email && existing.email !== email) {
    existing.email = email;
  }
  return existing;
}

export function getUserQuotaSnapshot(uid: string, email: string): UserUsageQuotaSnapshot {
  const bucket = getOrCreateBucket(uid, email);
  return {
    uid,
    email: bucket.email,
    dayKey: bucket.dayKey,
    requestsToday: bucket.requestsToday,
    tokensToday: bucket.tokensToday,
    dailyRequestLimit: DAILY_REQUEST_LIMIT,
    dailyTokenLimit: DAILY_TOKEN_LIMIT,
    remainingRequests: Math.max(0, DAILY_REQUEST_LIMIT - bucket.requestsToday),
    remainingTokens: Math.max(0, DAILY_TOKEN_LIMIT - bucket.tokensToday),
  };
}

export function checkUserCloudQuota(
  uid: string,
  email: string
): { allowed: true; snapshot: UserUsageQuotaSnapshot } | { allowed: false; statusCode: number; message: string; snapshot: UserUsageQuotaSnapshot } {
  const snapshot = getUserQuotaSnapshot(uid, email);
  if (snapshot.requestsToday >= snapshot.dailyRequestLimit) {
    return {
      allowed: false,
      statusCode: 429,
      message: `تم استهلاك الحصة اليومية لحساب Google (${email}): ${snapshot.requestsToday}/${snapshot.dailyRequestLimit} طلب. يمكنك المتابعة عبر نموذج صغير (النسخة التجريبية) أو الانتظار لتجدد الحصة غداً.`,
      snapshot,
    };
  }
  if (snapshot.tokensToday >= snapshot.dailyTokenLimit) {
    return {
      allowed: false,
      statusCode: 429,
      message: `تم استهلاك حد التوكنات اليومي لحساب Google (${email}): ${snapshot.tokensToday.toLocaleString()}/${snapshot.dailyTokenLimit.toLocaleString()} توكن. يمكنك المتابعة عبر نموذج صغير (النسخة التجريبية).`,
      snapshot,
    };
  }
  return { allowed: true, snapshot };
}

export function recordUserCloudUsage(
  uid: string,
  email: string,
  tokensUsed: number
): UserUsageQuotaSnapshot {
  const bucket = getOrCreateBucket(uid, email);
  bucket.requestsToday += 1;
  bucket.tokensToday += Math.max(0, Math.round(tokensUsed || 0));
  return getUserQuotaSnapshot(uid, email);
}

export async function verifyFirebaseBearerToken(
  req: Request
): Promise<
  | { ok: true; user: VerifiedFirebaseUser }
  | { ok: false; statusCode: number; message: string }
> {
  const authHeader = String(req.headers.authorization || "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  const idToken = match?.[1]?.trim() || "";

  if (!idToken) {
    return {
      ok: false,
      statusCode: 401,
      message:
        "يلزم تسجيل الدخول بحساب Google الخاص بك لتشغيل المحرك السحابي وربط الحصة والاستهلاك بحسابك (أو استخدم نموذج صغير - النسخة التجريبية مجاناً).",
    };
  }

  try {
    const adminAuth = getFirebaseAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = (decoded.email || "").trim();
    if (!decoded.uid || !email) {
      return {
        ok: false,
        statusCode: 403,
        message: "يجب أن يحتوي حساب Google على بريد إلكتروني موثّق.",
      };
    }
    if (decoded.email_verified === false) {
      return {
        ok: false,
        statusCode: 403,
        message: "يرجى توثيق البريد الإلكتروني في حساب Google قبل استخدام المحرك السحابي.",
      };
    }
    return {
      ok: true,
      user: {
        uid: decoded.uid,
        email,
        name: typeof decoded.name === "string" ? decoded.name : undefined,
        emailVerified: Boolean(decoded.email_verified),
      },
    };
  } catch (err) {
    const statusFromErr =
      typeof (err as { statusCode?: unknown })?.statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 401;
    const msg = err instanceof Error ? err.message : String(err);
    if (statusFromErr === 503) {
      return { ok: false, statusCode: 503, message: msg };
    }
    return {
      ok: false,
      statusCode: 401,
      message: "انتهت صلاحية جلسة Google أو أن رمز التحقق غير صالح. يرجى إعادة تسجيل الدخول بحساب Google.",
    };
  }
}
