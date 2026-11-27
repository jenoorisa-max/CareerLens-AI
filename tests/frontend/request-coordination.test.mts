// Phase 0 Step D2 (F1–F3) tests. Drives the real coordinator from
// src/lib/requests.ts (the code App.tsx uses) with a fake `post` whose
// responses are resolved manually, so every ordering is deterministic.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const { createRequestCoordinator, InFlightRequests, requestKey } = await import(`${root}/src/lib/requests.ts`);

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Resolves to the value, or "PENDING" if the promise has not settled within ms (avoids hangs). */
const settle = <T,>(p: Promise<T>, ms = 30) =>
  Promise.race([p, new Promise<"PENDING">((r) => setTimeout(() => r("PENDING"), ms))]);
let summaryPrinted = false;
process.on("exit", () => {
  if (!summaryPrinted) {
    console.log(`\n${pass} passed, ${fail} failed — ABORTED: a test awaited a request that never settled`);
    process.exitCode = 1;
  }
});

// ------------------------------------------------------------------ harness
type Call = { url: string; body: any; resolve: (r: any) => void };
function harness() {
  const calls: Call[] = [];
  const post = (url: string, body: unknown) =>
    new Promise<any>((resolve) => calls.push({ url, body: JSON.parse(JSON.stringify(body)), resolve }));
  const state = {
    profile: null as any, careers: null as any, skillGaps: {} as Record<string, any>, roadmaps: {} as Record<string, any>,
    errors: [] as string[], changes: 0, setCareersCalls: 0,
    searchFailures: [] as { profile: any; message: string; retryable: boolean }[],
  };
  const store = {
    getProfile: () => state.profile,
    getSkillGap: (t: string) => state.skillGaps[t],
    getRoadmap: (t: string) => state.roadmaps[t],
    commitAssessment: (p: any, d: any) => { state.setCareersCalls++; state.profile = p; state.careers = d; state.skillGaps = {}; state.roadmaps = {}; },
    onSearchFailed: (p: any, message: string, retryable: boolean) => { state.searchFailures.push({ profile: p, message, retryable }); },
    setSkillGap: (t: string, d: any) => { state.skillGaps = { ...state.skillGaps, [t]: d }; },
    setRoadmap: (t: string, d: any) => { state.roadmaps = { ...state.roadmaps, [t]: d }; },
    setError: (m: string) => { state.errors.push(m); },
    onRequestsChanged: () => { state.changes++; },
  };
  const c = createRequestCoordinator(store, post as any);
  const to = (url: string) => calls.filter((x) => x.url === url);
  return { c, calls, state, to };
}
const ok = (data: unknown) => ({ ok: true, status: 200, data });
const err = (status: number, message: string) => ({ ok: false, status, message });
const A = { id: "a", title: "Data Analyst", tagline: "t", coreSkills: ["SQL"] };
const B = { id: "b", title: "UX Designer", tagline: "t", coreSkills: ["Figma"] };
const P1 = { name: "Old Student" }, P2 = { name: "New Student" };
const GAP_A = { careerTitle: "Data Analyst", readinessScore: 40, skillsYouHave: [], missingSkills: [], priorities: [] };
const ROAD_A = { careerTitle: "Data Analyst", stages: [] };
const DELIB = { trigger: "deliberate" }, NAV = { trigger: "navigation" }, REFRESH = { trigger: "deliberate", forceRefresh: true };

