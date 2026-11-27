// Offline test suite for Phase 0 Step B. The global fetch used by the Gemini
// SDK is replaced by a mock, so no request ever leaves this machine.
const FAKE_KEY = "AIzaSyFAKE_TEST_KEY_0123456789abcdefgh";
process.env.GEMINI_API_KEY = FAKE_KEY;
delete process.env.GEMINI_MODEL;

const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const runSlow = !process.argv.includes("--fast");
const { handleCareers, handleSkillGap, handleRoadmap } = await import(`${root}/src/server/handlers.ts`);
const { formatGeminiError } = await import(`${root}/src/server/gemini.ts`);
// Same module instance gemini.ts resolves to (exports map: node + import condition).
const { ApiError } = await import(`${root}/node_modules/@google/genai/dist/node/index.mjs`);

// ---------------------------------------------------------------- fixtures
const career = (n: number) => ({
  id: `c${n}`, title: `Career ${n}`, matchScore: 90 - n, tagline: "t", explanation: "e",
  whyItFitsProfile: "w", dayToDay: ["a", "b"], coreSkills: ["SQL", "Python"], growthOutlook: "g",
});
const CAREERS_OK = { profileSummary: "summary", careers: [career(1), career(2), career(3), career(4)] };
const SKILLGAP_OK = {
  careerTitle: "Data Analyst", readinessScore: 55, readinessSummary: "r",
  skillsYouHave: [{ skill: "SQL", howItTransfers: "h" }],
  missingSkills: [{ skill: "Stats", importance: "Essential", whyItMatters: "w" }],
  priorities: [{ rank: 1, skill: "Stats", timeframe: "2 weeks", reason: "r", actionTip: "a" }],
};
const stage = (n: number) => ({
  stageNumber: n, title: `S${n}`, duration: "2w", goal: "g", topics: ["t"], tools: ["x"],
  resources: [{ title: "R", type: "Course", description: "d" }],
  project: { title: "P", description: "d", deliverables: ["one"] },
});
const ROADMAP_OK = {
  careerTitle: "Data Analyst", totalDuration: "8 weeks", overview: "o",
  stages: [stage(1), stage(2), stage(3), stage(4)], careerLaunchTip: "tip",
};

// ------------------------------------------------------------- fetch mock
type Behaviour =
  | { ok: unknown } | { raw: string } | { status: number; message: string; delayMs?: number }
  | { network: string } | { hang: true } | { empty: string } | { blocked: string };
const scenarios = new Map<string, { plan: Behaviour[]; calls: { start: number; end?: number }[] }>();

function geminiBody(text: string | undefined, finishReason = "STOP") {
  const parts = text === undefined ? [] : [{ text }];
  return { candidates: [{ content: { role: "model", parts }, finishReason }] };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const abortError = () => new DOMException("This operation was aborted", "AbortError");

globalThis.fetch = (async (_url: unknown, init: { body?: string; signal?: AbortSignal } = {}) => {
  const id = /Student-([A-Za-z0-9]+)/.exec(String(init.body))?.[1];
  const sc = id ? scenarios.get(id) : undefined;
  if (!sc) throw new Error(`mock: unknown scenario in request (${id})`);
  const call = { start: Date.now() } as { start: number; end?: number };
  sc.calls.push(call);
  const b = sc.plan[Math.min(sc.calls.length - 1, sc.plan.length - 1)];
  const signal = init.signal;

  const waitOrAbort = (ms: number) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = ms === Infinity ? undefined : setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); call.end = Date.now(); reject(abortError()); }, { once: true });
  });

  try {
    if ("hang" in b) { await waitOrAbort(Infinity); }
    if ("network" in b) throw new TypeError("fetch failed", { cause: Object.assign(new Error(`read ${b.network}`), { code: b.network }) });
    if ("status" in b) {
      if (b.delayMs) await waitOrAbort(b.delayMs);
      return json({ error: { code: b.status, message: b.message, status: "MOCK" } }, b.status);
    }
    if ("ok" in b) return json(geminiBody(JSON.stringify(b.ok)));
    if ("raw" in b) return json(geminiBody(b.raw));
    if ("empty" in b) return json(geminiBody(undefined, b.empty));
    if ("blocked" in b) return json({ promptFeedback: { blockReason: b.blocked } });
    throw new Error("mock: bad behaviour");
  } finally { call.end ??= Date.now(); }
}) as typeof fetch;

