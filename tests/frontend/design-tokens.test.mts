// Phase 1 design-system foundation: approved tokens, fonts, safe naming and
// WCAG contrast of the documented text/background pairs (src/index.css).
import { readFileSync } from "node:fs";
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const css = read("src/index.css");
const html = read("index.html");
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };

const theme = css.match(/@theme\s*{([\s\S]*?)\n}/)?.[1] ?? "";
const tokens = Object.fromEntries([...theme.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

console.log("--- approved palette");
const PALETTE: Record<string, string> = {
  "color-primary": "#7555d9", "color-lavender": "#a78bfa", "color-lavender-soft": "#f1ecff", "color-canvas": "#f7f6fb",
  "color-surface": "#ffffff", "color-ink": "#17152b", "color-ink-muted": "#6b6880", "color-line": "#e8e5f0",
};
for (const [k, v] of Object.entries(PALETTE)) check(`${k} = ${v.toUpperCase()}`, tokens[k]?.toLowerCase() === v, tokens[k]);

console.log("--- typography");
check("body font: Inter", /^"Inter"/.test(tokens["font-sans"] ?? ""), tokens["font-sans"]);
check("heading font: Plus Jakarta Sans", /^"Plus Jakarta Sans"/.test(tokens["font-display"] ?? ""), tokens["font-display"]);
check("headings use the display font in base styles", /h1,\s*h2,\s*h3,\s*h4\s*{[^}]*font-family:\s*var\(--font-display\)/.test(css), null);
check("index.html loads Inter and Plus Jakarta Sans (and keeps JetBrains Mono, used for numbers)",
  /family=Inter:/.test(html) && /family=Plus\+Jakarta\+Sans:/.test(html) && /family=JetBrains\+Mono:/.test(html), null);
check("old body font (DM Sans) no longer loaded", !/DM\+Sans|DM Sans/.test(html + css), null);

console.log("--- safe naming: built-in Tailwind scales are not redefined (existing pages unchanged)");
const BUILT_IN = [
  ...["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"].map((s) => `radius-${s}`),
  ...["2xs", "xs", "sm", "md", "lg", "xl", "2xl"].map((s) => `shadow-${s}`),
  ...["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"].map((s) => `text-${s}`),
  "spacing", "ease-in", "ease-out", "ease-in-out", "container-prose",
];
const overridden = BUILT_IN.filter((t) => t in tokens);
check("no built-in radius / shadow / text / spacing / easing token overridden", overridden.length === 0, overridden);
check("semantic radius, shadow, motion and layout tokens defined",
  ["radius-control", "radius-card", "radius-panel", "radius-pill", "shadow-card", "shadow-card-hover", "shadow-raised", "shadow-focus", "ease-smooth", "container-content", "text-display", "text-heading"].every((t) => t in tokens), Object.keys(tokens));
check("transition durations and spacing defined as CSS variables",
  ["--duration-fast", "--duration-base", "--duration-slow", "--space-gutter", "--space-section", "--space-stack"].every((v) => css.includes(`${v}:`)), null);

console.log("--- base styles and component foundation");
check("base styles are in @layer base (utility classes always win)", /@layer base\s*{[\s\S]*html\s*{[\s\S]*body\s*{/.test(css), null);
check("visible keyboard focus style defined", /:focus-visible\s*{[^}]*outline:\s*2px solid var\(--color-focus\)/.test(css), null);
check("reduced-motion preference still disables animations/transitions", /prefers-reduced-motion: reduce[\s\S]*animation: none[\s\S]*transition: none/.test(css), null);
const COMPONENTS = ["cl-card", "cl-card-interactive", "cl-btn", "cl-btn-primary", "cl-btn-secondary", "cl-btn-ghost", "cl-label", "cl-input", "cl-badge", "cl-eyebrow", "cl-muted", "cl-container"];
check(`reusable component classes defined in @layer components (${COMPONENTS.length})`,
  /@layer components/.test(css) && COMPONENTS.every((c) => new RegExp(`\\.${c}\\b`).test(css)), COMPONENTS.filter((c) => !new RegExp(`\\.${c}\\b`).test(css)));
check("existing helpers kept: .tabular-nums, .animate-enter, print styles",
  css.includes(".tabular-nums") && css.includes(".animate-enter") && /@media print[\s\S]*\.no-print/.test(css), null);

console.log("--- WCAG contrast (AA = 4.5:1 for normal text)");
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const t = (k: string) => tokens[k];
const PAIRS: [string, string, string][] = [
  ["ink on surface", t("color-ink"), t("color-surface")],
  ["ink on canvas", t("color-ink"), t("color-canvas")],
  ["ink on lavender-soft", t("color-ink"), t("color-lavender-soft")],
  ["ink-muted on surface", t("color-ink-muted"), t("color-surface")],
  ["ink-muted on canvas", t("color-ink-muted"), t("color-canvas")],
  ["ink-muted on lavender-soft", t("color-ink-muted"), t("color-lavender-soft")],
  ["primary text on surface", t("color-primary"), t("color-surface")],
  ["primary text on canvas", t("color-primary"), t("color-canvas")],
  ["white on primary (primary button)", "#ffffff", t("color-primary")],
  ["white on primary-strong (hover)", "#ffffff", t("color-primary-strong")],
  ["white on primary-deep (active)", "#ffffff", t("color-primary-deep")],
  ["primary-strong on lavender-soft (badge)", t("color-primary-strong"), t("color-lavender-soft")],
];
for (const [label, fg, bg] of PAIRS) {
  const r = ratio(fg, bg);
  check(`${label}: ${r.toFixed(2)}:1 >= 4.5`, r >= 4.5, r);
}
const lav = ratio(t("color-lavender"), t("color-surface"));
check(`lavender on white is ${lav.toFixed(2)}:1 (< 4.5), so it is documented as decorative only`,
  lav < 4.5 && /lavender \(#A78BFA\) is decorative only/i.test(css), lav);
const focusRing = ratio(t("color-focus"), t("color-surface"));
check(`focus outline vs white: ${focusRing.toFixed(2)}:1 >= 3 (non-text contrast)`, focusRing >= 3, focusRing);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
