// Phase 1 Task 8: depth and atmosphere classes, contrast of text on the new
// tinted surfaces (worst-case colour stops), and accessibility structure.
// Real-pixel contrast on every page is checked by tests/browser/a11y-responsive.browser.mts.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const { readFileSync } = await import("node:fs");
const React = (await import(`${root}/node_modules/react/index.js`)).default;
const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };

const css = read("src/index.css");
const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
const src = Object.fromEntries(["LandingPage", "DashboardOverview", "CareerFinder", "SkillGapAnalyzer", "LearningRoadmap", "SidebarNav"].map((p) => [p, read(`src/components/${p}.tsx`)]));
const app = read("src/App.tsx");

// --- contrast helpers (WCAG 2.x) ---
type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const over = (c: RGB, a: number, bg: RGB): RGB => c.map((v, i) => v * a + bg[i] * (1 - a)) as RGB;
const lum = (c: RGB) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const T = { primary: hex("#7555d9"), deep: hex("#5539b0"), strong: hex("#6447c7"), lavender: hex("#a78bfa"), soft: hex("#f1ecff"), canvas: hex("#f7f6fb"), white: hex("#ffffff"), ink: hex("#17152b"), muted: hex("#6b6880") };

console.log("--- depth and atmosphere classes");
for (const c of [".cl-app-bg", ".cl-card-hero", ".cl-card-accent", ".cl-card-tint", ".cl-accent-top", ".cl-icon-tile", ".cl-icon-tile-solid", ".cl-text-gradient", ".cl-hero-bg", ".cl-section-tint", ".cl-cta-panel", ".cl-sidebar-bg", ".cl-nav-active", ".cl-skip-link"]) {
  check(`${c} defined`, css.includes(c + " ") || css.includes(c + ":") || css.includes(c + ","), null);
}
const t8 = css.slice(css.indexOf("Phase 1 Task 8"), css.indexOf("Phase 1 Task 9"));
check("decoration is static: no animation/transition declarations in the Task 8 layer", !/^\s*(animation|transition)[\w-]*\s*:/m.test(t8), t8.match(/^\s*(animation|transition)[^;]*/gm));
check("forced-colours mode: gradient text falls back to CanvasText; decorative layers hidden", /forced-colors: active[\s\S]*cl-text-gradient[\s\S]*CanvasText[\s\S]*display: none/.test(css), null);
check("buttons and inputs are at least 44px tall (min-height 2.75rem)", /\.cl-btn,\s*\.cl-input\s*\{\s*min-height: 2\.75rem/.test(css), null);
check("reduced-motion block from Task 7 kept", reduce.includes(".cl-stagger > *") && reduce.includes(".animate-enter"), null);

console.log("--- applied across all five pages (variety, not one flat card style)");
check("Landing: hero glow, gradient tagline, tinted Features band, accent cards, icon tiles, dark CTA panel",
  ["cl-hero-bg", "cl-text-gradient", "cl-section-tint", "cl-accent-top", "cl-icon-tile", "cl-icon-tile-solid", "cl-cta-panel"].every((c) => src.LandingPage.includes(c)), null);
check("app background glow on the app shell", app.includes('className="min-h-screen cl-app-bg"'), null);
for (const p of ["DashboardOverview", "CareerFinder", "SkillGapAnalyzer", "LearningRoadmap"]) {
  check(`${p}: page header card uses cl-card-hero and a highlighted card uses cl-card-accent`, src[p].includes("cl-card cl-card-hero") && src[p].includes("cl-card cl-card-accent"), null);
}
check("Sidebar: soft background and accented active item", src.SidebarNav.includes("cl-sidebar-bg") && src.SidebarNav.includes("cl-nav-active"), null);
check("utilities that would fight the gradient border were removed (no border-primary/25 left)", !Object.values(src).some((s) => s.includes("border-primary/25")), null);

console.log("--- contrast on the new surfaces (worst-case colour stops)");
const heroCorner = over(T.lavender, 0.18, T.white);
check(`ink-muted on the strongest cl-card-hero glow >= 4.5 (${ratio(T.muted, heroCorner).toFixed(2)})`, ratio(T.muted, heroCorner) >= 4.5, null);
const tintTop = T.soft.map((v, i) => v * 0.7 + T.canvas[i] * 0.3) as RGB;
check(`ink-muted on the top of cl-section-tint >= 4.5 (${ratio(T.muted, tintTop).toFixed(2)})`, ratio(T.muted, tintTop) >= 4.5, null);
check(`ink-muted on cl-card-tint's lavender-soft stop >= 4.5 (${ratio(T.muted, T.soft).toFixed(2)})`, ratio(T.muted, T.soft) >= 4.5, null);
check(`primary-strong (icon tiles) on lavender-soft >= 3 for icons (${ratio(T.strong, T.soft).toFixed(2)})`, ratio(T.strong, T.soft) >= 3, null);
const ctaPeak = over(T.primary, 0.55, T.ink);
const white80 = over(T.white, 0.8, ctaPeak);
check(`CTA panel: 80% white text on the brightest purple glow >= 4.5 (${ratio(white80, ctaPeak).toFixed(2)})`, ratio(white80, ctaPeak) >= 4.5, null);
check(`icon-tile-solid / primary buttons: white on primary >= 4.5 (${ratio(T.white, T.primary).toFixed(2)})`, ratio(T.white, T.primary) >= 4.5, null);
const sheenTop = over(T.white, 0.06, T.primary);
check(`primary button sheen: white text on the lightest stop >= 4.5 (${ratio(T.white, sheenTop).toFixed(2)})`, ratio(T.white, sheenTop) >= 4.5, null);
const gradLight = hex("#8a68ee");
check(`gradient tagline: lightest stop on canvas >= 3 for large text (${ratio(gradLight, T.canvas).toFixed(2)})`, ratio(gradLight, T.canvas) >= 3, null);

console.log("--- accessibility structure");
for (const [name, s] of [["Landing", src.LandingPage], ["App", app]] as const) {
  check(`${name}: skip link first, moves focus to <main id="main-content" tabIndex={-1}> without changing the hash`,
    s.includes('className="cl-skip-link"') && s.includes('document.getElementById("main-content")?.focus()') && /<main id="main-content" tabIndex=\{-1\}/.test(s) && !s.includes('href="#main-content"'), null);
}
check("mobile drawer: Tab/Shift+Tab wrap inside, Escape closes, body scroll locked and restored",
  /e\.key !== "Tab"/.test(src.SidebarNav) && src.SidebarNav.includes("first.focus()") && src.SidebarNav.includes("last.focus()") && src.SidebarNav.includes('document.body.style.overflow = "hidden"') && src.SidebarNav.includes("document.body.style.overflow = previousOverflow"), null);
check("menu buttons are 44x44 (h-11 w-11)", /aria-label="Open navigation"[\s\S]{0,80}h-11 w-11/.test(src.SidebarNav) && /aria-label="Close navigation"[\s\S]{0,80}h-11 w-11/.test(src.SidebarNav) && src.LandingPage.includes("h-11 w-11 p-0 md:hidden"), null);
check("global error dismiss button is 44x44", app.includes('aria-label="Dismiss error"') && /Dismiss error"[\s\S]{0,120}h-11 w-11/.test(app), null);

const noop = () => {};
const profile = { name: "A", educationLevel: "U", fieldOfStudy: "CS", skills: ["x"], interests: ["y"], careerGoals: "g" };
const career = { id: "a", title: "Data Analyst", matchScore: 80, tagline: "t", explanation: "e", whyItFitsProfile: "w", dayToDay: [], coreSkills: [], growthOutlook: "g" };
const live = (html: string) => [...html.matchAll(/<p class="sr-only" aria-live="polite">([^<]*)<\/p>/g)].map((m) => m[1]);
const CF = (await import(`${root}/src/components/CareerFinder.tsx`)).default;
const SG = (await import(`${root}/src/components/SkillGapAnalyzer.tsx`)).default;
const LR = (await import(`${root}/src/components/LearningRoadmap.tsx`)).default;
const h = (C: any, p: object) => renderToStaticMarkup(React.createElement(C, p));
const results = { profileSummary: "s", careers: [career, { ...career, title: "B" }, { ...career, title: "C" }] };
check("Career Finder announces finished results, and is silent while loading",
  live(h(CF, { initialProfile: profile, careerResults: results, isLoading: false, onSubmitProfile: async () => {}, onSelectForSkillGap: noop, onSelectForRoadmap: noop })).includes("3 career paths are ready.") &&
  live(h(CF, { initialProfile: profile, careerResults: results, isLoading: true, onSubmitProfile: async () => {}, onSelectForSkillGap: noop, onSelectForRoadmap: noop })).includes(""), null);
const analysis = { careerTitle: "Data Analyst", readinessScore: 50, readinessSummary: "r", skillsYouHave: [], missingSkills: [], priorities: [] };
const sgBase = { profile, careers: [career], selectedCareer: career, onSelectCareer: noop, onGoToRoadmap: noop, onGoToFinder: noop };
check("Skill Gap announces a finished analysis, silent while loading",
  live(h(SG, { ...sgBase, analysis, isLoading: false })).includes("Skill gap analysis for Data Analyst is ready.") && live(h(SG, { ...sgBase, analysis: null, isLoading: true })).includes(""), null);
const roadmap = { careerTitle: "Data Analyst", totalDuration: "1w", overview: "o", stages: [], careerLaunchTip: "t" };
const lrBase = { profile, careers: [career], selectedCareer: career, onSelectCareerForRoadmap: noop, onGoToFinder: noop };
check("Roadmap announces a finished roadmap, silent while loading",
  live(h(LR, { ...lrBase, roadmap, isLoading: false })).includes("Learning roadmap for Data Analyst is ready.") && live(h(LR, { ...lrBase, roadmap: null, isLoading: true })).includes(""), null);

const landing = h((await import(`${root}/src/components/LandingPage.tsx`)).default, { onGetStarted: noop, onOpenFeature: noop });
check("tagline and product name unchanged", /<h1[^>]*>Discover Your Career\.\s*<span[^>]*>Build Your Future\.<\/span><\/h1>/.test(landing) && landing.includes("CareerLens"), null);
check("Landing: decorative step connector is outside the list (valid <ol>, 3 steps)",
  /aria-hidden="true" class="pointer-events-none absolute[^"]*border-dashed/.test(landing) && (landing.match(/<ol class="cl-reveal-group relative grid gap-6 md:grid-cols-3">([\s\S]*?)<\/ol>/)?.[1].match(/<li\b/g) ?? []).length === 3, null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