// ------------------------------------------------------------ log capture
const logs: string[] = [];
const origError = console.error;
console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };

// ------------------------------------------------------------- helpers
const SAFE_MESSAGES = new Set([
  "The AI service is temporarily unavailable. Please try again later.",
  "The AI service is busy right now. Please try again in a moment.",
  "Gemini API rate limit or quota reached. Please wait a moment and try again.",
  "The AI took too long to respond. Please try again.",
  "Could not reach the AI service. Please try again in a moment.",
  "The AI could not generate a response this time. Please try again.",
  "The AI could not generate a response for these details. Please review your input and try again.",
  "Unable to parse structured AI output. Please try again.",
  "Something went wrong while generating your results. Please try again.",
  "Unable to generate career recommendations. Please try again.", // pre-existing handler message
]);
const BANNED = ["MOCK", "overloaded", "fetch failed", "aborted", "ECONNRESET", "{", "AIza", "Student-", "INTERNAL_SECRET", "Unexpected token"];
const userMessages: string[] = [];

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  ok ? pass++ : fail++;
  origError(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
}

const profileFor = (id: string) => ({
  name: `Student-${id}`, educationLevel: "Undergraduate", fieldOfStudy: "CS",
  skills: ["Python"], interests: ["AI"], careerGoals: "PRIVATE-GOAL-TEXT",
});
const CAREER_IN = { id: "da", title: "Data Analyst", tagline: "t", coreSkills: ["SQL"] };

async function run(endpoint: "careers" | "skillGap" | "roadmap", id: string, plan: Behaviour[]) {
  scenarios.set(id, { plan, calls: [] });
  const profile = profileFor(id);
  const t0 = Date.now();
  const r = endpoint === "careers" ? await handleCareers(profile)
    : endpoint === "skillGap" ? await handleSkillGap({ profile, career: CAREER_IN })
    : await handleRoadmap({ profile, career: CAREER_IN, skillGap: null });
  const elapsed = Date.now() - t0;
  if (r.body.error !== undefined) userMessages.push(r.body.error);
  return { ...r, elapsed, calls: scenarios.get(id)!.calls };
}

async function expectError(label: string, endpoint: Parameters<typeof run>[0], id: string, plan: Behaviour[],
                           status: number, message: string, calls: number) {
  const r = await run(endpoint, id, plan);
  check(`${label}: status ${status}, ${calls} call(s)`, r.status === status && r.body.error === message && r.calls.length === calls && r.body.data === undefined,
    { status: r.status, error: r.body.error, calls: r.calls.length });
  return r;
}
const deepEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const M = {
  busy: "The AI service is busy right now. Please try again in a moment.",
  quota: "Gemini API rate limit or quota reached. Please wait a moment and try again.",
  generic: "Something went wrong while generating your results. Please try again.",
  unavailable: "The AI service is temporarily unavailable. Please try again later.",
  network: "Could not reach the AI service. Please try again in a moment.",
  empty: "The AI could not generate a response this time. Please try again.",
  blocked: "The AI could not generate a response for these details. Please review your input and try again.",
  unreadable: "Unable to parse structured AI output. Please try again.",
  timeout: "The AI took too long to respond. Please try again.",
};

// ================================================================ FAST TESTS
origError("--- success paths (response format unchanged)");
{
  const r = await run("careers", "okCareers", [{ ok: CAREERS_OK }]);
  check("careers 200, {data} with careers sliced to 3, 1 call", r.status === 200 && r.body.error === undefined &&
    deepEq(r.body.data, { ...CAREERS_OK, careers: CAREERS_OK.careers.slice(0, 3) }) && r.calls.length === 1, r);
  const s = await run("skillGap", "okGap", [{ ok: SKILLGAP_OK }]);
  check("skill-gap 200, data returned unmodified", s.status === 200 && deepEq(s.body.data, SKILLGAP_OK) && s.calls.length === 1, s);
  const m = await run("roadmap", "okRoad", [{ ok: ROADMAP_OK }]);
  check("roadmap 200, data returned unmodified", m.status === 200 && deepEq(m.body.data, ROADMAP_OK) && m.calls.length === 1, m);
  const f = await run("careers", "fenced", [{ raw: "```json\n" + JSON.stringify(CAREERS_OK) + "\n```" }]);
  check("code-fenced JSON still parsed (200)", f.status === 200, f.status);
  await expectError("careers empty list keeps existing 502 message, no retry", "careers", "emptyList",
    [{ ok: { profileSummary: "s", careers: [] } }], 502, "Unable to generate career recommendations. Please try again.", 1);
}