// ================================================================ F1
console.log("--- F1: duplicate requests");
{
  const { c, state, to } = harness(); state.profile = P1;
  const p1 = c.analyzeSkillGap(A, DELIB), p2 = c.analyzeSkillGap(A, DELIB), p3 = c.analyzeSkillGap(A, NAV), p4 = c.analyzeSkillGap(A, REFRESH);
  check("4 calls for the same career while pending (deliberate, navigation, force-refresh) -> 1 request", to("/api/skill-gap").length === 1, to("/api/skill-gap").length);
  check("all callers share the same promise", p1 === p2 && p2 === p3 && p3 === p4, null);
  check("isPending(skill-gap, A) true while running", c.isPending("skill-gap", A.title), null);
  to("/api/skill-gap")[0].resolve(ok(GAP_A));
  const [r1, r4] = await Promise.all([p1, p4]);
  check("every caller receives the result; isPending false afterwards", r1 === GAP_A && r4 === GAP_A && !c.isPending("skill-gap", A.title), null);
  await c.analyzeSkillGap(A, DELIB);
  check("after success, a normal click uses the cache (no new request)", to("/api/skill-gap").length === 1, to("/api/skill-gap").length);
  const again = c.analyzeSkillGap(A, REFRESH);
  check("Re-analyze (forceRefresh) after completion -> exactly 1 new request", to("/api/skill-gap").length === 2, to("/api/skill-gap").length);
  to("/api/skill-gap")[1].resolve(ok({ ...GAP_A, readinessScore: 55 })); await again;
  check("refreshed result replaces the cached one", state.skillGaps[A.title].readinessScore === 55, state.skillGaps[A.title]);

  const r1b = c.generateRoadmap(A, DELIB), r2b = c.generateRoadmap(A, DELIB);
  await tick();
  check("roadmap: 2 clicks while pending -> 1 request, same promise", to("/api/roadmap").length === 1 && r1b === r2b, to("/api/roadmap").length);
  to("/api/roadmap")[0].resolve(ok(ROAD_A)); await r1b;
}

console.log("--- F1: simultaneous requests for different careers");
{
  const { c, state, to } = harness(); state.profile = P1;
  const pa = c.analyzeSkillGap(A, DELIB), pb = c.analyzeSkillGap(B, DELIB);
  check("career A and B run in parallel -> 2 requests", to("/api/skill-gap").length === 2, null);
  check("both pending independently", c.isPending("skill-gap", A.title) && c.isPending("skill-gap", B.title), null);
  to("/api/skill-gap")[1].resolve(ok({ ...GAP_A, careerTitle: "UX Designer" })); await pb;
  check("B finishing does NOT clear A's pending state (old shared-flag bug)", c.isPending("skill-gap", A.title) && !c.isPending("skill-gap", B.title), null);
  check("B stored under B only", state.skillGaps[B.title]?.careerTitle === "UX Designer" && !state.skillGaps[A.title], state.skillGaps);
  to("/api/skill-gap")[0].resolve(ok(GAP_A)); await pa;
  check("A stored under A; nothing pending", state.skillGaps[A.title] === GAP_A && !c.isPending("skill-gap", A.title), null);
}

// ================================================================ sessions
console.log("--- Sessions: successful new search while older requests run");
{
  const { c, state, to } = harness(); state.profile = P1;
  const oldGap = c.analyzeSkillGap(A, DELIB);
  const oldRoad = c.generateRoadmap(B, DELIB);
  await tick();
  const sessionBefore = c.sessionId;
  const newSearch = c.findCareers(P2 as any);
  check("search pending: previous assessment untouched (profile not switched yet)", state.profile === P1 && c.sessionId === sessionBefore && c.isPending("careers"), { s: c.sessionId });
  check("search pending: previous assessment's requests keep running", c.isPending("skill-gap", A.title) && c.isPending("roadmap", B.title), null);
  const sameDuringSearch = c.analyzeSkillGap(A, DELIB);
  check("during the search, the old assessment still dedupes (no extra request)", sameDuringSearch === oldGap && to("/api/skill-gap").length === 1, null);

  to("/api/careers")[0].resolve(ok({ profileSummary: "new", careers: [A, B] })); await newSearch;
  check("search success commits new profile + careers together, in a new session", state.profile === P2 && state.careers.profileSummary === "new" && c.sessionId === sessionBefore + 1 && state.setCareersCalls === 1, { s: c.sessionId });
  check("old requests no longer count as pending in the new session", !c.isPending("skill-gap", A.title) && !c.isPending("roadmap", B.title) && !c.isPending("careers"), null);

  const newGap = c.analyzeSkillGap(A, DELIB);
  check("same career in new session -> NEW request (old promise not reused)", to("/api/skill-gap").length === 2 && newGap !== oldGap, to("/api/skill-gap").length);
  check("new request carries the new profile", to("/api/skill-gap")[1].body.profile.name === "New Student", to("/api/skill-gap")[1].body.profile);

  to("/api/skill-gap")[0].resolve(ok({ ...GAP_A, careerTitle: "STALE" }));
  to("/api/roadmap")[0].resolve(err(502, "busy"));
  const [oldGapResult, oldRoadResult] = await Promise.all([oldGap, oldRoad]);
  check("LATE old skill-gap result ignored (not stored, resolves null)", oldGapResult === null && !state.skillGaps[A.title], state.skillGaps);
  check("LATE old failure ignored (no error banner, no failed flag in new session)", state.errors.length === 0 && oldRoadResult === null && !c.hasFailed("roadmap", B.title), state.errors);
  check("old request settling did NOT remove the new session's entry", c.isPending("skill-gap", A.title), null);

  to("/api/skill-gap")[1].resolve(ok(GAP_A)); await newGap;
  check("new session results stored normally", state.skillGaps[A.title] === GAP_A, state.skillGaps);
}

