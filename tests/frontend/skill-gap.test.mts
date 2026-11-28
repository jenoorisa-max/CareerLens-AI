// Phase 1 Skill Gap Analyzer redesign: structure, accessibility and real-data-only
// rendering of the real component, plus the pure helpers in src/lib/skillGap.ts.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const React = (await import(`${root}/node_modules/react/index.js`)).default;
const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
const SG = (await import(`${root}/src/components/SkillGapAnalyzer.tsx`)).default;
const { groupMissingSkills, gapCounts } = await import(`${root}/src/lib/skillGap.ts`);
const { readFileSync } = await import("node:fs");
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const noop = () => {};
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const profile = { name: "Amina Tariq", educationLevel: "U", fieldOfStudy: "Computer Science", skills: ["Python", "Excel"], interests: ["AI"], careerGoals: "g" };
const career = (n: number) => ({ id: `c${n}`, title: `Career ${n}`, matchScore: 80, tagline: "t", explanation: "e", whyItFitsProfile: "w", dayToDay: [], coreSkills: ["SQL", "Statistics"], growthOutlook: "g" });
const careers = [career(1), career(2), career(3)];
const analysis = {
  careerTitle: "Career 1", readinessScore: 62.4, readinessSummary: "Solid foundation in data handling.",
  skillsYouHave: [{ skill: "Python", howItTransfers: "Scripting transfers to analysis." }],
  missingSkills: [
    { skill: "Dashboards", importance: "Helpful", whyItMatters: "Communicate results." },
    { skill: "Statistics", importance: "Essential", whyItMatters: "Core of the role." },
    { skill: "SQL", importance: "Important", whyItMatters: "Query data." },
    { skill: "A/B testing", importance: "Essential", whyItMatters: "Experiments." },
  ],
  priorities: [
    { rank: 1, skill: "Statistics", timeframe: "3 weeks", reason: "Unlocks the rest.", actionTip: "Take an intro course." },
    { rank: 2, skill: "SQL", timeframe: "2 weeks", reason: "Daily tool.", actionTip: "Practice joins." },
  ],
};
const render = (p: object = {}) => renderToStaticMarkup(React.createElement(SG, {
  profile, careers, selectedCareer: careers[0], analysis: null, isLoading: false, onSelectCareer: noop, onGoToRoadmap: noop, onGoToFinder: noop, ...p,
}));

console.log("--- helpers (derived only from returned data)");
const groups = groupMissingSkills(analysis.missingSkills as any);
check("missing skills grouped Essential → Important → Helpful, original order kept within a group",
  groups.map((g: any) => `${g.importance}:${g.items.map((i: any) => i.skill).join("+")}`).join() === "Essential:Statistics+A/B testing,Important:SQL,Helpful:Dashboards", groups);
const odd = groupMissingSkills([{ skill: "X", importance: "Nice to have", whyItMatters: "" }, { skill: "Y", importance: "Essential", whyItMatters: "" }] as any);
check("unknown importance label kept (not dropped, not renamed), after known groups", odd.map((g: any) => g.importance).join() === "Essential,Nice to have", odd);
check("empty input -> no groups", groupMissingSkills([]).length === 0, null);
check("counts are plain list lengths", JSON.stringify(gapCounts(analysis as any)) === JSON.stringify({ have: 1, missing: 4, essential: 2, priorities: 2 }), gapCounts(analysis as any));

console.log("--- empty and header");
const none = render({ profile: null, careers: [], selectedCareer: null });
check("no assessment: 'Complete Career Finder First' with Go to Career Finder", text(none).includes("Complete Career Finder First") && text(none).includes("Go to Career Finder"), null);
const head = render();
check("one h1 'Skills Readiness & Gap Breakdown'", (head.match(/<h1\b/g) ?? []).length === 1 && text(head).includes("Skills Readiness & Gap Breakdown"), null);
check("career switcher: labelled group, one button per career, selected marked aria-pressed",
  /role="group"[^>]*aria-labelledby="skill-gap-career-label"/.test(head) && (head.match(/aria-pressed="true"/g) ?? []).length === 1 && (head.match(/aria-pressed="false"/g) ?? []).length === 2 && /aria-pressed="true"[^>]*>Career 1</.test(head), null);
check("Re-analyze button keeps its text and has a descriptive name", head.includes(">Re-analyze<") && head.includes('aria-label="Re-analyze skill gap for Career 1"'), null);
check("no career selected: prompt to choose a career, no results", text(render({ selectedCareer: null })).includes("Choose a career path above") && !text(render({ selectedCareer: null })).includes("Re-analyze"), null);