origError("--- HTTP errors (classified by numeric status)");
{
  // B2: overload backoff. Math.random is stubbed to hit the jitter bounds exactly.
  const realRandom = Math.random;
  Math.random = () => 0;
  const rMin = await expectError("503 x3 -> retried, busy (jitter at minimum)", "careers", "e503", [{ status: 503, message: "The model is overloaded" }], 503, M.busy, 3);
  Math.random = () => 0.999999;
  const rMax = await expectError("503 x3 -> retried, busy (jitter at maximum)", "careers", "e503max", [{ status: 503, message: "The model is overloaded" }], 503, M.busy, 3);
  Math.random = realRandom;
  const g = (r: { calls: { start: number; end?: number }[] }) => [r.calls[1].start - r.calls[0].end!, r.calls[2].start - r.calls[1].end!];
  const gMin = g(rMin), gMax = g(rMax);
  check(`503 delays at min jitter = 2000ms, 5000ms (measured ${gMin.join("ms, ")}ms)`, gMin[0] >= 1995 && gMin[0] < 2080 && gMin[1] >= 4995 && gMin[1] < 5080, gMin);
  check(`503 delays at max jitter = 2999ms, 6999ms (measured ${gMax.join("ms, ")}ms)`, gMax[0] >= 2990 && gMax[0] < 3080 && gMax[1] >= 6990 && gMax[1] < 7080, gMax);

  const sampled = await Promise.all([1, 2, 3, 4].map((n) => run("careers", `e503rnd${n}`, [{ status: 503, message: "overloaded" }])));
  const sGaps = sampled.map(g);
  check(`503 delays with real jitter within [2000,3000) and [5000,7000) for 4 runs (${sGaps.map((x) => x.join("/")).join(", ")}ms)`,
    sampled.every((r) => r.calls.length === 3 && r.status === 503) && sGaps.every(([a, b]) => a >= 1995 && a < 3080 && b >= 4995 && b < 7080) &&
    new Set(sGaps.map(([a]) => Math.round(a / 10))).size > 1, sGaps);

  const net = await run("careers", "netgaps", [{ network: "ECONNRESET" }]);
  const nGaps = g(net);
  check(`non-overload retries keep 500ms / 1000ms delays (network: ${nGaps.join("ms, ")}ms)`, nGaps[0] >= 495 && nGaps[0] < 580 && nGaps[1] >= 995 && nGaps[1] < 1080, nGaps);
  const bad = await run("careers", "jsongaps", [{ raw: "{nope" }]);
  const jGaps = g(bad);
  check(`non-overload retries keep 500ms / 1000ms delays (malformed JSON: ${jGaps.join("ms, ")}ms)`, jGaps[0] >= 495 && jGaps[0] < 580 && jGaps[1] >= 995 && jGaps[1] < 1080, jGaps);
  const rec = await run("careers", "e503ok", [{ status: 503, message: "overloaded" }, { ok: CAREERS_OK }]);
  check("503 then success -> 200 after 2 calls", rec.status === 200 && rec.calls.length === 2, { s: rec.status, c: rec.calls.length });
  await expectError("500 x3 -> retried", "careers", "e500", [{ status: 500, message: "INTERNAL_SECRET stack" }], 503, M.busy, 3);
  await expectError("502 x3 -> retried", "careers", "e502", [{ status: 502, message: "bad gateway" }], 503, M.busy, 3);
  await expectError("504 x3 -> retried", "careers", "e504", [{ status: 504, message: "deadline exceeded" }], 503, M.busy, 3);
  await expectError("429 -> NOT retried, quota", "careers", "e429", [{ status: 429, message: "RESOURCE_EXHAUSTED quota" }], 429, M.quota, 1);
  await expectError("400 -> NOT retried, generic", "careers", "e400", [{ status: 400, message: "INVALID_ARGUMENT field x" }], 502, M.generic, 1);
  await expectError("400 API_KEY_INVALID -> NOT retried, 401 unavailable", "careers", "e400key", [{ status: 400, message: "API key not valid. Please pass a valid API key. API_KEY_INVALID" }], 401, M.unavailable, 1);
  await expectError("401 -> NOT retried", "careers", "e401", [{ status: 401, message: "unauthenticated" }], 401, M.unavailable, 1);
  await expectError("403 -> NOT retried", "careers", "e403", [{ status: 403, message: "PERMISSION_DENIED" }], 401, M.unavailable, 1);
  await expectError("404 -> NOT retried, 502 unavailable", "careers", "e404", [{ status: 404, message: "model not found" }], 502, M.unavailable, 1);
}