console.log("--- Follow-up: FAILED new search keeps the previous assessment intact");
{
  const { c, state, to } = harness();
  state.profile = P1; state.careers = { profileSummary: "OLD", careers: [A, B] }; state.skillGaps = { [B.title]: { ...GAP_A, careerTitle: "UX Designer" } };
  const failedBefore = c.analyzeSkillGap(A, DELIB); to("/api/skill-gap")[0].resolve(err(502, "busy")); await failedBefore;
  const oldGap = c.analyzeSkillGap(A, DELIB);              // deliberate retry, still running during the search
  const sessionBefore = c.sessionId;
  const search = c.findCareers(P2 as any);
  to("/api/careers")[0].resolve(err(502, "The AI service is busy right now. Please try again in a moment.")); await search;
  check("failed search: profile still the previous one (never mixed with new profile)", state.profile === P1, state.profile);
  check("failed search: previous careers and caches kept", state.careers.profileSummary === "OLD" && state.skillGaps[B.title]?.careerTitle === "UX Designer", state.careers);
  check("failed search: reported once with the attempted (new) profile, message and retryable=true",
    state.searchFailures.length === 1 && state.searchFailures[0].profile === P2 && state.searchFailures[0].message.includes("busy") && state.searchFailures[0].retryable === true, state.searchFailures);
  check("failed search: no new session, careers no longer pending", c.sessionId === sessionBefore && !c.isPending("careers"), null);
  to("/api/skill-gap")[1].resolve(ok(GAP_A)); await oldGap;
  check("previous assessment's request finishing AFTER the failed search is still stored (still valid)", state.skillGaps[A.title] === GAP_A && state.profile === P1, state.skillGaps);

  const retry = c.findCareers(P2 as any);
  check("retry sends a new careers request with the attempted profile", to("/api/careers").length === 2 && to("/api/careers")[1].body.name === "New Student", null);
  to("/api/careers")[1].resolve(ok({ profileSummary: "NEW", careers: [A] })); await retry;
  check("retry success commits the new assessment and clears the old caches", state.profile === P2 && state.careers.profileSummary === "NEW" && Object.keys(state.skillGaps).length === 0, state);
}
{
  const { c, state, to } = harness();
  const s = c.findCareers(P1 as any); to("/api/careers")[0].resolve(err(400, "Name must be 100 characters or fewer.")); await s;
  check("400 (input problem) -> reported with retryable=false; no assessment created", state.searchFailures[0]?.retryable === false && state.profile === null && state.careers === null, state.searchFailures);
}
{
  const statuses: [number, boolean][] = [[0, true], [408, true], [429, true], [500, true], [503, true], [504, true], [400, false], [404, false], [413, false]];
  const { isRetryableStatus } = await import(`${root}/src/lib/requests.ts`);
  check(`isRetryableStatus: ${statuses.map(([s, r]) => `${s}=${r}`).join(", ")}`, statuses.every(([s, r]) => isRetryableStatus(s) === r), null);
}
{
  const { c, state, to } = harness();
  const first = c.findCareers(P1 as any);
  const second = c.findCareers(P2 as any);                // (UI disables submit; guarded anyway)
  check("two searches never share a promise", first !== second && to("/api/careers").length === 2, null);
  to("/api/careers")[1].resolve(ok({ profileSummary: "SECOND", careers: [A] })); await second;
  to("/api/careers")[0].resolve(ok({ profileSummary: "FIRST", careers: [B] })); await first;
  check("LATE response from an older search cannot overwrite the newer one", state.careers.profileSummary === "SECOND" && state.profile === P2 && state.setCareersCalls === 1, state.careers);
}
{
  const { c, state, to } = harness();
  const first = c.findCareers(P1 as any);
  const second = c.findCareers(P2 as any);
  to("/api/careers")[1].resolve(err(502, "busy")); await second;
  to("/api/careers")[0].resolve(ok({ profileSummary: "FIRST", careers: [B] })); await first;
  check("older search succeeding after a newer one FAILED is still ignored", state.careers === null && state.profile === null && state.searchFailures.length === 1, state);
}
{
  const { c, state, to } = harness();
  const s = c.findCareers(P1 as any); c.reset();
  check("New Assessment during a search: careers no longer pending", !c.isPending("careers"), null);
  to("/api/careers")[0].resolve(err(502, "busy")); await s;
  check("search failing after New Assessment is not reported", state.searchFailures.length === 0 && state.errors.length === 0, state);
}
{
  const { c, state, to } = harness();
  const s1 = c.findCareers(P1 as any);
  c.reset();                                    // New Assessment while search 1 runs
  const s2 = c.findCareers(P2 as any);
  check("search after New Assessment sends its own request (2 total)", to("/api/careers").length === 2, null);
  check("requests carry their own profiles", to("/api/careers")[0].body.name === "Old Student" && to("/api/careers")[1].body.name === "New Student", null);
  to("/api/careers")[1].resolve(ok({ profileSummary: "NEW", careers: [A] })); await s2;
  to("/api/careers")[0].resolve(ok({ profileSummary: "OLD", careers: [B] })); await s1;
  check("old search finishing LATER cannot overwrite the new results", state.careers.profileSummary === "NEW" && state.setCareersCalls === 1, state.careers);
}
{
  const { c, state, to } = harness(); state.profile = P1;
  const g = c.analyzeSkillGap(A, DELIB);
  c.reset();
  check("New Assessment clears pending state immediately", !c.isPending("skill-gap", A.title), null);
  to("/api/skill-gap")[0].resolve(ok(GAP_A)); await g;
  check("result arriving after New Assessment is ignored", Object.keys(state.skillGaps).length === 0, state.skillGaps);
}

