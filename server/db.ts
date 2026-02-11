import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // This SSL setting is required for Render's managed PostgreSQL
  ssl: {
    rejectUnauthorized: false,
  },
});

export const db = drizzle(pool, { schema });