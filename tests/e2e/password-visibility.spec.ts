import { expect, test } from "@playwright/test";

/**
 * The reveal toggle on the sign-in form.
 *
 * Public, so this runs signed out - which is the state the sign-in page is always met in.
 *
 * The third assertion is the one worth having. A `<button>` inside a `<form>` defaults to
 * `type="submit"`, so a toggle that forgot to say otherwise would submit the credentials on the
 * first press instead of revealing them. That failure looks like a flash and a "wrong password"
 * message, which nobody would attribute to the eye icon.
 */

test.describe("password visibility on sign in", () => {
  test("reveals and re-hides the password", async ({ page }) => {
    await page.goto("/login");

    const password = page.getByLabel("Password", { exact: true });

    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("the toggle does not submit the form", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("not-a-real-account@samaanshare.test");
    await page.getByLabel("Password", { exact: true }).fill("hunter2hunter2");

    await page.getByRole("button", { name: "Show password" }).click();

    // Still on the sign-in page, and the value is intact rather than having been posted.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
      "hunter2hunter2"
    );
  });
});