console.log("--- InFlightRequests: ownership-checked cleanup");
{
  let changes = 0;
  const reg = new InFlightRequests(() => changes++);
  let starts = 0, resolveDup!: (v: string) => void;
  const d1 = reg.run("D", () => { starts++; return new Promise<string>((r) => (resolveDup = r)); });
  const d2 = reg.run("D", () => { starts++; return Promise.resolve("second"); });
  check("run() with the same key while pending reuses the promise (start called once)", d1 === d2 && starts === 1, { starts });
  resolveDup("first"); await d1; await tick();
  let resolveOld!: (v: string) => void, resolveNew!: (v: string) => void;
  const oldP = reg.run("K", () => new Promise<string>((r) => (resolveOld = r)));
  reg.clear();                                                 // session invalidation
  const newP = reg.run("K", () => new Promise<string>((r) => (resolveNew = r)));
  check("after clear(), same key starts a NEW promise", newP !== oldP, null);
  resolveOld("old"); await oldP; await tick();
  check("older promise settling does NOT delete the newer entry", reg.has("K") && reg.get("K") === newP, null);
  resolveNew("new"); await newP; await tick();
  check("newer promise removes its own entry", !reg.has("K"), null);
  const rej = reg.run("R", () => Promise.reject(new Error("x"))); await rej.catch(() => {}); await tick();
  check("rejected promise is also cleaned up", !reg.has("R"), null);
  const thrown = reg.run("T", () => { throw new Error("sync"); }); await thrown.catch(() => {}); await tick();
  check("synchronous throw in start() becomes a rejection and is cleaned up", !reg.has("T"), null);
  check("request keys include the session id and are collision-safe",
    requestKey(1, "skill-gap", "A") !== requestKey(2, "skill-gap", "A") &&
    requestKey(1, "skill-gap", 'x","roadmap') !== requestKey(1, "roadmap", "x") , null);
}

