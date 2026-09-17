import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

import type { Page } from "@playwright/test";

/**
 * The shared axe scan.
 *
 * Extracted once a third caller appeared. The reporting below is the reason it is worth sharing:
 * a bare `expect(violations).toEqual([])` reports "expected length 3 to be 0", which sends whoever
 * reads it back to a browser to discover what the three were.
 *
 * WHAT AXE CAN AND CANNOT DO. It catches the computed and the structural - contrast ratios, missing
 * names, broken heading order, unlabelled fields - which is precisely the half a person reading the
 * source cannot check. It cannot tell whether focus goes somewhere sensible when a panel closes.
 * Published figures put automated coverage at roughly a third of real issues, so a clean run is a
 * floor, not a certificate.
 */

/** WCAG 2.1 A and AA, the level this project targets. */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type Violations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

function describeViolations(violations: Violations): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 4)
        .map((node) => `      ${node.target.join(" ")}`)
        .join("\n");

      const more =
        violation.nodes.length > 4
          ? `\n      ...and ${violation.nodes.length - 4} more`
          : "";

      return `  [${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help}\n${targets}${more}\n      ${violation.helpUrl}`;
    })
    .join("\n\n");
}

export async function expectNoViolations(page: Page): Promise<void> {
  /**
   * WAIT FOR THE DOCUMENT TO FINISH ARRIVING BEFORE SCANNING IT.
   *
   * Next streams the response, and `generateMetadata` resolves into `<head>` as part of that
   * stream. Scanning too early reports `document-title` against a page that does have a title a
   * moment later - which is exactly what happened once the suite grew enough to run scans under
   * load. A real browser is never in the hurry a test is.
   *
   * Asserted rather than slept on: this retries until the title is there, and still fails loudly
   * if one genuinely never arrives.
   */
  await expect(page).toHaveTitle(/.+/);

  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();

  expect(
    violations,
    violations.length > 0
      ? `\n${describeViolations(violations)}\n`
      : "no violations"
  ).toEqual([]);
}

/**
 * The contrast ratio between two CSS custom properties, measured on the live page.
 *
 * Measured rather than recomputed from the token values, which would only prove the stylesheet
 * says what the stylesheet says. This paints both colours and reads the pixels back, so it stays
 * honest through a token rename, a theme swap, or an edit that darkens the surface instead.
 */
export async function measureContrast(
  page: Page,
  foregroundToken: string,
  backgroundToken: string
): Promise<number> {
  return page.evaluate(
    ([foreground, background]) => {
      const probe = document.createElement("div");
      probe.style.color = `var(${foreground})`;
      probe.style.backgroundColor = `var(${background})`;
      document.body.appendChild(probe);

      const computed = getComputedStyle(probe);
      const fg = computed.color;
      const bg = computed.backgroundColor;

      probe.remove();

      /** Any colour syntax resolves to sRGB bytes once something actually paints it. */
      const toRgb = (value: string): [number, number, number] => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;

        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("No 2D context available to resolve colours.");
        }

        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);

        const { data } = context.getImageData(0, 0, 1, 1);

        return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
      };

      const luminance = ([red, green, blue]: [number, number, number]) => {
        const channel = (value: number) => {
          const scaled = value / 255;

          return scaled <= 0.03928
            ? scaled / 12.92
            : Math.pow((scaled + 0.055) / 1.055, 2.4);
        };

        return (
          0.2126 * channel(red) +
          0.7152 * channel(green) +
          0.0722 * channel(blue)
        );
      };

      const one = luminance(toRgb(fg));
      const two = luminance(toRgb(bg));

      return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
    },
    [foregroundToken, backgroundToken] as const
  );
}
