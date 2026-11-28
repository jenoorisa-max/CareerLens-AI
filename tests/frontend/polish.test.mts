// Phase 1 global polish: shared motion classes, reduced-motion coverage and
// consistent usage across all redesigned pages (source and server-rendered).
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const { readFileSync } = await import("node:fs");
const React = (await import(`${root}/node_modules/react/index.js`)).default;
const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };

const css = read("src/index.css");
const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
const pages = ["LandingPage", "DashboardOverview", "CareerFinder", "SkillGapAnalyzer", "LearningRoadmap", "SidebarNav"];
const src = Object.fromEntries(pages.map((p) => [p, read(`src/components/${p}.tsx`)]));
const app = read("src/App.tsx");

console.log("--- shared motion classes");
for (const c of [".cl-stagger", ".cl-progress-fill", ".cl-loading-bar", ".cl-pop", ".cl-drawer-in"]) {
  check(`${c} defined`, css.includes(c), null);
}
check("button press feedback (1px) on enabled buttons only", /\.cl-btn:active:not\(:disabled\)[^{]*\{\s*transform: translateY\(1px\)/.test(css), null);
check("interactive cards lift on hover and keyboard focus-within", /\.cl-card-interactive:hover,\s*\.cl-card-interactive:focus-within\s*\{[^}]*translateY\(-2px\)/.test(css), null);
// One-off entrances (hero preview, scroll reveal) may run up to 700ms; everything
// else stays at or under 500ms. The looping loading bar is matched separately (1.4s).
const selectorOf = (index: number) => { const before = css.slice(0, index); return before.slice(before.lastIndexOf("}") + 1, before.lastIndexOf("{")).trim(); };
const timed = [...css.matchAll(/animation: (\w+) (\d+)ms/g)].map((m) => ({ text: m[0], ms: Number(m[2]), selector: selectorOf(m.index!) }));
const oneOff = (t: { selector: string }) => /\.cl-enter-late|\.cl-reveal/.test(t.selector);
check("motion stays subtle: interactions/entrances <= 500ms, one-off reveals <= 700ms, except the looping loading bar",
  timed.every((t) => t.ms <= (oneOff(t) ? 700 : 500)), timed.map((t) => `${t.selector} -> ${t.text}`));
check("new rules live in the components layer (utilities can still override them)", /@layer components \{\s*\/\* Buttons: a 1px press/.test(css), null);

console.log("--- prefers-reduced-motion");
for (const c of [".cl-stagger > *", ".cl-progress-fill", ".cl-pop", ".cl-drawer-in", ".animate-enter"]) {
  check(`reduced motion disables ${c}`, reduce.includes(c), null);
}
check("reduced motion: no lift / press transforms", /\.cl-card-interactive:hover[\s\S]*transform: none/.test(reduce), null);
check("reduced motion: loading bar becomes static", /\.cl-loading-bar::after\s*\{\s*animation: none/.test(reduce), null);
const unguarded = pages.flatMap((p) => [...src[p].matchAll(/(?<![:\w-])animate-(spin|pulse|bounce|ping)\b/g)].map((m) => `${p}: ${m[0]}`))
  .concat([...app.matchAll(/(?<![:\w-])animate-(spin|pulse|bounce|ping)\b/g)].map((m) => `App: ${m[0]}`));
check("no Tailwind animation runs without motion-safe on any page", unguarded.length === 0, unguarded);

console.log("--- consistent usage");
const fills = pages.flatMap((p) => [...src[p].matchAll(/className="([^"]*)"\s*style=\{\{ width/g)].map((m) => `${p}: ${m[1]}`));
check("every progress fill uses cl-progress-fill (no ad-hoc transition-all)", fills.length >= 5 && fills.every((f) => f.includes("cl-progress-fill") && !f.includes("transition-all")), fills);
check("loading bar in Career Finder, Skill Gap and Roadmap loading states (decorative, aria-hidden)",
  ["CareerFinder", "SkillGapAnalyzer", "LearningRoadmap"].every((p) => /<div className="cl-loading-bar mt-4" aria-hidden="true" \/>/.test(src[p])), null);
check("staggered entrances on results lists (Career Finder, Skill Gap, Roadmap, Dashboard)",
  ["CareerFinder", "SkillGapAnalyzer", "LearningRoadmap", "DashboardOverview"].every((p) => src[p].includes("cl-stagger")), null);
check("mobile drawer slides in", src.SidebarNav.includes("cl-drawer-in"), null);
const hex = pages.flatMap((p) => [...src[p].matchAll(/\[#[0-9A-Fa-f]{3,6}\]/g)].map((m) => `${p}: ${m[0]}`));
check("no hard-coded hex colours left in page classes (tokens only)", hex.length === 0, hex);

console.log("--- success state (Roadmap, derived from real ticks)");
const LR = (await import(`${root}/src/components/LearningRoadmap.tsx`)).default;
const stage = (n: number) => ({ stageNumber: n, title: `S${n}`, duration: "1w", goal: "g", topics: [], tools: [], resources: [], project: { title: "p", description: "d", deliverables: [] } });
const roadmap = { careerTitle: "C", totalDuration: "2w", overview: "o", stages: [stage(1), stage(2)], careerLaunchTip: "t" };
const lr = (done: Record<number, boolean>) => renderToStaticMarkup(React.createElement(LR, { profile: { name: "A", educationLevel: "", fieldOfStudy: "", skills: [], interests: [], careerGoals: "" },
  careers: [{ id: "c", title: "C", matchScore: 1, tagline: "", explanation: "", whyItFitsProfile: "", dayToDay: [], coreSkills: [], growthOutlook: "" }],
  selectedCareer: { id: "c", title: "C" }, roadmap, isLoading: false, onSelectCareerForRoadmap: () => {}, onGoToFinder: () => {}, completedStages: done }));
check("all stages ticked: success panel (emerald) with 'All stages complete.'", /border-emerald-200 bg-emerald-50/.test(lr({ 1: true, 2: true })) && lr({ 1: true, 2: true }).includes("All stages complete."), null);
check("partly ticked: neutral panel with the next stage", !/border-emerald-200/.test(lr({ 1: true })) && lr({ 1: true }).includes("Next stage: S2"), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
