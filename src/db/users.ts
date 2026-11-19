import { eq } from "drizzle-orm";
import { db } from "./index.ts";
import { users, type DbUser } from "./schema.ts";

export interface AuthUserPayload {
  uid: string;
  email?: string;
  name?: string;
}

export async function getOrCreateUser(authUser: AuthUserPayload): Promise<DbUser> {
  const email = (authUser.email || `${authUser.uid}@users.local`).trim();
  const displayName = authUser.name?.trim() || null;

  try {
    const [upserted] = await db
      .insert(users)
      .values({
        id: authUser.uid,
        email,
        displayName,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email,
          displayName,
        },
      })
      .returning();

    if (upserted) return upserted;
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.id, authUser.uid))
        .limit(1);
      if (existing[0]) return existing[0];
    }
    throw err;
  }

  const fallback = await db
    .select()
    .from(users)
    .where(eq(users.id, authUser.uid))
    .limit(1);
  if (!fallback[0]) {
    throw new Error("Failed to resolve authenticated user record");
  }
  return fallback[0];
}
