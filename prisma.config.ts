import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * This file configures the CLI only - `prisma migrate`, `prisma studio`,
 * `prisma generate`. Application queries are configured separately in
 * src/lib/prisma.ts, which passes a driver adapter to PrismaClient.
 */

// Prisma 7 no longer auto-loads .env files. Next.js loads .env.local for the
// app, but the CLI runs outside Next, so load it explicitly here.
// Precedence mirrors Next.js: .env.local wins over .env. Real environment
// variables (Vercel, CI) always win - dotenv never overwrites what is already
// set in process.env.
dotenv.config({ path: [".env.local", ".env"], quiet: true });

// Migrations run session-level statements (advisory locks, DDL) that Neon's
// pooled PgBouncer endpoint cannot serve, so the CLI uses the direct endpoint.
// Falls back to DATABASE_URL for plain Postgres setups with no separate pooler.
const cliDatabaseUrl = process.env.DIRECT_URL
  ? env("DIRECT_URL")
  : env("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: cliDatabaseUrl,
  },
});
