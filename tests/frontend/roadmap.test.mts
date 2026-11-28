// Phase 1 Learning Roadmap redesign: stage status logic (src/lib/roadmap.ts) and
// structure, accessibility and real-data-only rendering of the real component.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const React = (await import(`${root}/node_modules/react/index.js`)).default;
const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
const LR = (await import(`${root}/src/components/LearningRoadmap.tsx`)).default;
const { roadmapStatus } = await import(`${root}/src/lib/roadmap.ts`);
const { readFileSync } = await import("node:fs");
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const noop = () => {};
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const profile = { name: "Amina Tariq", educationLevel: "U", fieldOfStudy: "CS", skills: ["Python"], interests: ["AI"], careerGoals: "g" };
const career = (n: number) => ({ id: `c${n}`, title: `Career ${n}`, matchScore: 80, tagline: "t", explanation: "e", whyItFitsProfile: "w", dayToDay: [], coreSkills: [], growthOutlook: "g" });
const careers = [career(1), career(2), career(3)];
const stage = (n: number) => ({ stageNumber: n, title: `Foundations ${n}`, duration: `${n + 1} weeks`, goal: `Goal ${n}`, topics: [`Topic ${n}a`, `Topic ${n}b`], tools: ["Jupyter", "Git"],
  resources: [{ title: `Resource ${n}`, type: "Course", description: `About resource ${n}` }], project: { title: `Project ${n}`, description: `Build ${n}`, deliverables: [`Deliverable ${n}`] } });
const roadmap = { careerTitle: "Career 1", totalDuration: "12 weeks", overview: "A steady path into data.", stages: [1, 2, 3, 4].map(stage), careerLaunchTip: "Share your projects." };
const render = (p: object = {}) => renderToStaticMarkup(React.createElement(LR, {
  profile, careers, selectedCareer: careers[0], roadmap: null, isLoading: false, onSelectCareerForRoadmap: noop, onGoToFinder: noop, ...p,
}));

console.log("--- stage status (from returned stages and the student's ticks only)");
const s0 = roadmapStatus(roadmap.stages as any, {});
check("nothing ticked: stage 1 current, others upcoming, 0/4, 0%", s0.statuses.join() === "current,upcoming,upcoming,upcoming" && s0.completed === 0 && s0.total === 4 && s0.percent === 0 && s0.currentStage?.stageNumber === 1, s0);
const s1 = roadmapStatus(roadmap.stages as any, { 1: true, 3: true });
check("ticks 1 and 3: completed,current,completed,upcoming; 2/4; 50%; current = stage 2", s1.statuses.join() === "completed,current,completed,upcoming" && s1.completed === 2 && s1.percent === 50 && s1.currentStage?.stageNumber === 2, s1);
const sAll = roadmapStatus(roadmap.stages as any, { 1: true, 2: true, 3: true, 4: true });
check("all ticked: no current stage, 100%", sAll.currentStage === null && sAll.percent === 100 && !sAll.statuses.includes("current"), sAll);
check("ticks for stages not in this roadmap are ignored", roadmapStatus(roadmap.stages as any, { 9: true }).completed === 0, null);
check("no stages: 0/0, 0%, no current", JSON.stringify(roadmapStatus([], {})) === JSON.stringify({ statuses: [], completed: 0, total: 0, percent: 0, currentStage: null }), null);
check("1 of 3 rounds to 33%", roadmapStatus([stage(1), stage(2), stage(3)] as any, { 1: true }).percent === 33, null);

console.log("--- empty, header and states");
check("no assessment: 'Start with Career Finder' + Go to Career Finder", text(render({ profile: null, careers: [], selectedCareer: null })).includes("Start with Career Finder"), null);
const head = render();
check("one h1 'Your Beginner-Friendly Action Plan'", (head.match(/<h1\b/g) ?? []).length === 1 && text(head).includes("Your Beginner-Friendly Action Plan"), null);
check("career switcher: labelled group, selected career aria-pressed", /role="group"[^>]*aria-labelledby="roadmap-career-label"/.test(head) && /aria-pressed="true"[^>]*>Career 1</.test(head) && (head.match(/aria-pressed="false"/g) ?? []).length === 2, null);
check("Regenerate keeps its text, has a descriptive name; Print Plan only with a roadmap", head.includes(">Regenerate<") && head.includes('aria-label="Regenerate roadmap for Career 1"') && !text(head).includes("Print Plan") && text(render({ roadmap })).includes("Print Plan"), null);
check("no career selected: prompt, no roadmap", text(render({ selectedCareer: null })).includes("Choose a career path above"), null);
const loading = render({ isLoading: true, roadmap });
check("loading: role=status message, aria-busy, roadmap hidden, Regenerate disabled",
  /role="status"/.test(loading) && /aria-busy="true"/.test(loading) && text(loading).includes("Building your personalized roadmap for Career 1...") && !text(loading).includes("Foundations 1") && /<button[^>]*disabled=""[^>]*>.*?Regenerate/.test(loading), null);