// ================================================================ F2
console.log("--- F2: roadmap waits for the matching skill gap");
{
  const { c, state, to } = harness(); state.profile = P1;
  const gap = c.analyzeSkillGap(A, DELIB);
  const road = c.generateRoadmap(A, DELIB);
  await tick();
  check("roadmap request NOT sent while the skill gap is still running", to("/api/roadmap").length === 0, to("/api/roadmap").length);
  check("roadmap counts as pending while waiting", c.isPending("roadmap", A.title), null);
  const roadAgain = c.generateRoadmap(A, DELIB);
  check("second roadmap click while waiting reuses the same request", roadAgain === road, null);
  to("/api/skill-gap")[0].resolve(ok(GAP_A)); await gap; await tick();
  check("after the skill gap finishes: exactly 1 roadmap request", to("/api/roadmap").length === 1, to("/api/roadmap").length);
  check("roadmap request includes the skill gap result as context", JSON.stringify(to("/api/roadmap")[0].body.skillGap) === JSON.stringify(GAP_A), to("/api/roadmap")[0].body);
  to("/api/roadmap")[0].resolve(ok(ROAD_A)); await road;
  check("roadmap stored", state.roadmaps[A.title] === ROAD_A, null);
}
{
  const { c, state, to } = harness(); state.profile = P1;
  const gap = c.analyzeSkillGap(A, DELIB), road = c.generateRoadmap(A, DELIB);
  to("/api/skill-gap")[0].resolve(err(502, "busy")); await gap; await tick();
  check("skill gap fails -> roadmap still generated, with skillGap null (existing fallback)", to("/api/roadmap").length === 1 && to("/api/roadmap")[0].body.skillGap === null, to("/api/roadmap")[0]?.body);
  to("/api/roadmap")[0].resolve(ok(ROAD_A)); await road;
}
{
  const { c, state, to } = harness(); state.profile = P1; state.skillGaps[A.title] = GAP_A;
  const road = c.generateRoadmap(A, DELIB); await tick();
  check("cached skill gap used immediately", to("/api/roadmap").length === 1 && to("/api/roadmap")[0].body.skillGap?.readinessScore === 40, null);
  to("/api/roadmap")[0].resolve(ok(ROAD_A)); await road;
}
{
  const { c, state, to } = harness(); state.profile = P1;
  const road = c.generateRoadmap(A, DELIB); await tick();
  check("no skill gap at all -> roadmap sent with null and NO skill-gap request started", to("/api/roadmap").length === 1 && to("/api/roadmap")[0].body.skillGap === null && to("/api/skill-gap").length === 0, null);
  to("/api/roadmap")[0].resolve(ok(ROAD_A)); await road;
}
{
  const { c, state, to } = harness(); state.profile = P1;
  const gap = c.analyzeSkillGap(A, DELIB), road = c.generateRoadmap(A, DELIB);
  c.reset();
  to("/api/skill-gap")[0].resolve(ok(GAP_A)); await gap; const r = await road;
  check("session changes while roadmap waits -> roadmap request never sent", to("/api/roadmap").length === 0 && r === null, to("/api/roadmap").length);
}
{
  const { c, state, to } = harness(); state.profile = P1;
  const gapB = c.analyzeSkillGap(B, DELIB), roadA = c.generateRoadmap(A, DELIB); await tick();
  check("roadmap for A does not wait for B's skill gap", to("/api/roadmap").length === 1 && to("/api/roadmap")[0].body.skillGap === null, null);
  to("/api/skill-gap")[0].resolve(ok(GAP_A)); to("/api/roadmap")[0].resolve(ok(ROAD_A)); await Promise.all([gapB, roadA]);
}

