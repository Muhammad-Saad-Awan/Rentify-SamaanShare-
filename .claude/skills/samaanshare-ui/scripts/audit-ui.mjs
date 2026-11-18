#!/usr/bin/env node
/**
 * Mechanical UI audit for SamaanShare.
 *
 *   node audit-ui.mjs                 scan src/
 *   node audit-ui.mjs <file|dir> ...  scan only these (e.g. the files in a diff)
 *
 * Flags CANDIDATES - a reviewer still decides. Known, intentional exceptions are allowlisted below
 * so the output stays worth reading. Exit code 1 when any error-level finding exists.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";

const ROOT = process.cwd();
const APP_DIR = join(ROOT, "src", "app");

/** Files where raw colours are deliberate. */
const COLOUR_ALLOWLIST = [
  "src/app/global-error.tsx", // renders without the stylesheet, so inline colours are the only option
  "src/components/auth/google-button.tsx", // Google's brand colours, not ours
  "src/components/settings/connected-accounts.tsx", // the same Google logo
  "src/lib/email/", // email HTML has no stylesheet; inline hex is required
  "src/app/globals.css",
];
const colourAllowed = (path) =>
  COLOUR_ALLOWLIST.some(
    (entry) => path === entry || (entry.endsWith("/") && path.startsWith(entry))
  );

