// Phase 0 Step D4 (F5) tests: session persistence + validator move.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const S = await import(`${root}/src/lib/session.ts`);
const shared = await import(`${root}/src/shared/responseShape.ts`);
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  -> " + JSON.stringify(d)}`); };

const mem = new Map<string, string>();
const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
(globalThis as any).sessionStorage = storage;

const profile = { name: "Amina", educationLevel: "Undergraduate (Bachelor's)", fieldOfStudy: "CS", skills: ["Python"], interests: ["AI"], careerGoals: "Grow" };
const career = (n: number) => ({ id: `c${n}`, title: `Career ${n}`, matchScore: 90, tagline: "t", explanation: "e", whyItFitsProfile: "w", dayToDay: ["d"], coreSkills: ["s"], growthOutlook: "g" });
const careerResults = { profileSummary: "sum", careers: [career(1), career(2), career(3)] };
const gap = { careerTitle: "Career 1", readinessScore: 50, readinessSummary: "r", skillsYouHave: [], missingSkills: [], priorities: [] };
const stage = (n: number) => ({ stageNumber: n, title: "S", duration: "1w", goal: "g", topics: ["t"], tools: ["x"], resources: [{ title: "R", type: "Course", description: "d" }], project: { title: "P", description: "d", deliverables: ["o"] } });
const roadmap = { careerTitle: "Career 1", totalDuration: "8w", overview: "o", stages: [stage(1), stage(2)], careerLaunchTip: "tip" };
const session = { profile, careerResults, selectedCareerTitle: "Career 2", activeTab: "roadmap", skillGapsByCareer: { "Career 1": gap }, roadmapsByCareer: { "Career 1": roadmap }, completedStages: { "Career 1::1": true } };
const NOW = 1_700_000_000_000;
const snap = (over: object = {}) => ({ version: 1, savedAt: NOW, ...session, ...over });
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("--- save / load / clear");
S.saveSession(session, NOW);
const loaded = S.loadSession(NOW + 1000);
check("round trip restores profile, careers, selection, tab, skill gaps, roadmaps, progress", eq(loaded, session), loaded);
check("stored under careerlens:session:v1 with version + savedAt", JSON.parse(mem.get(S.SESSION_STORAGE_KEY)!).version === 1 && JSON.parse(mem.get(S.SESSION_STORAGE_KEY)!).savedAt === NOW, null);
S.clearSession();
check("clearSession removes it; load -> null", !mem.has(S.SESSION_STORAGE_KEY) && S.loadSession(NOW) === null, null);

