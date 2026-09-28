import { expect, test } from "@playwright/test";

/**
 * The reveal toggles on the change-password form.
 *
 * Three fields on one page, each with its own toggle, which is the case a single piece of shared
 * state would get wrong: revealing the current password must not also reveal the new one, or a
 * person checking what they typed has put two more secrets on screen than they asked for.
 */

test("each password field reveals independently", async ({ page }) => {
  await page.goto("/settings");

  const current = page.getByLabel("Current password");
  const next = page.getByLabel("New password", { exact: true });

  await expect(current).toHaveAttribute("type", "password");
  await expect(next).toHaveAttribute("type", "password");

  // The toggle belonging to the current-password field, found through the field it controls.
  const currentId = await current.getAttribute("id");

  await page
    .getByRole("button", { name: "Show password" })
    .and(page.locator(`[aria-controls="${currentId}"]`))
    .click();

  await expect(current).toHaveAttribute("type", "text");
  await expect(next).toHaveAttribute("type", "password");
});
