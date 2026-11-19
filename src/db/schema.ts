import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaceNotes = pgTable("workspace_notes", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const gameScores = pgTable("game_scores", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  wave: integer("wave").notNull().default(1),
  outcome: text("outcome").notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mediaCreations = pgTable("media_creations", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  mediaType: text("media_type").notNull(),
  modelName: text("model_name").notNull(),
  prompt: text("prompt").notNull(),
  summaryText: text("summary_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DbUser = typeof users.$inferSelect;
export type WorkspaceNote = typeof workspaceNotes.$inferSelect;
export type GameScoreRow = typeof gameScores.$inferSelect;
export type MediaCreationRow = typeof mediaCreations.$inferSelect;