// ================================================================ F3
console.log("--- F3: failure, then tab switching, then deliberate retry");
{
  const { c, state, to } = harness(); state.profile = P1;
  const first = c.analyzeSkillGap(A, NAV);
  check("first visit (never attempted) auto-loads", to("/api/skill-gap").length === 1, null);
  to("/api/skill-gap")[0].resolve(err(502, "The AI service is busy right now. Please try again in a moment.")); await first;
  check("failure recorded and error shown", c.hasFailed("skill-gap", A.title) && state.errors.length === 1, state.errors);
  const nav1 = await settle(c.analyzeSkillGap(A, NAV)), nav2 = await settle(c.analyzeSkillGap(A, NAV));
  check("tab switching after failure -> no new request (x2)", to("/api/skill-gap").length === 1 && nav1 === null && nav2 === null, to("/api/skill-gap").length);
  check("failed flag stays until a deliberate retry", c.hasFailed("skill-gap", A.title), null);
  const retry = c.analyzeSkillGap(A, DELIB);
  check("deliberate retry (career card button) sends a request and clears the failed flag", to("/api/skill-gap").length === 2 && !c.hasFailed("skill-gap", A.title), null);
  to("/api/skill-gap")[1].resolve(ok(GAP_A)); await retry;
  check("retry success stored", state.skillGaps[A.title] === GAP_A && !c.hasFailed("skill-gap", A.title), null);
}
{
  const { c, state, to } = harness(); state.profile = P1;
  const f = c.analyzeSkillGap(A, DELIB); to("/api/skill-gap")[0].resolve(err(500, "quota")); await f;
  const re = c.analyzeSkillGap(A, REFRESH);
  check("Re-analyze (deliberate + forceRefresh) after failure retries", to("/api/skill-gap").length === 2, null);
  to("/api/skill-gap")[1].resolve(err(502, "busy")); await re;
  check("a failed retry marks it failed again", c.hasFailed("skill-gap", A.title), null);
}
{
  const { c, state, to } = harness(); state.profile = P1;
  const f = c.generateRoadmap(A, DELIB); await tick(); to("/api/roadmap")[0].resolve(err(504, "slow")); await f;
  await settle(c.generateRoadmap(A, NAV)); await settle(c.generateRoadmap(A, NAV));
  check("roadmap: failure + tab switching -> no new request", to("/api/roadmap").length === 1 && c.hasFailed("roadmap", A.title), null);
  const regen = c.generateRoadmap(A, REFRESH); await tick();
  check("roadmap: Regenerate (deliberate) after failure retries", to("/api/roadmap").length === 2 && !c.hasFailed("roadmap", A.title), null);
  to("/api/roadmap")[1].resolve(ok(ROAD_A)); await regen;
  const viaCta = c.generateRoadmap(B, DELIB); await tick();
  check("'Generate Learning Roadmap' / card button (deliberate) works for another career", to("/api/roadmap").length === 3, null);
  to("/api/roadmap")[2].resolve(ok(ROAD_A)); await viaCta;
}
{
  const { c, state, to } = harness(); state.profile = P1;
  const f = c.analyzeSkillGap(A, DELIB); to("/api/skill-gap")[0].resolve(err(502, "busy")); await f;
  const other = c.analyzeSkillGap(B, NAV);
  check("failure of career A does not block auto-load of career B", to("/api/skill-gap").length === 2, null);
  to("/api/skill-gap")[1].resolve(ok(GAP_A)); await other;
  const s = c.findCareers(P1 as any); to("/api/careers")[0].resolve(ok({ profileSummary: "x", careers: [A] })); await s;
  const after = c.analyzeSkillGap(A, NAV);
  check("new session clears old failures (navigation auto-loads again)", to("/api/skill-gap").length === 3, null);
  to("/api/skill-gap")[2].resolve(ok(GAP_A)); await after;
}
{
  const { c, state, to } = harness();
  const r = await c.analyzeSkillGap(A, DELIB);
  check("no profile -> no request", r === null && to("/api/skill-gap").length === 0, null);
  const { c: c2, state: st2, to: to2 } = harness(); st2.profile = P1;
  const before = st2.changes; const p = c2.analyzeSkillGap(A, DELIB);
  check("pending changes notify App to re-render", st2.changes > before, null);
  to2("/api/skill-gap")[0].resolve(ok(GAP_A)); await p; await tick();
  check("completion also notifies App", st2.changes >= before + 2, st2.changes - before);
}

