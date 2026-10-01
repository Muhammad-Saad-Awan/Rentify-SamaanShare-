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

/** Everything the run needs to know about the rows it created. */
export interface TestAccount {
  userId: string;
  listingId: string;
  email: string;
  password: string;
  /** A second account, so the listing has somebody to be booked by. */
  renterId: string;
  /** A PENDING request against the listing, which is what puts the owner panels on screen. */
  bookingId: string;

  /**
   * A SECOND listing, owned by the same account, reserved for the critical-path journey.
   *
   * Separate from the one above because that listing's booking must stay PENDING for the focus
   * tests to find an Approve and a Decline button. The journey drives a booking all the way to
   * REVIEWED, so it needs somewhere of its own to do that.
   */
  journeyListingId: string;

  /**
   * Credentials the journey REGISTERS WITH through the form, rather than rows created here.
   *
   * Generated up front so teardown knows which account to remove without the test writing back
   * to this file mid-run - two processes editing it is a race nobody needs.
   */
  journeyEmail: string;
  journeyPassword: string;

  /**
   * A whole second cast, for the realtime delivery test.
   *
   * ITS OWN OWNER, RENTER, LISTING AND BOOKING, sharing nothing with the fixtures above. That
   * test has to APPROVE a booking to make the other browser receive something, and the approve
   * and decline buttons the focus tests look for exist only while a request is still pending -
   * so consuming the shared one would break them from another project, intermittently, depending
   * on which worker got there first.
   *
   * Both passwords are known here, unlike the journey's renter which registers through the form.
   * The realtime test is about what one browser sees when another acts; making it register an
   * account first would add a failure mode that has nothing to do with what it measures.
   */
  /**
   * An administrator, because the critical path now needs one.
   *
   * Under the custodial flow a renter records a payment and an ADMINISTRATOR confirms it
   * arrived - the owner cannot, they never see the money. So the journey grew a third browser,
   * and a journey that skipped that step would no longer be the critical path.
   */
  journeyAdminEmail: string;
  journeyAdminPassword: string;
  journeyAdminId: string;

  realtimeOwnerEmail: string;
  realtimeOwnerPassword: string;
  realtimeRenterEmail: string;
  realtimeRenterPassword: string;
  realtimeOwnerId: string;
  realtimeRenterId: string;
  realtimeListingId: string;
  realtimeBookingId: string;
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
