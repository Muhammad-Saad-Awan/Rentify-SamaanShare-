import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Application-wide Prisma Client.
 *
 * Import this everywhere instead of constructing PrismaClient yourself:
 *
 * @example
 * import { prisma } from '@/lib/prisma';
 * const listings = await prisma.listing.findMany();
 */

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  // Fail loudly at startup rather than on the first query in a request.
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string."
    );
  }

  // Prisma 7 requires a driver adapter. PrismaPg keeps a small local pool per
  // serverless instance and talks to Neon's pooled endpoint, which fans the
  // connections out to Postgres.
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });
}

// Next.js clears the module registry on every hot reload in development, so a
// plain module-level client would be rebuilt on each save - leaking a
// connection pool each time until Neon starts refusing new connections.
// globalThis survives HMR; production gets exactly one client per instance.
// Typed as ReturnType rather than `PrismaClient`: in Prisma 7 the client is
// generic over its `log` options, so the concrete return type carries the log
// levels configured above and would not be assignable to the bare generic.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