const RULES = [
  {
    id: "raw-palette-colour",
    level: "error",
    test: /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|divide|placeholder|shadow)-(?:red|green|emerald|blue|amber|yellow|orange|sky|slate|gray|zinc|neutral|stone|indigo|violet|purple|pink|rose|teal|cyan|lime|fuchsia)-\d{2,3}\b/g,
    message:
      "Raw Tailwind palette colour - use a semantic token (design-tokens.md §4)",
    colour: true,
  },
  {
    id: "raw-black-white",
    level: "info",
    test: /\b(?:bg|text|border|ring|fill|stroke)-(?:black|white)\b(?:\/\d+)?/g,
    message:
      "Raw black/white - fine for overlay scrims; otherwise use background/foreground/primary-foreground",
    colour: true,
  },
  {
    id: "hex-or-oklch",
    level: "error",
    test: /(?:#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|oklch\()/g,
    message:
      "Hard-coded colour value in a component - colours live in globals.css",
    colour: true,
    skipIf: (line) =>
      /href=|id=|#\w+-|\/\/.*#/.test(line) && !/oklch\(/.test(line),
  },
  {
    id: "arbitrary-colour",
    level: "error",
    test: /\b(?:bg|text|border|ring|fill|stroke)-\[(?:#|rgb|hsl|oklch)[^\]]*\]/g,
    message: "Arbitrary colour value - use a semantic token",
    colour: true,
  },
  {
    id: "tiny-text",
    level: "warn",
    test: /\btext-\[(?:[0-9]|1[01])px\]/g,
    message: "Text below 12px - only acceptable inside badges/counters",
    // Unread counters are digits in a pill, set with tabular-nums - the one accepted use.
    skipIf: (line) => /tabular-nums/.test(line),
  },
  {
    id: "arbitrary-tracking",
    level: "info",
    test: /\btracking-\[(?!-0\.025em|-0\.03em|-0\.035em)[^\]]+\]/g,
    message:
      "Tracking outside the approved set (tight, -0.025em, -0.03em, -0.035em)",
  },
  {
    id: "as-child",
    level: "error",
    test: /\basChild\b/g,
    message: "asChild is Radix - Base UI uses render={<Element />}",
  },
  {
    id: "role-button-on-link",
    level: "error",
    test: /<(?:a|Link)\b[^>]*role=["']button["']/g,
    message:
      "Link announced as a button - use Button render={<Link/>} which keeps link semantics",
  },
  {
    id: "gradient",
    level: "warn",
    test: /\bbg-(?:linear|gradient|radial|conic)-/g,
    message:
      "Gradient - decorative gradients are off-brand (image scrims are the exception)",
  },
  {
    id: "heavy-shadow",
    level: "info",
    test: /\bshadow-(?:xl|2xl)\b/g,
    message:
      "Heavy shadow - elevation here is borders first, shadow-lg max for overlays",
  },
  {
    id: "outline-none-without-focus",
    level: "info",
    test: /className=["'`][^"'`]*\boutline-none\b(?![^"'`]*focus-(?:visible|within))[^"'`]*["'`]/g,
    message:
      "outline-none with no focus style in this class list - check focus is shown elsewhere",
    // Not a defect when: the element is a skip-link target (tabIndex={-1}), a Base UI positioner
    // (focus lives on the popup), or a field inside a wrapper that rings on focus-within.
    skipIf: (line, lines, index) => {
      const near = lines.slice(Math.max(0, index - 3), index + 2).join("\n");
      const above = lines.slice(Math.max(0, index - 25), index).join("\n");
      return (
        /tabIndex=\{-1\}/.test(near) ||
        /Positioner/.test(near) ||
        /focus-within:ring/.test(above)
      );
    },
  },
  {
    id: "window-alert",
    level: "info",
    test: /\bwindow\.alert\(/g,
    message: "window.alert - use toast or an inline role=alert message",
  },
];

function walk(target, out = []) {
  if (!existsSync(target)) return out;
  const stat = statSync(target);
  if (stat.isFile()) {
    if (/\.(tsx|ts|css)$/.test(target) && !/\.test\.|\.spec\./.test(target))
      out.push(target);
    return out;
  }
  for (const name of readdirSync(target)) {
    if (name === "node_modules" || name === "generated" || name.startsWith("."))
      continue;
    walk(join(target, name), out);
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split(sep).join("/");

/** Source with comments removed, so a notFound() mentioned in a docblock is not mistaken for a call. */
const code = (file) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const callsNotFound = (file) => /\bnotFound\(\)/.test(code(file));

function scanFile(file, findings) {
  const path = rel(file);
  const allowColour = colourAllowed(path);
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    )
      return;
    for (const rule of RULES) {
      if (rule.colour && allowColour) continue;
      if (path.endsWith(".css") && rule.id !== "raw-palette-colour") continue;
      if (rule.skipIf?.(line, lines, index)) continue;
      const matches = line.match(rule.test);
      if (matches) {
        findings.push({
          level: rule.level,
          rule: rule.id,
          path,
          line: index + 1,
          match: [...new Set(matches)].join(" "),
          message: rule.message,
        });
      }
    }
  });
}

/**
 * The AGENTS.md invariant: a loading.tsx must not sit in an ancestor segment of a layout that
 * calls notFound(). A loading.tsx in the SAME segment as that layout wraps only the page, so it
 * is safe and not flagged.
 */
function checkLoadingAboveNotFound(findings) {
  const files = walk(APP_DIR);
  const loadings = files
    .filter((f) => f.endsWith(`${sep}loading.tsx`))
    .map(dirname);
  const guardedLayouts = files
    .filter((f) => f.endsWith(`${sep}layout.tsx`) && callsNotFound(f))
    .map(dirname);
  for (const loadingDir of loadings) {
    for (const layoutDir of guardedLayouts) {
      if (layoutDir !== loadingDir && layoutDir.startsWith(loadingDir + sep)) {
        findings.push({
          level: "error",
          rule: "loading-above-notfound",
          path: rel(join(loadingDir, "loading.tsx")),
          line: 1,
          match: rel(join(layoutDir, "layout.tsx")),
          message:
            "loading.tsx above a layout that calls notFound() - soft 404 (AGENTS.md). Use keyed in-page <Suspense>",
        });
      }
    }
  }
  // notFound() in a page under a loading.tsx -> status already flushed. Not flagged when a layout
  // between the two (or beside the page) already validates: then the page's call is only a
  // type-narrowing fallback, which is the existing pattern in listings/[id] and categories/[slug].
  for (const page of files.filter((f) => f.endsWith(`${sep}page.tsx`))) {
    const dir = dirname(page);
    const under = loadings.filter((l) => dir === l || dir.startsWith(l + sep));
    const guarded = under.every((l) =>
      guardedLayouts.some(
        (g) =>
          (g === l || g.startsWith(l + sep)) &&
          (dir === g || dir.startsWith(g + sep))
      )
    );
    if (callsNotFound(page) && under.length && !guarded) {
      findings.push({
        level: "error",
        rule: "notfound-in-page-under-loading",
        path: rel(page),
        line: 1,
        match: "notFound()",
        message:
          "notFound() in a page under a loading.tsx - move the check to a layout.tsx",
      });
    }
  }
}

const targets = process.argv.slice(2);
const files = (targets.length ? targets : ["src"]).flatMap((t) =>
  walk(join(ROOT, t))
);
const findings = [];
files.forEach((f) => scanFile(f, findings));
checkLoadingAboveNotFound(findings);

const order = { error: 0, warn: 1, info: 2 };
findings.sort(
  (a, b) =>
    order[a.level] - order[b.level] ||
    a.path.localeCompare(b.path) ||
    a.line - b.line
);

for (const f of findings) {
  console.log(
    `${f.level.toUpperCase().padEnd(5)} ${f.path}:${f.line}  [${f.rule}] ${f.match}\n      ${f.message}`
  );
}
const counts = findings.reduce(
  (acc, f) => ({ ...acc, [f.level]: (acc[f.level] ?? 0) + 1 }),
  {}
);
console.log(
  `\n${files.length} files scanned - ${counts.error ?? 0} error, ${counts.warn ?? 0} warn, ${counts.info ?? 0} info`
);
process.exitCode = counts.error ? 1 : 0;