// ================================================================ UI notices
console.log("--- Inline failure notices (real components, server-rendered)");
{
  const React = (await import(`${root}/node_modules/react/index.js`)).default;
  const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
  const SG = (await import(`${root}/src/components/SkillGapAnalyzer.tsx`)).default;
  const LR = (await import(`${root}/src/components/LearningRoadmap.tsx`)).default;
  const profile = { name: "T", educationLevel: "U", fieldOfStudy: "CS", skills: ["x"], interests: ["y"], careerGoals: "g" };
  const careers = [{ ...A, matchScore: 80, explanation: "", whyItFitsProfile: "", dayToDay: [], growthOutlook: "" }];
  const noop = () => {};
  const sg = (p: object) => renderToStaticMarkup(React.createElement(SG, { profile, careers, selectedCareer: careers[0], analysis: null, isLoading: false, onSelectCareer: noop, onGoToRoadmap: noop, onGoToFinder: noop, ...p }));
  const lr = (p: object) => renderToStaticMarkup(React.createElement(LR, { profile, careers, selectedCareer: careers[0], roadmap: null, isLoading: false, onSelectCareerForRoadmap: noop, onGoToFinder: noop, ...p }));
  check("SkillGapAnalyzer: notice shown when failed", sg({ hasFailed: true }).includes("This analysis didn&#x27;t complete") && sg({ hasFailed: true }).includes("Use Re-analyze above"), null);
  check("SkillGapAnalyzer: no notice when not failed, or while loading", !sg({}).includes("didn&#x27;t complete") && !sg({ hasFailed: true, isLoading: true }).includes("didn&#x27;t complete"), null);
  check("SkillGapAnalyzer: old analysis still shown (no notice) if a refresh failed", !sg({ hasFailed: true, analysis: { ...GAP_A, readinessSummary: "s" } }).includes("didn&#x27;t complete"), null);
  check("LearningRoadmap: notice shown when failed", lr({ hasFailed: true }).includes("This roadmap didn&#x27;t complete") && lr({ hasFailed: true }).includes("Use Regenerate above"), null);
  check("LearningRoadmap: no notice when not failed, or while loading", !lr({}).includes("didn&#x27;t complete") && !lr({ hasFailed: true, isLoading: true }).includes("didn&#x27;t complete"), null);
  check("hasFailed is optional (components render without it)", sg({}).length > 0 && lr({}).length > 0, null);

  const CF = (await import(`${root}/src/components/CareerFinder.tsx`)).default;
  const oldProfile = { ...profile, name: "Old Student", fieldOfStudy: "Biology" };
  const results = { profileSummary: "OLD SUMMARY", careers: [{ ...careers[0], coreSkills: ["SQL"] }] };
  const cf = (p: object) => renderToStaticMarkup(React.createElement(CF, { initialProfile: profile, careerResults: results, resultsProfile: oldProfile, isLoading: false,
    onSubmitProfile: async () => {}, onSelectForSkillGap: noop, onSelectForRoadmap: noop, onRetrySearch: noop, ...p }));
  const failedHtml = cf({ searchFailure: { message: "The AI service is busy right now.", retryable: true } });
  check("CareerFinder: failed search -> clear notice + server message", failedHtml.includes("couldn&#x27;t generate career paths for your updated details") && failedHtml.includes("The AI service is busy right now."), null);
  check("CareerFinder: old results explicitly labelled as the PREVIOUS assessment for the old profile",
    failedHtml.includes("previous assessment for") && failedHtml.includes("Old Student") && failedHtml.includes("Biology"), null);
  check("CareerFinder: retryable failure shows a Try again button", failedHtml.includes("Try again"), null);
  check("CareerFinder: non-retryable (400) failure hides Try again", !cf({ searchFailure: { message: "Name too long", retryable: false } }).includes("Try again"), null);
  const firstSearchFailed = cf({ careerResults: null, resultsProfile: null, searchFailure: { message: "busy", retryable: true } });
  check("CareerFinder: first search failed (no previous results) -> notice without 'previous assessment' text", firstSearchFailed.includes("couldn&#x27;t generate") && !firstSearchFailed.includes("previous assessment"), null);
  check("CareerFinder: no notice when no failure, or while a search is loading",
    !cf({}).includes("couldn&#x27;t generate") && !cf({ isLoading: true, searchFailure: { message: "busy", retryable: true } }).includes("couldn&#x27;t generate"), null);
  check("CareerFinder: results always state which profile they belong to ('For Old Student · Biology')", cf({}).includes("For Old Student · Biology"), null);
}

summaryPrinted = true;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