origError("--- network, empty, blocked, malformed JSON");
{
  await expectError("network error (ECONNRESET) x3 -> retried", "careers", "net", [{ network: "ECONNRESET" }], 503, M.network, 3);
  const netOk = await run("careers", "netok", [{ network: "ENOTFOUND" }, { ok: CAREERS_OK }]);
  check("network error then success -> 200", netOk.status === 200 && netOk.calls.length === 2, netOk.status);

  const before = logs.length;
  await expectError("empty response x3 -> retried", "careers", "empty", [{ empty: "OTHER" }], 502, M.empty, 3);
  check("empty response log includes finishReason", logs.slice(before).every((l) => l.includes("finishReason=OTHER")), logs.slice(before));

  const b2 = logs.length;
  await expectError("prompt blocked (blockReason) -> NOT retried", "careers", "blocked", [{ blocked: "SAFETY" }], 502, M.blocked, 1);
  check("blocked log includes blockReason", logs.slice(b2).some((l) => l.includes("blockReason=SAFETY")), logs.slice(b2));

  const b3 = logs.length;
  await expectError("malformed JSON x3 -> retried", "careers", "badjson", [{ raw: '{"profileSummary": "Student-badjson PRIVATE-GOAL-TEXT", "careers": [' }], 502, M.unreadable, 3);
  check("malformed-JSON log does not quote model output", logs.slice(b3).every((l) => !l.includes("PRIVATE-GOAL-TEXT") && !l.includes("profileSummary")), logs.slice(b3));
  const jsonOk = await run("careers", "badjsonok", [{ raw: "{not json" }, { ok: CAREERS_OK }]);
  check("malformed JSON then valid -> 200 after 2 calls", jsonOk.status === 200 && jsonOk.calls.length === 2, jsonOk.status);
}

origError("--- B+ response-shape validation (one retry only)");
{
  const badCareers = { ...CAREERS_OK, careers: [{ ...career(1), dayToDay: "not an array" }] };
  const b = logs.length;
  await expectError("careers: dayToDay not array -> 1 retry then 502", "careers", "shapeC", [{ ok: badCareers }], 502, M.unreadable, 2);
  check("shape log names the field path only", logs.slice(b).some((l) => l.includes("data.careers[0].dayToDay")) && logs.slice(b).every((l) => !l.includes("not an array")), logs.slice(b));
  await expectError("careers: missing careers -> 502", "careers", "shapeC2", [{ ok: { profileSummary: "s" } }], 502, M.unreadable, 2);
  const extra = await run("careers", "shapeC4th", [{ ok: { ...CAREERS_OK, careers: [career(1), career(2), career(3), { title: 42, dayToDay: "bad" }] } }]);
  check("careers: malformed 4th career ignored -> 200, 1 call, 3 careers returned", extra.status === 200 && extra.calls.length === 1 &&
    deepEq(extra.body.data, { ...CAREERS_OK, careers: [career(1), career(2), career(3)] }), { s: extra.status, c: extra.calls.length });
  await expectError("careers: malformed 3rd career still rejected", "careers", "shapeC3rd",
    [{ ok: { ...CAREERS_OK, careers: [career(1), career(2), { ...career(3), coreSkills: "x" }] } }], 502, M.unreadable, 2);
  await expectError("careers: careers not an array still rejected", "careers", "shapeCobj", [{ ok: { profileSummary: "s", careers: { a: 1 } } }], 502, M.unreadable, 2);
  await expectError("careers: response is an array", "careers", "shapeC3", [{ ok: [1, 2] }], 502, M.unreadable, 2);
  const { priorities, ...noPriorities } = SKILLGAP_OK;
  await expectError("skill-gap: priorities missing", "skillGap", "shapeG", [{ ok: noPriorities }], 502, M.unreadable, 2);
  await expectError("skill-gap: readinessScore is a string", "skillGap", "shapeG2", [{ ok: { ...SKILLGAP_OK, readinessScore: "55" } }], 502, M.unreadable, 2);
  await expectError("skill-gap: skill item is an object", "skillGap", "shapeG3", [{ ok: { ...SKILLGAP_OK, missingSkills: [{ skill: { x: 1 }, importance: "Essential", whyItMatters: "w" }] } }], 502, M.unreadable, 2);
  const badStage = { ...stage(2), project: { title: "P", description: "d", deliverables: "x" } };
  await expectError("roadmap: project.deliverables not array", "roadmap", "shapeR", [{ ok: { ...ROADMAP_OK, stages: [stage(1), badStage] } }], 502, M.unreadable, 2);
  await expectError("roadmap: stages missing", "roadmap", "shapeR2", [{ ok: { ...ROADMAP_OK, stages: undefined } }], 502, M.unreadable, 2);
  await expectError("roadmap: resources not array", "roadmap", "shapeR3", [{ ok: { ...ROADMAP_OK, stages: [{ ...stage(1), resources: null }] } }], 502, M.unreadable, 2);
  const fixed = await run("roadmap", "shapeRok", [{ ok: { ...ROADMAP_OK, stages: "bad" } }, { ok: ROADMAP_OK }]);
  check("invalid shape then valid -> 200 after 2 calls", fixed.status === 200 && fixed.calls.length === 2 && deepEq(fixed.body.data, ROADMAP_OK), fixed.status);
  const mix = await run("careers", "mixed", [{ raw: "{bad" }, { ok: { profileSummary: "s" } }, { ok: CAREERS_OK }]);
  check("malformed -> invalid shape -> valid: 3 calls, 200", mix.status === 200 && mix.calls.length === 3, { s: mix.status, c: mix.calls.length });
}

