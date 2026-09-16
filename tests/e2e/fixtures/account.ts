import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The throwaway account the signed-in tests run as.
 *
 * WHY CREATE ONE INSTEAD OF SEEDING A KNOWN LOGIN. `prisma/seed-demo.ts` leaves `password` null on
 * every demo owner, on purpose - its comment says seeding a known password would put working
 * logins into every developer's database. That reasoning does not stop being true because a test
 * would find it convenient. So the credential here is generated per run, exists only while the run
 * does, and is removed afterwards.
 *
 * The password never appears in this repository. It is 32 random bytes, written to a gitignored
 * file so the setup and teardown projects - separate processes - can agree on which row to remove.
 */

/** Everything the run needs to know about the account it created. */
export interface TestAccount {
  userId: string;
  listingId: string;
  email: string;
  password: string;
}

const STATE_DIR = "tests/e2e/.auth";

/** Where the signed-in browser state is written. Referenced by the config. */
export const STORAGE_STATE = `${STATE_DIR}/state.json`;

/** Where the row ids are recorded, so teardown can find them without guessing. */
const ACCOUNT_FILE = `${STATE_DIR}/account.json`;

/**
 * A recognisable, non-deliverable address.
 *
 * `.test` is reserved by RFC 2606 and can never resolve, so a stray row cannot become a real
 * mailbox and no accidental send can reach anybody. The prefix makes leftovers greppable if a run
 * is killed before teardown.
 */
export function newAccountCredentials(): Pick<
  TestAccount,
  "email" | "password"
> {
  return {
    email: `e2e-${randomUUID()}@samaanshare.test`,
    password: randomBytes(32).toString("base64url"),
  };
}

export function writeAccount(account: TestAccount): void {
  mkdirSync(dirname(ACCOUNT_FILE), { recursive: true });
  writeFileSync(ACCOUNT_FILE, JSON.stringify(account, null, 2), "utf8");
}

/**
 * Reads back what setup created.
 *
 * Returns null rather than throwing when the file is missing: teardown runs even if setup failed
 * partway, and a teardown that crashes because there was nothing to clean up would bury the real
 * error under its own.
 */
export function readAccount(): TestAccount | null {
  try {
    return JSON.parse(readFileSync(ACCOUNT_FILE, "utf8")) as TestAccount;
  } catch {
    return null;
  }
}
