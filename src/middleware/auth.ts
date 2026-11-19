import type { NextFunction, Request, Response } from "express";
import { adminAuth } from "../lib/firebase-admin.ts";

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    name?: string;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = String(req.headers.authorization || "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  const idToken = match?.[1]?.trim() || "";

  if (!idToken) {
    res.status(401).json({
      error: "Unauthorized",
      detail: "يلزم تسجيل الدخول بحساب Google لإتمام هذا الإجراء.",
    });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.uid) {
      res.status(401).json({ error: "Unauthorized", detail: "رمز المصادقة غير صالح." });
      return;
    }
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: typeof decoded.name === "string" ? decoded.name : undefined,
    };
    next();
  } catch {
    res.status(401).json({
      error: "Unauthorized",
      detail: "انتهت صلاحية جلسة Google أو أن الرمز غير صالح.",
    });
  }
}
