import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";
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

/**
 * How long a transaction may wait for a connection before giving up.
 *
 * Prisma's default is 2 seconds, and that is what produced the P2028 "Unable to start a transaction
 * in the given time" 500s on the first request after Neon's compute had scaled to zero: waking the
 * database takes longer than two seconds, so the transaction gave up before the pool could hand it
 * a connection. Measured on 12 Aug 2026 - a cold first request took ~60s end to end, warm ones 2.7s.
 *
 * Raising this does not make anything slower; it only changes how long a request is willing to wait
 * for a resource it is already blocked on. The alternative - a keep-alive cron - costs compute hours
 * to paper over a once-per-idle-period event.
 */
const TRANSACTION_MAX_WAIT_MS = 15_000;

/**
 * How long a transaction may run once started.
 *
 * Also raised from Prisma's 5-second default, for the same cold-start reason: the first *statement*
 * inside a transaction pays the wake-up cost too, so a generous `maxWait` alone would let a
 * transaction start and then time out mid-flight. Every transaction in this codebase is a handful of
 * indexed statements, so this ceiling only ever catches genuine trouble.
 */
const TRANSACTION_TIMEOUT_MS = 15_000;

function createPrismaClient() {
  // `env` validates this at startup and refuses a non-PostgreSQL string, so by the time this runs
  // the value is present and plausible - the hand-rolled check that used to live here is gone.
  const connectionString = env.DATABASE_URL;

  // Prisma 7 requires a driver adapter. PrismaPg keeps a small local pool per
  // serverless instance and talks to Neon's pooled endpoint, which fans the
  // connections out to Postgres.
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: TRANSACTION_MAX_WAIT_MS,
      timeout: TRANSACTION_TIMEOUT_MS,
    },
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
