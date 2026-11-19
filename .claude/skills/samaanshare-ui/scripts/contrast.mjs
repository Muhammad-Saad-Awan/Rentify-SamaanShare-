#!/usr/bin/env node
/**
 * WCAG 2.x contrast checker for SamaanShare colours.
 *
 *   node contrast.mjs <fg> <bg> [<fg> <bg> ...]   check explicit pairs (hex or oklch(...))
 *                                               append @alpha for opacity: '#FFFFFF@0.7' '#142B3B'
 *   --base <colour>                             what a translucent background sits on (default white)
 *   node contrast.mjs --tokens [path/to/globals.css]
 *                                               check every semantic pair in :root and .dark
 *
 * Exists because the palette has two colours that look fine and fail: #059669 and #D97706 are
 * both under 4.5:1 on white. Eyeballing missed the old --muted-foreground too, until axe measured
 * it. Thresholds: 4.5 normal text, 3.0 large text (>=24px, or >=18.66px bold) and non-text UI.
 */
import { readFileSync } from "node:fs";

function parseHex(value) {
  let h = value.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** oklch(L C H [/ alpha]) -> linear sRGB. Alpha is ignored; translucent tokens are skipped. */
function oklchToLinear(value) {
  const m = value.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`Cannot parse ${value}`);
  let L = parseFloat(m[1]);
  if (m[1].endsWith("%")) L /= 100;
  const C = parseFloat(m[2]);
  const H = (parseFloat(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, c)));
}

const toLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toGamma = (c) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

/**
 * A colour as gamma-encoded sRGB. `<colour>@<alpha>` (e.g. `#FFFFFF@0.7`, the `/70` in
 * `text-background/70`) is composited over `under`, the way the browser blends it.
 */
function toSrgb(value, under = "#FFFFFF") {
  const [colour, alphaText] = value.trim().split("@");
  const rgb = colour.startsWith("oklch")
    ? oklchToLinear(colour).map(toGamma)
    : parseHex(colour);
  if (alphaText === undefined) return rgb;
  const alpha = parseFloat(alphaText);
  const base = toSrgb(under);
  return rgb.map((c, i) => c * alpha + base[i] * (1 - alpha));
}

function luminance(srgb) {
  const [r, g, b] = srgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A translucent background sits on `base` (the card or page); a translucent foreground on the background. */
function ratio(fg, bg, base = "#FFFFFF") {
  const bgRgb = toSrgb(bg, base);
  const bgOpaque = `#${bgRgb
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
  const a = luminance(toSrgb(fg, bgOpaque));
  const b = luminance(bgRgb);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function verdict(r, min = 4.5) {
  if (r >= min) return "PASS";
  if (r >= 3) return "large/non-text only";
  return "FAIL";
}

/** [foreground token, background token, minimum ratio] */
const TOKEN_PAIRS = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["muted-foreground", "card", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["destructive", "card", 4.5],
  ["brand-foreground", "brand", 4.5],
  ["brand", "card", 4.5],
  ["success-foreground", "success", 4.5],
  ["success-soft-foreground", "success-soft", 4.5],
  ["warning-foreground", "warning", 4.5],
  ["warning-soft-foreground", "warning-soft", 4.5],
  ["input", "background", 3],
  ["ring", "background", 3],
  ["sidebar-foreground", "sidebar", 4.5],
  ["sidebar-primary-foreground", "sidebar-primary", 4.5],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5],
];

function readBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return {};
  const body = css.slice(start, css.indexOf("\n}", start));
  const tokens = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g))
    tokens[m[1]] = m[2].trim();
  return tokens;
}

function checkTokens(path) {
  const css = readFileSync(path, "utf8");
  let failures = 0;
  let checked = 0;
  for (const selector of [":root", ".dark"]) {
    const t = readBlock(css, selector);
    console.log(`\n${selector}`);
    for (const [fg, bg, min] of TOKEN_PAIRS) {
      if (!t[fg] || !t[bg]) continue; // token not defined in this palette yet
      if (t[fg].includes("/") || t[bg].includes("/")) continue; // translucent: needs a backdrop
      const r = ratio(t[fg], t[bg]);
      const v = verdict(r, min);
      checked++;
      if (v !== "PASS") failures++;
      console.log(
        `  ${`${fg} on ${bg}`.padEnd(48)} ${r.toFixed(2).padStart(5)}  ${v}`
      );
    }
  }
  // Zero pairs means the file was not parsed, not that it passed - say so instead of a false green.
  if (checked === 0) {
    console.log(
      `\nNo token pairs found in ${path} - expected ':root {' and '.dark {' blocks.`
    );
    process.exitCode = 2;
    return;
  }
  console.log(
    failures
      ? `\n${checked} pairs checked, ${failures} below their minimum.`
      : `\nAll ${checked} pairs pass.`
  );
  process.exitCode = failures ? 1 : 0;
}

const argv = process.argv.slice(2);
const baseIndex = argv.indexOf("--base");
const base = baseIndex === -1 ? "#FFFFFF" : argv[baseIndex + 1];
const args =
  baseIndex === -1
    ? argv
    : argv.filter((_, i) => i !== baseIndex && i !== baseIndex + 1);
if (args[0] === "--tokens") {
  checkTokens(args[1] ?? "src/app/globals.css");
} else if (args.length >= 2 && args.length % 2 === 0) {
  for (let i = 0; i < args.length; i += 2) {
    const r = ratio(args[i], args[i + 1], base);
    console.log(
      `${args[i]} on ${args[i + 1]}: ${r.toFixed(2)}:1  ${verdict(r)}`
    );
  }
} else {
  console.log(
    "Usage: node contrast.mjs <fg> <bg> [...pairs] | --tokens [globals.css]"
  );
  process.exitCode = 2;
}
