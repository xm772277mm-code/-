import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.SQL_HOST || "127.0.0.1",
  port: Number(process.env.SQL_PORT || 5432),
  user: process.env.SQL_USER || "postgres",
  password: process.env.SQL_PASSWORD || "",
  database: process.env.SQL_DB_NAME || "postgres",
  max: 10,
  connectionTimeoutMillis: 15000,
});

export const db = drizzle(pool, { schema });
