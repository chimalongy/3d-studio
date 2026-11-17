import { neon } from "@neondatabase/serverless";
export function sqlClient() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Add it to .env.local.");
  return neon(process.env.DATABASE_URL);
}