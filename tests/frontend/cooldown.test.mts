// Phase 0 Step D3 (F4) tests: global 15s cooldown after 503/429. Fake clock, no network.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const R = await import(`${root}/src/lib/requests.ts`);
const { createRequestCoordinator, COOLDOWN_MS, loadCooldownUntil, saveCooldownUntil, COOLDOWN_STORAGE_KEY } = R;

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const tick = () => new Promise((r) => setTimeout(r, 0));

function harness(initialCooldownUntil?: number) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => { t += ms; } };
  const calls: { url: string; body: any; resolve: (r: any) => void }[] = [];
  const post = (url: string, body: unknown) => new Promise<any>((resolve) => calls.push({ url, body, resolve }));
  const st = { profile: { name: "S" } as any, gaps: {} as any, roads: {} as any, saved: [] as number[], failures: [] as any[] };
  const c = createRequestCoordinator({
    getProfile: () => st.profile, getSkillGap: (k: string) => st.gaps[k], getRoadmap: (k: string) => st.roads[k],
    commitAssessment: (p: any) => { st.profile = p; }, onSearchFailed: (...a: any[]) => st.failures.push(a),
    setSkillGap: (k: string, d: any) => { st.gaps[k] = d; }, setRoadmap: (k: string, d: any) => { st.roads[k] = d; },
    setError: () => {}, onRequestsChanged: () => {}, onCooldownChanged: (u: number) => st.saved.push(u),
  }, post as any, { now: clock.now, initialCooldownUntil });
  const to = (u: string) => calls.filter((x) => x.url === u);
  return { c, clock, st, to };
}
const ok = (data: unknown) => ({ ok: true, status: 200, data });
const err = (status: number) => ({ ok: false, status, message: "m" });
const A = { title: "A", tagline: "t", coreSkills: [] }, B = { title: "B", tagline: "t", coreSkills: [] };
const NAV = { trigger: "navigation" }, DELIB = { trigger: "deliberate" }, REFRESH = { trigger: "deliberate", forceRefresh: true };

console.log("--- cooldown starts on 503/429 only");
for (const [status, expect] of [[503, true], [429, true], [500, false], [502, false], [504, false], [400, false], [0, false]] as [number, boolean][]) {
  const { c, clock, st, to } = harness();
  const p = c.analyzeSkillGap(A, DELIB); to("/api/skill-gap")[0].resolve(err(status)); await p;
  const started = c.isCoolingDown();
  check(`HTTP ${status} -> cooldown ${expect ? "starts (15s, persisted)" : "not started"}`,
    started === expect && (!expect || (c.cooldownUntil === clock.now() + COOLDOWN_MS && st.saved[0] === c.cooldownUntil)), { started, saved: st.saved });
}
{
  const { c, to } = harness();
  const s = c.findCareers({ name: "N" } as any); to("/api/careers")[0].resolve(err(429)); await s;
  check("careers 429 also starts the cooldown", c.isCoolingDown(), null);
  const { c: c2, to: to2 } = harness();
  const r = c2.generateRoadmap(A, DELIB); await tick(); to2("/api/roadmap")[0].resolve(err(503)); await r;
  check("roadmap 503 also starts the cooldown", c2.isCoolingDown(), null);
}

console.log("--- global: no requests during cooldown");
{
  const { c, clock, st, to } = harness();
  st.gaps["B"] = { cached: true };
  const p = c.analyzeSkillGap(A, DELIB); to("/api/skill-gap")[0].resolve(err(503)); await p;
  const nav = await c.analyzeSkillGap(B, NAV), cached = await c.analyzeSkillGap(B, NAV);
  check("cached results still shown during cooldown (no request)", (cached as any)?.cached === true && to("/api/skill-gap").length === 1, null);
  st.gaps = {};
  await c.analyzeSkillGap(B, NAV); await c.analyzeSkillGap(B, DELIB); await c.generateRoadmap(A, NAV); await c.generateRoadmap(B, REFRESH);
  await c.findCareers({ name: "X" } as any);
  check("automatic AND button-triggered requests suppressed across all features", to("/api/skill-gap").length === 1 && to("/api/roadmap").length === 0 && to("/api/careers").length === 0, { sg: to("/api/skill-gap").length, rm: to("/api/roadmap").length, cr: to("/api/careers").length });
  check("suppressed requests are marked so the view offers a manual retry", c.hasFailed("skill-gap", "B") && c.hasFailed("roadmap", "A") && c.hasFailed("roadmap", "B"), null);

  clock.advance(COOLDOWN_MS - 1);
  check("still cooling down at 14.999s", c.isCoolingDown(), null);
  clock.advance(1);
  check("cooldown over at exactly 15s", !c.isCoolingDown(), null);
  await c.analyzeSkillGap(B, NAV);
  check("after expiry: tab switching does NOT auto-retry (F3 still applies)", to("/api/skill-gap").length === 1, to("/api/skill-gap").length);
  const retry = c.analyzeSkillGap(B, REFRESH);
  check("after expiry: manual retry (Re-analyze) sends the request", to("/api/skill-gap").length === 2 && !c.hasFailed("skill-gap", "B"), null);
  to("/api/skill-gap")[1].resolve(ok({ g: 1 })); await retry;
  const s = c.findCareers({ name: "Y" } as any);
  check("after expiry: career search allowed again", to("/api/careers").length === 1, null);
  to("/api/careers")[0].resolve(ok({ careers: [] })); await s;
}
{
  const { c, to } = harness();
  const gap = c.analyzeSkillGap(A, DELIB), road = c.generateRoadmap(A, DELIB);
  to("/api/skill-gap")[0].resolve(err(503)); await gap; await road;
  check("roadmap waiting on a skill gap that hit 503 is NOT sent; marked for manual retry", to("/api/roadmap").length === 0 && c.hasFailed("roadmap", "A"), to("/api/roadmap").length);
}

