// Phase 1 Task 9: final motion polish (source level). Behaviour in a real browser
// is covered by tests/browser/motion.browser.mts.
const { readFileSync } = await import("node:fs");
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };

const css = read("src/index.css").replace(/\r\n/g, "\n");
const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
const landing = read("src/components/LandingPage.tsx");
const src = Object.fromEntries(["DashboardOverview", "CareerFinder", "SkillGapAnalyzer", "LearningRoadmap", "SidebarNav"].map((p) => [p, read(`src/components/${p}.tsx`)]));

console.log("--- entrance and reveal");
check("entrance keyframes use the independent `translate` property (hover `transform` lifts still work)",
  /@keyframes enterSlide \{[^}]*translate: 0 8px;[^}]*\}[^}]*translate: 0 0;/.test(css) && !/@keyframes enterSlide[\s\S]*?transform[\s\S]*?\n\}/.test(css.slice(css.indexOf("@keyframes enterSlide"), css.indexOf("@keyframes enterSlide") + 200)), null);
check("Landing hero plays as a sequence (cl-stagger) and the preview follows (cl-enter-late)", landing.includes('className="cl-stagger mx-auto max-w-3xl text-center"') && landing.includes('className="cl-enter-late mt-14 sm:mt-16"'), null);
check("scroll reveal hides content only when armed by JS, on screens, with motion allowed",
  /@media screen and \(prefers-reduced-motion: no-preference\) \{\s*\.cl-reveal-on \.cl-reveal:not\(\.is-visible\)/.test(css), null);
check("reveal is armed only with IntersectionObserver and without a reduced-motion preference, and reveals once",
  landing.includes('typeof IntersectionObserver === "undefined"') && landing.includes('matchMedia?.("(prefers-reduced-motion: reduce)").matches') &&
  landing.includes("observer.unobserve(entry.target)") && landing.includes('root.classList.add("cl-reveal-on")') && landing.includes('root.classList.remove("cl-reveal-on")'), null);
check("Landing sections below the hero use reveal (2 section headers, 3 card groups, about text, CTA)",
  (landing.match(/className="cl-reveal /g) ?? []).length + (landing.match(/className="cl-reveal"/g) ?? []).length >= 4 && (landing.match(/className="cl-reveal-group /g) ?? []).length === 3, null);
check("Dashboard journey steps and quick-access cards stagger in", (src.DashboardOverview.match(/cl-stagger/g) ?? []).length >= 3, null);

console.log("--- interaction feedback");
check("button arrows nudge on hover", /\.cl-btn:hover:not\(:disabled\) \.lucide-arrow-right \{\s*translate: 3px 0;/.test(css), null);
check("press feedback (scale 0.97) on chips, career switchers and navigation items",
  /\.cl-press:active:not\(:disabled\) \{\s*scale: 0\.97;/.test(css) && src.CareerFinder.split("cl-press").length - 1 === 2 && src.SkillGapAnalyzer.includes("cl-press") && src.LearningRoadmap.includes("cl-press") && src.SidebarNav.includes("cl-press"), null);
check("press targets no longer carry transition-colors (it would override the shared transition)",
  !/cl-press[^"`]*transition-colors|transition-colors[^"`]*cl-press/.test(Object.values(src).join("\n")), null);
check("roadmap stage cards ease border and shadow when their status changes", src.LearningRoadmap.includes("transition-[box-shadow,border-color] duration-300"), null);
check("progress fills carry a soft highlight", /\.cl-progress-fill \{\s*background-image: linear-gradient/.test(css), null);

console.log("--- prefers-reduced-motion: complete");
check("explicit off-switches for the new pieces (late entrance, arrow nudge, press scale)",
  reduce.includes(".cl-enter-late {\n    animation: none;") && /lucide-arrow-right,\s*\.cl-press:active[^{]*\{\s*translate: none;\s*scale: none;/.test(reduce), null);
check("global safety net: every animation and transition is zero-length, no smooth scrolling",
  /\*,\s*\*::before,\s*\*::after \{[^}]*animation-duration: 0s !important;[^}]*animation-delay: 0s !important;[^}]*transition-duration: 0s !important;[^}]*transition-delay: 0s !important;[^}]*scroll-behavior: auto !important;/.test(reduce), null);
check("reveal hidden state can never apply under reduced motion or print (guarded media query)",
  !/\.cl-reveal-on [^{]*\{\s*opacity: 0/.test(css.replace(/@media screen and \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, "")), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