console.log("--- invalid / outdated data is dropped safely");
const load = (raw: unknown, now = NOW) => { mem.set(S.SESSION_STORAGE_KEY, typeof raw === "string" ? raw : JSON.stringify(raw)); return S.loadSession(now); };
check("corrupt JSON -> null (no throw)", load("{not json") === null, null);
check("wrong version -> null, and removed from storage", load(snap({ version: 2 })) === null && !mem.has(S.SESSION_STORAGE_KEY), null);
check("older than 24h -> null", load(snap(), NOW + S.SESSION_MAX_AGE_MS + 1) === null, null);
check("exactly 24h old -> still restored", load(snap(), NOW + S.SESSION_MAX_AGE_MS) !== null, null);
check("savedAt far in the future -> null", load(snap({ savedAt: NOW + 3_600_000 })) === null, null);
check("savedAt missing / not a number -> null", load(snap({ savedAt: "x" })) === null, null);
check("invalid profile (no name) -> null", load(snap({ profile: { ...profile, name: "" } })) === null, null);
check("profile over server limits (name 101 chars) -> null", load(snap({ profile: { ...profile, name: "a".repeat(101) } })) === null, null);
check("career results wrong shape -> null", load(snap({ careerResults: { profileSummary: "s", careers: [{ title: 1 }] } })) === null, null);
check("no careers -> null", load(snap({ careerResults: { profileSummary: "s", careers: [] } })) === null, null);
const partial = load(snap({ roadmapsByCareer: { "Career 1": { ...roadmap, stages: "bad" }, "Career 2": roadmap }, skillGapsByCareer: { "Career 1": gap, "Unknown": gap, "Career 3": { readinessScore: "x" } } }));
check("one invalid roadmap dropped, valid one kept", partial && !partial.roadmapsByCareer["Career 1"] && !!partial.roadmapsByCareer["Career 2"], partial?.roadmapsByCareer);
check("skill gap for unknown career and invalid skill gap dropped, valid kept", partial && Object.keys(partial.skillGapsByCareer).join() === "Career 1", partial?.skillGapsByCareer);
check("unknown selected career -> first career", load(snap({ selectedCareerTitle: "Nope" }))?.selectedCareerTitle === "Career 1", null);
check("invalid tab -> finder", load(snap({ activeTab: "admin" }))?.activeTab === "finder", null);
const prog = load(snap({ completedStages: { "Career 1::1": true, "Career 1::2": false, "Ghost::1": true, "Career 2::x": true, "bad": true } }))?.completedStages;
check("progress: keeps only true entries for known careers with numeric stage", eq(prog, { "Career 1::1": true }), prog);
check("more than 3 careers -> only first 3 kept", load(snap({ careerResults: { ...careerResults, careers: [career(1), career(2), career(3), career(4)] } }))?.careerResults.careers.length === 3, null);

console.log("--- storage failures never break the app");
(globalThis as any).sessionStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => { throw new Error("x"); } };
let threw = false;
try { S.saveSession(session, NOW); S.clearSession(); } catch { threw = true; }
check("save/clear with failing storage (quota, private mode) do not throw", !threw, null);
check("load with failing storage -> null", S.loadSession(NOW) === null, null);
delete (globalThis as any).sessionStorage;
check("no sessionStorage at all -> null, no throw", S.loadSession(NOW) === null, null);
(globalThis as any).sessionStorage = storage;

console.log("--- validator move");
const handlersSrc = await (await import("node:fs/promises")).readFile(new URL(`${root}/src/server/handlers.ts`), "utf8");
check("handlers.ts imports the shared validators and no longer defines them",
  handlersSrc.includes('from "../shared/responseShape.ts"') && !/function check(Careers|SkillGap|Roadmap)Shape/.test(handlersSrc), null);
check("shared validators behave as before (valid -> null, invalid -> field path)",
  shared.checkCareersShape(careerResults) === null && shared.checkSkillGapShape(gap) === null && shared.checkRoadmapShape(roadmap) === null &&
  shared.checkRoadmapShape({ ...roadmap, stages: [{ ...stage(1), project: { title: "P", description: "d", deliverables: "x" } }] }) === "data.stages[0].project.deliverables", null);
check("careers check still ignores a malformed 4th career", shared.checkCareersShape({ ...careerResults, careers: [...careerResults.careers, { title: 7 }] }) === null, null);

console.log("--- LearningRoadmap progress now comes from App (server-rendered)");
{
  const React = (await import(`${root}/node_modules/react/index.js`)).default;
  const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
  const LR = (await import(`${root}/src/components/LearningRoadmap.tsx`)).default;
  const html = (p: object) => renderToStaticMarkup(React.createElement(LR, { profile, careers: careerResults.careers, selectedCareer: careerResults.careers[0], roadmap, isLoading: false, onSelectCareerForRoadmap: () => {}, onGoToFinder: () => {}, ...p }));
  check("completedStages prop {1:true} -> '1/2 Stages', width 50%, one 'Completed'", html({ completedStages: { 1: true } }).includes("1/2 Stages") && html({ completedStages: { 1: true } }).includes("width:50%") && (html({ completedStages: { 1: true } }).match(/>Completed</g) ?? []).length === 1, null);
  check("no progress prop -> '0/2 Stages' (renders without it)", html({}).includes("0/2 Stages"), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