console.log("--- persistence across refresh");
{
  const t0 = 1_000_000;
  const mk = (u: number) => harness(u).c;
  check("restored future value (10s left) -> cooling down", mk(t0 + 10_000).isCoolingDown() && mk(t0 + 10_000).cooldownUntil === t0 + 10_000, null);
  check("restored expired value -> no cooldown", !mk(t0 - 1).isCoolingDown() && mk(t0 - 1).cooldownUntil === 0, null);
  check("restored value far in the future is capped to 15s", mk(t0 + 9_999_999).cooldownUntil === t0 + COOLDOWN_MS, mk(t0 + 9_999_999).cooldownUntil);
  check("restored NaN / missing -> no cooldown", !mk(NaN).isCoolingDown() && !harness().c.isCoolingDown(), null);

  const mem = new Map<string, string>();
  (globalThis as any).sessionStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v) };
  saveCooldownUntil(12345678);
  check("save/load round-trip via sessionStorage key", mem.get(COOLDOWN_STORAGE_KEY) === "12345678" && loadCooldownUntil() === 12345678, [...mem]);
  mem.set(COOLDOWN_STORAGE_KEY, "garbage");
  check("invalid stored value -> 0", loadCooldownUntil() === 0, null);
  (globalThis as any).sessionStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
  let threw = false; try { saveCooldownUntil(1); } catch { threw = true; }
  check("storage throwing (private mode / quota) -> load 0, save does not throw", loadCooldownUntil() === 0 && !threw, null);
  delete (globalThis as any).sessionStorage;
  check("no sessionStorage at all -> load 0", loadCooldownUntil() === 0, null);
}

console.log("--- countdown UI (real components, server-rendered)");
{
  const React = (await import(`${root}/node_modules/react/index.js`)).default;
  const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
  const CF = (await import(`${root}/src/components/CareerFinder.tsx`)).default;
  const SG = (await import(`${root}/src/components/SkillGapAnalyzer.tsx`)).default;
  const LR = (await import(`${root}/src/components/LearningRoadmap.tsx`)).default;
  const profile = { name: "T", educationLevel: "U", fieldOfStudy: "CS", skills: ["x"], interests: ["y"], careerGoals: "g" };
  const career = { id: "a", title: "Data Analyst", matchScore: 80, tagline: "t", explanation: "", whyItFitsProfile: "", dayToDay: [], coreSkills: [], growthOutlook: "" };
  const noop = () => {};
  const h = (C: any, p: object) => renderToStaticMarkup(React.createElement(C, p));
  const cf = (p: object) => h(CF, { initialProfile: profile, careerResults: null, isLoading: false, onSubmitProfile: async () => {}, onSelectForSkillGap: noop, onSelectForRoadmap: noop, onRetrySearch: noop, ...p });
  const sg = (p: object) => h(SG, { profile, careers: [career], selectedCareer: career, analysis: null, isLoading: false, onSelectCareer: noop, onGoToRoadmap: noop, onGoToFinder: noop, ...p });
  const lr = (p: object) => h(LR, { profile, careers: [career], selectedCareer: career, roadmap: null, isLoading: false, onSelectCareerForRoadmap: noop, onGoToFinder: noop, ...p });
  const submitBtn = (html: string) => html.match(/<button type="submit"[^>]*>.*?<\/button>/)?.[0] ?? "";

  check("Find 3 Career Paths -> 'Try again in 12s' and disabled during cooldown", submitBtn(cf({ cooldownSeconds: 12 })).includes("Try again in 12s") && /disabled=""/.test(submitBtn(cf({ cooldownSeconds: 12 }))), submitBtn(cf({ cooldownSeconds: 12 })));
  check("Find 3 Career Paths -> normal and enabled when no cooldown", submitBtn(cf({})).includes("Find 3 Career Paths") && !/disabled=""/.test(submitBtn(cf({}))), null);
  const failed = cf({ cooldownSeconds: 7, searchFailure: { message: "busy", retryable: true } });
  check("search 'Try again' button shows countdown and is disabled", failed.includes("Try again in 7s") && /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Try again in 7s/s.test(failed), null);
  check("Re-analyze -> 'Try again in 9s' during cooldown; notice shows the countdown", sg({ cooldownSeconds: 9, hasFailed: true }).includes("Try again in 9s") && sg({ cooldownSeconds: 9, hasFailed: true }).includes("The AI service is busy. You can try again in 9s."), null);
  check("Re-analyze normal after cooldown; notice points to Re-analyze", sg({ hasFailed: true }).includes(">Re-analyze<") && sg({ hasFailed: true }).includes("Use Re-analyze above"), null);
  check("Regenerate -> 'Try again in 3s' during cooldown; notice shows the countdown", lr({ cooldownSeconds: 3, hasFailed: true }).includes("Try again in 3s") && lr({ cooldownSeconds: 3, hasFailed: true }).includes("try again in 3s."), null);
  check("Regenerate normal after cooldown", lr({ hasFailed: true }).includes(">Regenerate<"), null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
