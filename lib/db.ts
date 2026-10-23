import { neon } from "@neondatabase/serverless";

/**
 * Singleton Neon SQL client for server-side use.
 * Uses the DATABASE_URL environment variable.
 */
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required to connect to Neon. Add it to .env.local or .env.development.local for local development.",
  );
}

const sql = neon(databaseUrl);

export default sql;
