// Phase 1 Dashboard: journey logic (src/lib/dashboard.ts) and the real
// DashboardOverview component in every data state. Only real data may appear.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const D = await import(`${root}/src/lib/dashboard.ts`);
const React = (await import(`${root}/node_modules/react/index.js`)).default;
const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
const DashboardOverview = (await import(`${root}/src/components/DashboardOverview.tsx`)).default;
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };

const career = (n: number) => ({ id: `c${n}`, title: `Career ${n}`, matchScore: 90 - n, tagline: "t", explanation: "e", whyItFitsProfile: "w", dayToDay: ["d"], coreSkills: ["s"], growthOutlook: "g" });
const careers = { profileSummary: "sum", careers: [career(1), career(2), career(3)] };
const gap = { careerTitle: "Career 1", readinessScore: 62, readinessSummary: "r", skillsYouHave: [{ skill: "SQL", howItTransfers: "h" }, { skill: "Excel", howItTransfers: "h" }],
  missingSkills: [{ skill: "Statistics", importance: "Essential", whyItMatters: "w" }], priorities: [{ rank: 1, skill: "Statistics", timeframe: "2w", reason: "r", actionTip: "a" }] };
const stage = (n: number, title: string) => ({ stageNumber: n, title, duration: "1w", goal: "g", topics: ["t"], tools: ["x"], resources: [], project: { title: "P", description: "d", deliverables: [] } });
const roadmap = { careerTitle: "Career 1", totalDuration: "8 weeks", overview: "o", careerLaunchTip: "tip",
  stages: [stage(1, "Foundations"), stage(2, "Core skills"), stage(3, "Projects"), stage(4, "Job ready")] };
const base = { careerResults: null, selectedCareer: null, skillGapsByCareer: {}, roadmapsByCareer: {}, completedStages: {} };
const withCareers = { ...base, careerResults: careers, selectedCareer: career(1) };

console.log("--- journey logic");
check("no assessment -> next step: find careers; no steps done", D.getNextStep(base).kind === "find-careers" && D.journeySteps(base).every((s: any) => !s.done), null);
const n1 = D.getNextStep(withCareers);
check("careers only -> analyze skill gap for the selected career", n1.kind === "analyze-skill-gap" && n1.career.title === "Career 1", n1);
check("focus falls back to the first career when none is selected", D.focusCareer({ ...withCareers, selectedCareer: null })?.title === "Career 1", null);
check("selected career not in results -> first career", D.focusCareer({ ...withCareers, selectedCareer: career(9) })?.title === "Career 1", null);
const withGap = { ...withCareers, skillGapsByCareer: { "Career 1": gap } };
check("skill gap done -> build roadmap", D.getNextStep(withGap).kind === "build-roadmap", D.getNextStep(withGap));
const withRoadmap = { ...withGap, roadmapsByCareer: { "Career 1": roadmap }, completedStages: { "Career 1::1": true, "Career 2::2": true } };
const n3 = D.getNextStep(withRoadmap);
check("roadmap in progress -> continue with the first incomplete stage", n3.kind === "continue-roadmap" && n3.progress.completed === 1 && n3.progress.total === 4 && n3.progress.nextStageTitle === "Core skills", n3);
check("progress ignores other careers' stages and non-existent stages",
  D.roadmapProgress("Career 1", roadmap, { "Career 1::1": true, "Career 1::99": true, "Career 2::2": true }).completed === 1, null);
const done = { ...withRoadmap, completedStages: { "Career 1::1": true, "Career 1::2": true, "Career 1::3": true, "Career 1::4": true } };
check("all stages done -> roadmap complete", D.getNextStep(done).kind === "roadmap-complete" && D.roadmapProgress("Career 1", roadmap, done.completedStages).nextStageTitle === null, null);
check("journey steps reflect real data", JSON.stringify(D.journeySteps(withGap).map((s: any) => s.done)) === "[true,true,false]", D.journeySteps(withGap));

console.log("--- rendered overview (only real data)");
const calls: string[] = [];
const props = (state: object, extra: object = {}) => ({
  profile: null, ...base, ...state, pending: { careers: false, skillGap: false, roadmap: false }, cooldownSeconds: 0,
  onOpenFeature: (t: string) => calls.push(`open:${t}`), onSkillGap: (c: any) => calls.push(`gap:${c.title}`), onRoadmap: (c: any) => calls.push(`road:${c.title}`), ...extra,
});
const html = (state: object, extra: object = {}) => renderToStaticMarkup(React.createElement(DashboardOverview, props(state, extra)));
const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

