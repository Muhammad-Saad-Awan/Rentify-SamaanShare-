import { execSync } from "node:child_process";

import { test as teardown } from "@playwright/test";

/**
 * Removes the account and listing the run created.
 *
 * Runs as the setup project's `teardown`, so it happens even when tests fail - which is exactly
 * when a fixture is most likely to be left behind in a shared database. It cannot help a run that
 * is killed outright; those leave a row whose email starts `e2e-` and ends `@samaanshare.test`.
 *
 * Delegates to the same `tsx` script as setup, for the same ESM reason.
 */

teardown("remove the throwaway account", () => {
  execSync("npx tsx --env-file=.env.local tests/e2e/fixtures/db.ts destroy", {
    stdio: "inherit",
  });
});
