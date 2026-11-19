import { and, desc, eq } from "drizzle-orm";
import { db } from "./index.ts";
import {
  gameScores,
  mediaCreations,
  workspaceNotes,
  type GameScoreRow,
  type MediaCreationRow,
  type WorkspaceNote,
} from "./schema.ts";
import { getOrCreateUser, type AuthUserPayload } from "./users.ts";

export async function listUserNotes(authUser: AuthUserPayload): Promise<WorkspaceNote[]> {
  await getOrCreateUser(authUser);
  return db
    .select()
    .from(workspaceNotes)
    .where(eq(workspaceNotes.userId, authUser.uid))
    .orderBy(desc(workspaceNotes.updatedAt))
    .limit(40);
}

export async function createUserNote(
  authUser: AuthUserPayload,
  title: string,
  content: string,
  category = "general"
): Promise<WorkspaceNote> {
  await getOrCreateUser(authUser);
  const [inserted] = await db
    .insert(workspaceNotes)
    .values({
      userId: authUser.uid,
      title: title.trim().slice(0, 120),
      content: content.trim().slice(0, 4000),
      category: category.trim().slice(0, 40) || "general",
    })
    .returning();
  return inserted;
}

export async function deleteUserNote(
  authUser: AuthUserPayload,
  noteId: number
): Promise<boolean> {
  await getOrCreateUser(authUser);
  const deleted = await db
    .delete(workspaceNotes)
    .where(and(eq(workspaceNotes.id, noteId), eq(workspaceNotes.userId, authUser.uid)))
    .returning({ id: workspaceNotes.id });
  return deleted.length > 0;
}

export async function listTopGameScores(): Promise<
  Array<{ id: number; playerName: string; score: number; wave: number; outcome: string; createdAt: Date }>
> {
  return db
    .select({
      id: gameScores.id,
      playerName: gameScores.playerName,
      score: gameScores.score,
      wave: gameScores.wave,
      outcome: gameScores.outcome,
      createdAt: gameScores.createdAt,
    })
    .from(gameScores)
    .orderBy(desc(gameScores.score), desc(gameScores.createdAt))
    .limit(12);
}

export async function recordGameScore(
  authUser: AuthUserPayload,
  score: number,
  wave: number,
  outcome: string
): Promise<GameScoreRow> {
  const userRow = await getOrCreateUser(authUser);
  const playerName =
    userRow.displayName || userRow.email.split("@")[0] || "لاعب";
  const [inserted] = await db
    .insert(gameScores)
    .values({
      userId: authUser.uid,
      playerName: playerName.slice(0, 64),
      score: Math.max(0, Math.round(score)),
      wave: Math.max(1, Math.round(wave)),
      outcome: outcome.slice(0, 32),
    })
    .returning();
  return inserted;
}

export async function listUserMediaCreations(
  authUser: AuthUserPayload
): Promise<MediaCreationRow[]> {
  await getOrCreateUser(authUser);
  return db
    .select()
    .from(mediaCreations)
    .where(eq(mediaCreations.userId, authUser.uid))
    .orderBy(desc(mediaCreations.createdAt))
    .limit(20);
}

export async function recordMediaCreation(
  authUser: AuthUserPayload,
  mediaType: string,
  modelName: string,
  prompt: string,
  summaryText?: string | null
): Promise<MediaCreationRow> {
  await getOrCreateUser(authUser);
  const [inserted] = await db
    .insert(mediaCreations)
    .values({
      userId: authUser.uid,
      mediaType: mediaType.slice(0, 32),
      modelName: modelName.slice(0, 64),
      prompt: prompt.slice(0, 1000),
      summaryText: summaryText ? summaryText.slice(0, 2000) : null,
    })
    .returning();
  return inserted;
}