const empty = strip(html(base));
check("empty state: welcome, three journey steps, 'Start with Career Finder', quick access to all 3 features",
  empty.includes("Welcome to CareerLens AI") && ["Discover careers", "Identify skill gaps", "Follow your roadmap"].every((s) => empty.includes(s)) &&
  empty.includes("Start with Career Finder") && ["Career Finder", "Skill Gap Analyzer", "Learning Roadmap"].every((s) => empty.includes(s)), empty);
check("empty state shows NO numbers, scores or progress (nothing invented)", !/\d+\s*%|\d+\/\d+|readiness|Your career matches/i.test(empty), empty.match(/\d+\s*%|\d+\/\d+/)?.[0]);
check("empty state has no progressbar", !html(base).includes('role="progressbar"'), null);

const profile = { name: "Amina Tariq", educationLevel: "Undergraduate", fieldOfStudy: "Computer Science", skills: ["x"], interests: ["y"], careerGoals: "g" };
const withC = strip(html({ ...withCareers, profile }));
check("with careers: personal welcome uses the real first name", withC.includes("Welcome back, Amina"), null);
check("with careers: summary lists the 3 real careers with their real match scores", ["Career 1", "Career 2", "Career 3"].every((c) => withC.includes(c)) && withC.includes("89% fit") && withC.includes("For Amina Tariq"), null);
check("with careers: next step names the focus career", withC.includes("Analyze your skill gap for Career 1"), null);
check("with careers but no gap/roadmap: no readiness or roadmap progress panels", !withC.includes("Skill readiness") && !withC.includes("Roadmap progress"), null);
check("career rows offer 'Analyze skill gap' / 'Build roadmap' when not done", withC.includes("Analyze skill gap") && withC.includes("Build roadmap"), null);

const full = strip(html({ ...withRoadmap, profile }));
check("skill readiness panel uses real data (62%, 2 skills you have, 1 to develop, top priority)",
  full.includes("Skill readiness") && full.includes("62%") && /Skills you have 2/.test(full) && /Skills to develop 1/.test(full) && full.includes("Top priority: Statistics"), null);
check("roadmap progress panel uses real data (1/4, next stage, duration)", full.includes("1/4") && full.includes("Next stage: Core skills") && full.includes("8 weeks"), null);
check("career rows switch to 'View skill gap' / 'View roadmap' when results exist", full.includes("View skill gap") && full.includes("View roadmap"), null);
check("progress bars are accessible (role=progressbar with value)", /role="progressbar"[^>]*aria-valuenow="62"/.test(html({ ...withRoadmap, profile })) && /aria-valuenow="25"/.test(html({ ...withRoadmap, profile })), null);
check("completed roadmap: congratulation and points back to career matches", strip(html({ ...done, profile })).includes("You completed every stage for Career 1"), null);

console.log("--- actions, loading and cooldown");
const cool = html(withCareers, { cooldownSeconds: 9 });
check("cooldown: AI next-step button disabled with 'Try again in 9s'", /<button[^>]*disabled=""[^>]*>Try again in 9s/.test(cool), null);
check("cooldown: 'Analyze skill gap' / 'Build roadmap' row buttons disabled", (cool.match(/disabled=""[^>]*>(Analyze skill gap|Build roadmap)</g) ?? []).length === 6, (cool.match(/disabled=""[^>]*>(Analyze skill gap|Build roadmap)</g) ?? []).length);
const coolFull = html(withRoadmap, { cooldownSeconds: 9 });
check("cooldown: 'View' buttons for cached results stay enabled", !/disabled=""[^>]*>View (skill gap|roadmap)</.test(coolFull), null);
check("continue-roadmap action is not blocked by cooldown (no AI request needed)", !/disabled=""[^>]*>Continue roadmap/.test(coolFull) && coolFull.includes("Continue roadmap"), null);
const busy = strip(html(withCareers, { pending: { careers: false, skillGap: true, roadmap: false } }));
check("pending skill gap: next-step shows 'Working on it…'", busy.includes("Working on it…"), null);
check("rendering never calls any handler (no requests from viewing the Dashboard)", calls.length === 0, calls);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