origError("--- logging hygiene");
{
  const b = logs.length;
  await run("careers", "echoKey", [{ status: 500, message: `upstream echoed key ${FAKE_KEY} ` + "x".repeat(1000) }]);
  const lines = logs.slice(b);
  check("API key in upstream error is redacted in logs", lines.length === 3 && lines.every((l) => !l.includes(FAKE_KEY) && l.includes("[REDACTED]")), lines);
  const details = lines.map((l) => JSON.parse(l.replace("[gemini] request failed ", "")).detail as string);
  check(`log detail capped at 300 chars (max seen ${Math.max(...details.map((d) => d.length))})`, details.every((d) => d.length <= 300), details.map((d) => d.length));
}

origError("--- formatGeminiError never leaks raw errors");
{
  const cases: [string, unknown, number, string][] = [
    ["plain Error with internal text", new Error("INTERNAL_SECRET db password=hunter2"), 500, M.generic],
    ["thrown string", "INTERNAL_SECRET", 500, M.generic],
    ["ApiError 503", new ApiError({ message: '{"error":{"message":"overloaded"}}', status: 503 }), 503, M.busy],
    ["ApiError 429", new ApiError({ message: "quota", status: 429 }), 429, M.quota],
    ["TypeError fetch failed", new TypeError("fetch failed"), 503, M.network],
    ["AbortError (not our timeout)", new DOMException("This operation was aborted", "AbortError"), 500, M.generic],
    ["SyntaxError", new SyntaxError("Unexpected token x in JSON"), 500, M.generic],
    ["null", null, 500, M.generic],
  ];
  for (const [label, err, status, message] of cases) {
    const r = formatGeminiError(err);
    userMessages.push(r.message);
    check(`formatGeminiError(${label}) -> ${status} safe message`, r.status === status && r.message === message, r);
  }
}