console.log("--- loading and error");
const loading = render({ isLoading: true });
check("loading: role=status message for the career, aria-busy, Re-analyze and switcher disabled",
  /role="status"/.test(loading) && /aria-busy="true"/.test(loading) && text(loading).includes("Analyzing your skill gap for Career 1...") &&
  /<button[^>]*disabled=""[^>]*>.*?Re-analyze/.test(loading) && (loading.match(/aria-pressed="(true|false)"[^>]*disabled=""|disabled=""[^>]*aria-pressed/g) ?? []).length === 3, null);
check("reduced motion: spinners/skeletons only animate with motion-safe", !/\banimate-(spin|pulse)\b/.test(loading.replace(/motion-safe:animate-(spin|pulse)/g, "")) && /motion-safe:animate-pulse/.test(loading), null);
check("loading hides an existing analysis", !text(render({ isLoading: true, analysis })).includes("Skills You Already Have"), null);
const failed = render({ hasFailed: true });
check("failed: role=alert notice, same message, no results", /role="alert"/.test(failed) && text(failed).includes("This analysis didn't complete") && text(failed).includes("Use Re-analyze above to try again for Career 1.") && !text(failed).includes("Skills You Already Have"), null);
check("failed during cooldown: countdown message and disabled countdown button", text(render({ hasFailed: true, cooldownSeconds: 8 })).includes("The AI service is busy. You can try again in 8s.") && /<button[^>]*disabled=""[^>]*>.*?Try again in 8s/.test(render({ hasFailed: true, cooldownSeconds: 8 })), null);

console.log("--- results (real data only)");
const res = render({ analysis });
const t = text(res);
check("readiness: clamped/rounded score as text and accessible progressbar (62)",
  t.includes("62%") && /role="progressbar"[^>]*aria-label="Current role readiness for Career 1"[^>]*aria-valuenow="62"/.test(res) && res.includes("width:62%"), null);
check("readiness summary and target role shown", t.includes("Solid foundation in data handling.") && t.includes("Target Role · Career 1"), null);
check("summary counts from the lists: 1 skill you have, 4 to build, 2 essential", t.includes("1 skill you have") && t.includes("4 to build") && t.includes("2 essential"), null);
check("comparison: career core skills and the student's own profile skills", t.includes("Core skills for Career 1") && t.includes("Statistics") && t.includes("Skills on your profile") && t.includes("Excel"), null);
check("skills you have with how it transfers", t.includes("Skills You Already Have") && t.includes("Scripting transfers to analysis."), null);
check("missing skills grouped with headings and text importance badges (all 4 rendered)",
  t.includes("Missing Skills to Acquire") && /Essential · 2/.test(t) && /Important · 1/.test(t) && /Helpful · 1/.test(t) && ["Dashboards", "A/B testing", "Query data."].every((s) => t.includes(s)), null);
check("priorities: ordered list with rank (screen-reader 'Priority 01'), timeframe, reason, first step",
  /<ol\b/.test(res) && t.includes("Priority 01") && t.includes("3 weeks") && t.includes("Unlocks the rest.") && t.includes("First step: Take an intro course."), null);
check("next action: Generate Learning Roadmap (primary) and Back to Career Finder", t.includes("Generate Learning Roadmap") && t.includes("Back to Career Finder"), null);
check("section headings are h2 under the single h1", (res.match(/<h1\b/g) ?? []).length === 1 && ["Skills You Already Have", "Missing Skills to Acquire", "What to Prioritize First"].every((h) => new RegExp(`<h2[^>]*>${h}</h2>`).test(res)), null);
const fresh = render({ analysis: { ...analysis, skillsYouHave: [], missingSkills: [] } });
check("empty lists: starting-fresh message and 'No missing skills were returned', no essential badge", text(fresh).includes("You are starting fresh in this domain") && text(fresh).includes("No missing skills were returned for this role.") && !text(fresh).includes("essential"), null);
check("no invented numbers: no score/progressbar without an analysis", !/role="progressbar"/.test(head) && !/\d+%/.test(text(head)), null);

console.log("--- design system");
const src = readFileSync(new URL("../../src/components/SkillGapAnalyzer.tsx", import.meta.url), "utf8");
check("uses design-system classes (cl-card, cl-btn, cl-eyebrow)", ["cl-card", "cl-btn-primary", "cl-btn-secondary", "cl-eyebrow"].every((c) => src.includes(c)), null);
check("no legacy palette colours left", !/#5B21B6|#4C1D95|#E8E1F8|#F3EEFF|#FAF8FF|#18132A|#EFEAF9|#DDD3F6|slate-/i.test(src), src.match(/#5B21B6|#4C1D95|#E8E1F8|#F3EEFF|#FAF8FF|#18132A|#EFEAF9|#DDD3F6|slate-\d+/gi));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
