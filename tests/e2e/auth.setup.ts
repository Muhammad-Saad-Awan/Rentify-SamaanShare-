import { execSync } from "node:child_process";

import { expect, test as setup } from "@playwright/test";

import { readAccount, STORAGE_STATE } from "./fixtures/account";

/**
 * Creates the account the signed-in tests use, and signs it in.
 *
 * SIGNS IN THROUGH THE FORM rather than forging a session cookie. Minting a JWT here would be
 * faster and would test nothing: the credentials provider, the password comparison, the status
 * check and the redirect are all things the signed-in tests depend on, and a hand-made cookie
 * asserts they work rather than finding out. It also means a broken login surfaces here once,
 * rather than as every signed-in test failing for no clear reason.
 *
 * Runs as its own project, with the browser state saved to disk, so everything after it starts
 * already signed in.
 */

setup("create a throwaway account and sign in", async ({ page }) => {
  /**
   * The row creation runs in a child process - see the note in `fixtures/db.ts`. Prisma 7's
   * generated client is ESM-only and Playwright transpiles tests to CommonJS, so importing it
   * here fails on `import.meta` before the test body runs.
   */
  execSync("npx tsx --env-file=.env.local tests/e2e/fixtures/db.ts create", {
    stdio: "inherit",
  });

  const account = readAccount();

  expect(account, "The fixture script did not write an account").not.toBeNull();

  await page.goto("/login");

  await page.getByLabel("Email").fill(account?.email ?? "");
  await page
    .getByLabel("Password", { exact: true })
    .fill(account?.password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();

  // The credentials provider lands here on success; anything else means sign-in failed.
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: STORAGE_STATE });
});