// ================================================================ SLOW TESTS
if (runSlow) {
  origError("--- timeouts and the 75s budget (real time, run in parallel, ~75s; jitter pinned to MAX = worst case)");
  const realRandom = Math.random;
  Math.random = () => 0.999999;
  const [allHang, hangThenOk, slow503, budgetSkip] = await Promise.all([
    run("careers", "hang", [{ hang: true }]),
    run("roadmap", "hangok", [{ hang: true }, { ok: ROADMAP_OK }]),
    run("careers", "slow503", [{ status: 503, message: "overloaded", delayMs: 29_000 }]),
    run("careers", "budgetSkip", [{ status: 503, message: "overloaded", delayMs: 29_950 }]),
  ]);
  Math.random = realRandom;

  const durations = allHang.calls.map((c: { start: number; end?: number }) => c.end! - c.start);
  check(`always hangs -> 504 timeout after 3 attempts`, allHang.status === 504 && allHang.body.error === M.timeout && allHang.calls.length === 3, { s: allHang.status, c: allHang.calls.length });
  check(`attempt timeouts ~30s, ~30s, then reduced ~13.25s (measured ${durations.join(", ")}ms)`,
    Math.abs(durations[0] - 30_000) < 300 && Math.abs(durations[1] - 30_000) < 300 && Math.abs(durations[2] - 13_250) < 400, durations);
  check(`total time strictly under 75,000ms budget (measured ${allHang.elapsed}ms)`, allHang.elapsed < 75_000, allHang.elapsed);

  check(`timeout then success -> 200 after 2 calls (measured ${hangThenOk.elapsed}ms)`,
    hangThenOk.status === 200 && hangThenOk.calls.length === 2 && deepEq(hangThenOk.body.data, ROADMAP_OK) && hangThenOk.elapsed < 31_500, { s: hangThenOk.status, e: hangThenOk.elapsed });

  // slow503 (max jitter): 29s + 3s + 29s (=61s) + 7s -> attempt 3 starts ~68s with only ~6.75s left.
  const slowDur = slow503.calls.map((c: { start: number; end?: number }) => c.end! - c.start);
  const slowGaps = [slow503.calls[1].start - slow503.calls[0].end!, slow503.calls[2].start - slow503.calls[1].end!];
  check(`slow 503s: overload delays incl. max jitter applied (${slowGaps.join("ms, ")}ms)`, slowGaps[0] >= 2990 && slowGaps[0] < 3080 && slowGaps[1] >= 6990 && slowGaps[1] < 7080, slowGaps);
  check(`slow 503s: 3rd attempt cut to remaining budget ~6.75s (${slowDur.join(", ")}ms)`,
    slow503.calls.length === 3 && Math.abs(slowDur[2] - 6_750) < 300, slowDur);
  check(`slow 503s: total strictly under 75,000ms (measured ${slow503.elapsed}ms), final 504`, slow503.elapsed < 75_000 && slow503.status === 504, { e: slow503.elapsed, s: slow503.status });

  // budgetSkip (max jitter): 29.95s + 3s + 29.95s (=62.9s); next delay 7s + 5s min attempt + 0.25s margin
  // would end at ~75.15s > 75s, so attempt 3 must NOT start.
  check(`budget check includes jitter: 3rd attempt skipped, 2 calls, 503 busy (measured ${budgetSkip.elapsed}ms)`,
    budgetSkip.calls.length === 2 && budgetSkip.status === 503 && budgetSkip.body.error === M.busy && budgetSkip.elapsed < 64_000,
    { c: budgetSkip.calls.length, s: budgetSkip.status, e: budgetSkip.elapsed });
  check("budget skip logged as retrying:false on attempt 2/3", logs.some((l) => l.includes('"attempt":"2/3"') && l.includes('"retrying":false') && l.includes('"status":503')), null);
} else {
  origError("--- SLOW TIMEOUT TESTS SKIPPED (--fast)");
}

origError("--- missing API key (config)");
{
  delete process.env.GEMINI_API_KEY;
  const b = logs.length;
  await expectError("no GEMINI_API_KEY -> 500 unavailable, no request sent", "careers", "nokey", [{ ok: CAREERS_OK }], 500, M.unavailable, 0);
  check("config failure logged as type config / attempt setup", logs.slice(b).some((l) => l.includes('"type":"config"') && l.includes('"attempt":"setup"')), logs.slice(b));
  process.env.GEMINI_API_KEY = FAKE_KEY;
}

origError("--- global checks over every user-facing message and every log line");
{
  const unsafe = userMessages.filter((m) => !SAFE_MESSAGES.has(m) || BANNED.some((b) => m.includes(b)));
  check(`all ${userMessages.length} user-facing messages are from the safe list, no raw text`, unsafe.length === 0, unsafe);
  const badLogs = logs.filter((l) => {
    if (!l.startsWith("[gemini] request failed {")) return true;
    const e = JSON.parse(l.slice("[gemini] request failed ".length));
    const hasFields = ["type", "status", "attempt", "model", "retrying", "detail"].every((k) => k in e);
    return !hasFields || e.detail.length > 300 || l.includes(FAKE_KEY) || l.includes("Student-") ||
      l.includes("PRIVATE-GOAL-TEXT") || l.includes("Analyze this student") || l.includes("Undergraduate");
  });
  check(`all ${logs.length} log lines well-formed; no key, prompt or student data`, badLogs.length === 0, badLogs.slice(0, 3));
  origError(`\nsample log line: ${logs.find((l) => l.includes('"type":"http"'))}`);
}

origError(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
