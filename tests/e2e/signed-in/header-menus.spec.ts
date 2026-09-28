import { expect, test } from "@playwright/test";

/**
 * The two header menus, opened.
 *
 * WHY THIS FILE EXISTS. The notification bell threw `MenuGroupContext is missing` the moment its
 * popup mounted - Base UI's `Menu.GroupLabel` used as a panel title, with no `Menu.Group` around
 * it. Nothing caught it: it is not a type error, not a lint error, and no unit test mounts the
 * panel. It was reported by somebody clicking the bell.
 *
 * What made it worse than a broken dropdown is where the bell lives. The header is rendered by
 * `(dashboard)/layout.tsx`, and a segment's `error.tsx` does not cover its own layout - so the
 * throw went past `(dashboard)/error.tsx` to `global-error.tsx` and replaced the entire
 * application with "SamaanShare could not load". Every control in that header is one click away
 * from doing the same thing, which is why this watches for page errors rather than for markup.
 */

/** Anything React would treat as a render failure, plus console errors for context. */
function collectErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });

  return errors;
}

test.describe("dashboard header menus", () => {
  test("opening the notification bell does not take the app down", async ({
    page,
  }) => {
    const errors = collectErrors(page);

    await page.goto("/dashboard");

    const bell = page.getByRole("button", { name: /notifications/i }).first();

    await expect(bell).toBeVisible();
    await bell.click();

    // The panel's own content, so a silently-empty popup cannot pass this.
    await expect(
      page.getByRole("menuitem", { name: /view all notifications/i })
    ).toBeVisible();

    /**
     * The global boundary, checked by its copy. If the popup throws, React unmounts the tree up
     * to it and this heading is what the user is left looking at.
     */
    await expect(page.getByText(/SamaanShare could not load/i)).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test("opening the account menu does not take the app down", async ({
    page,
  }) => {
    const errors = collectErrors(page);

    await page.goto("/dashboard");

    await page.getByRole("button", { name: /open account menu/i }).click();

    await expect(
      page.getByRole("menuitem", { name: /settings/i })
    ).toBeVisible();

    await expect(page.getByText(/SamaanShare could not load/i)).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