check("reduced motion: spinners/skeletons only animate with motion-safe", !/\banimate-(spin|pulse)\b/.test(loading.replace(/motion-safe:animate-(spin|pulse)/g, "")) && /motion-safe:animate-pulse/.test(loading), null);
const failed = render({ hasFailed: true });
check("failed: role=alert notice with unchanged message", /role="alert"/.test(failed) && text(failed).includes("This roadmap didn't complete") && text(failed).includes("Use Regenerate above to try again for Career 1."), null);

console.log("--- overview (real data only)");
const r1 = render({ roadmap, completedStages: { 1: true } });
const t1 = text(r1);
check("overview: target role, overview text, total duration, real stage count", t1.includes("Target Role · Career 1") && t1.includes("A steady path into data.") && t1.includes("12 weeks") && t1.includes("4 stages"), null);
check("progress: '1/4 Stages', width 25%, accessible progressbar with value text",
  t1.includes("1/4 Stages") && r1.includes("width:25%") && /role="progressbar"[^>]*aria-valuemax="4"[^>]*aria-valuenow="1"[^>]*aria-valuetext="1 of 4 stages complete"/.test(r1), null);
check("progress announced politely and next stage named", /aria-live="polite"[^>]*>1 of 4 stages complete\.</.test(r1) && t1.includes("Next stage: Foundations 2"), null);
check("all complete: 'All stages complete.'", text(render({ roadmap, completedStages: { 1: true, 2: true, 3: true, 4: true } })).includes("All stages complete."), null);

console.log("--- stages timeline");
check("stages are an ordered list of 4 articles, each labelled by its title", /<ol\b/.test(r1) && (r1.match(/<article\b/g) ?? []).length === 4 && /<article[^>]*aria-labelledby="roadmap-stage-1-title"/.test(r1), null);
check("status written as text: 1 Complete, 1 Current stage, 2 Upcoming",
  (t1.match(/\bComplete\b(?!d)/g) ?? []).length >= 1 && (t1.match(/Current stage/g) ?? []).length === 1 && (t1.match(/Upcoming/g) ?? []).length === 2, null);
check("each stage shows number, title, duration, goal", ["Stage 01", "Foundations 1", "2 weeks", "Goal: Goal 1", "Stage 04", "5 weeks"].every((s) => t1.includes(s)), null);
check("all returned content kept: topics, tools, resources (type + description), project, deliverables",
  ["Topics to Master", "Topic 3b", "Suggested Tools", "Jupyter", "Beginner Resources", "Resource 4", "Course", "About resource 2", "Hands-On Stage Project", "Project 3", "Build 3", "Deliverables", "Deliverable 4"].every((s) => t1.includes(s)), null);
check("completion control: one 'Completed' (pressed) and three 'Mark Complete', each naming its stage for screen readers",
  (r1.match(/>Completed</g) ?? []).length === 1 && (t1.match(/Mark Complete/g) ?? []).length === 3 &&
  t1.includes("Completed : stage 01, Foundations 1. Select to mark as not complete.") && t1.includes("Mark Complete : stage 02, Foundations 2"), null);
check("completion controls are real buttons (keyboard operable) hidden when printing", (r1.match(/<button type="button" class="cl-btn[^"]*no-print/g) ?? []).length === 4, null);
check("career launch advice with the student's name", t1.includes("Career Launch Advice for Amina Tariq") && t1.includes("Share your projects."), null);
check("heading order: h1 > h2 sections > h3 stage titles > h4 parts", /<h3[^>]*>Foundations 1<\/h3>/.test(r1) && /<h4[^>]*>Topics to Master<\/h4>/.test(r1), null);
check("no invented numbers without a roadmap (no progress bar, no Stages count)", !/role="progressbar"/.test(head) && !text(head).includes("Stages"), null);

console.log("--- design system");
const src = readFileSync(new URL("../../src/components/LearningRoadmap.tsx", import.meta.url), "utf8");
check("uses design-system classes", ["cl-card", "cl-btn-primary", "cl-btn-secondary", "cl-eyebrow", "cl-badge"].every((c) => src.includes(c)), null);
check("no legacy palette colours left", !/#5B21B6|#4C1D95|#E8E1F8|#F3EEFF|#FAF8FF|#18132A|#EFEAF9|#DDD3F6|#DDD6FE|#EDE9FE|bslate-/i.test(src), src.match(/#[0-9A-F]{6}|slate-\d+/gi));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
