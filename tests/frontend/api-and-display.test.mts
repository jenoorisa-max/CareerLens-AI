// Phase 0 Step D1 (F6) checks: postJSON, format helpers, and server-side
// rendering of the real components to catch duplicate-key warnings and
// verify clamped / padded display values. No network, no Gemini.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const { postJSON, CLIENT_TIMEOUT_MS } = await import(`${root}/src/lib/api.ts`);
const { clampPercent, padNumber } = await import(`${root}/src/lib/format.ts`);

let pass = 0, fail = 0;
const origError = console.error;
function check(label: string, ok: boolean, detail?: unknown) {
  ok ? pass++ : fail++;
  origError(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
}

// ------------------------------------------------------------ postJSON
origError("--- postJSON");
type Mock = (url: string, init: RequestInit) => Promise<Response>;
let lastInit: RequestInit | undefined, lastUrl = "";
function useFetch(mock: Mock) {
  globalThis.fetch = (async (url: string, init: RequestInit) => { lastUrl = url; lastInit = init; return mock(url, init); }) as typeof fetch;
}
const res = (body: string, status: number, type = "application/json") => new Response(body, { status, headers: { "content-type": type } });
const FALLBACK = "Failed to generate your learning roadmap.";
const html = "<!DOCTYPE html><html><body>An error occurred with this application. FUNCTION_INVOCATION_TIMEOUT</body></html>";

const cases: [string, Mock, { ok: boolean; status: number; message?: string; data?: unknown }][] = [
  ["200 {data} -> ok with data", async () => res(JSON.stringify({ data: { a: 1 } }), 200), { ok: true, status: 200, data: { a: 1 } }],
  ["200 {} (no data) -> fallback message", async () => res("{}", 200), { ok: false, status: 200, message: FALLBACK }],
  ["200 {data:null} -> fallback message", async () => res('{"data":null}', 200), { ok: false, status: 200, message: FALLBACK }],
  ["200 HTML page -> fallback message", async () => res(html, 200, "text/html"), { ok: false, status: 200, message: FALLBACK }],
  ["400 {error} -> server message kept", async () => res('{"error":"Please enter your name."}', 400), { ok: false, status: 400, message: "Please enter your name." }],
  ["503 {error} -> server message kept", async () => res('{"error":"The AI service is busy right now. Please try again in a moment."}', 503), { ok: false, status: 503, message: "The AI service is busy right now. Please try again in a moment." }],
  ["504 Vercel HTML (non-JSON) -> friendly timeout", async () => res(html, 504, "text/html"), { ok: false, status: 504, message: "The AI took too long to respond. Please try again." }],
  ["502 HTML -> busy", async () => res(html, 502, "text/html"), { ok: false, status: 502, message: "The AI service is busy right now. Please try again in a moment." }],
  ["503 empty body -> busy", async () => res("", 503, "text/plain"), { ok: false, status: 503, message: "The AI service is busy right now. Please try again in a moment." }],
  ["500 HTML -> generic server message", async () => res(html, 500, "text/html"), { ok: false, status: 500, message: "Something went wrong on our side. Please try again." }],
  ["413 text -> too large", async () => res("Request Entity Too Large", 413, "text/plain"), { ok: false, status: 413, message: "Your details are too long to process. Please shorten them and try again." }],
  ["429 non-JSON -> rate limited", async () => res("Too Many Requests", 429, "text/plain"), { ok: false, status: 429, message: "Too many requests right now. Please wait a moment and try again." }],
  ["404 HTML -> fallback", async () => res(html, 404, "text/html"), { ok: false, status: 404, message: FALLBACK }],
  ["JSON array body -> status/fallback", async () => res("[1,2]", 400), { ok: false, status: 400, message: FALLBACK }],
  ["error is a number -> status-based", async () => res('{"error":42}', 503), { ok: false, status: 503, message: "The AI service is busy right now. Please try again in a moment." }],
  ["error is whitespace -> status-based", async () => res('{"error":"   "}', 500), { ok: false, status: 500, message: "Something went wrong on our side. Please try again." }],
  ["network failure (TypeError) -> network message, status 0", async () => { throw new TypeError("Failed to fetch"); }, { ok: false, status: 0, message: "Could not reach CareerLens AI. Please check your connection and try again." }],
  ["body read failure -> network message", async () => ({ ok: true, status: 200, text: async () => { throw new TypeError("network error"); } }) as unknown as Response, { ok: false, status: 0, message: "Could not reach CareerLens AI. Please check your connection and try again." }],
];
for (const [label, mock, exp] of cases) {
  useFetch(mock);
  let threw = false, r: any;
  try { r = await postJSON("/api/roadmap", { x: 1 }, FALLBACK); } catch { threw = true; }
  const ok = !threw && r.ok === exp.ok && r.status === exp.status &&
    (exp.ok ? JSON.stringify(r.data) === JSON.stringify(exp.data) : r.message === exp.message);
  check(`${label}${threw ? " (THREW)" : ""}`, ok, r);
}

useFetch(async () => res('{"data":1}', 200));
await postJSON("/api/careers", { name: "A" }, FALLBACK);
const hdrs = new Headers(lastInit?.headers);
check("request: POST, JSON content-type, JSON body, abort signal attached",
  lastUrl === "/api/careers" && lastInit?.method === "POST" && hdrs.get("content-type") === "application/json" &&
  lastInit?.body === '{"name":"A"}' && lastInit?.signal instanceof AbortSignal, lastInit);

check(`client timeout constant is 95000ms (> 75s server budget)`, CLIENT_TIMEOUT_MS === 95_000, CLIENT_TIMEOUT_MS);
{
  // Shrink only the 95s timer so the timeout path runs in ~50ms.
  const realSetTimeout = globalThis.setTimeout;
  (globalThis as any).setTimeout = (fn: () => void, ms?: number, ...a: unknown[]) => realSetTimeout(fn, ms === CLIENT_TIMEOUT_MS ? 50 : ms, ...a);
  let aborted = false;
  useFetch((_u, init) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); })));
  const r = await postJSON("/api/roadmap", {}, FALLBACK);
  globalThis.setTimeout = realSetTimeout;
  check("hanging request -> aborted at client timeout, friendly timeout message, status 0",
    aborted && !r.ok && r.status === 0 && r.message === "The request took too long. Please try again.", r);
}
{
  // Timer is cleared on success: count live timers via clearTimeout spy.
  const realClear = globalThis.clearTimeout; let cleared = 0;
  (globalThis as any).clearTimeout = (h: any) => { cleared++; return realClear(h); };
  useFetch(async () => res('{"data":1}', 200));
  await postJSON("/api/careers", {}, FALLBACK);
  useFetch(async () => { throw new TypeError("x"); });
  await postJSON("/api/careers", {}, FALLBACK);
  globalThis.clearTimeout = realClear;
  check("timeout timer cleared on success and on failure", cleared === 2, cleared);
}

// ------------------------------------------------------------ format
origError("--- clampPercent / padNumber");
const clampCases: [unknown, number][] = [[150, 100], [100, 100], [-5, 0], [0, 0], [55.6, 56], ["70", 70], [NaN, 0], [undefined, 0], [null, 0], [Infinity, 0], ["abc", 0]];
check(`clampPercent: ${clampCases.map(([i, o]) => `${String(i)}->${o}`).join(", ")}`, clampCases.every(([i, o]) => clampPercent(i) === o), clampCases.map(([i]) => clampPercent(i)));
const padCases: [unknown, string][] = [[1, "01"], [9, "09"], [10, "10"], [12, "12"], [0, "00"], [-3, "00"], [2.7, "02"], ["4", "04"], [NaN, "00"]];
check(`padNumber: ${padCases.map(([i, o]) => `${String(i)}->"${o}"`).join(", ")}`, padCases.every(([i, o]) => padNumber(i) === o), padCases.map(([i]) => padNumber(i)));

// ------------------------------------------------------------ component render
origError("--- real components rendered with react-dom/server (development build)");
const React = (await import(`${root}/node_modules/react/index.js`)).default;
const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
const CareerFinder = (await import(`${root}/src/components/CareerFinder.tsx`)).default;
const SkillGapAnalyzer = (await import(`${root}/src/components/SkillGapAnalyzer.tsx`)).default;
const LearningRoadmap = (await import(`${root}/src/components/LearningRoadmap.tsx`)).default;

const profile = { name: "T", educationLevel: "U", fieldOfStudy: "CS", skills: ["Python"], interests: ["AI"], careerGoals: "g" };
// Deliberately hostile AI output: duplicate ids/titles/items, out-of-range scores, 2-digit numbers.
const dupCareer = { id: "same", title: "Data Analyst", matchScore: 140, tagline: "t", explanation: "e", whyItFitsProfile: "w",
  dayToDay: ["Analyze data", "Analyze data"], coreSkills: ["SQL"], growthOutlook: "g" };
const careers = [dupCareer, { ...dupCareer, matchScore: -20 }, { ...dupCareer, matchScore: 87.4 }];
const analysis = { careerTitle: "Data Analyst", readinessScore: 150, readinessSummary: "s",
  skillsYouHave: [{ skill: "SQL", howItTransfers: "a" }, { skill: "SQL", howItTransfers: "b" }],
  missingSkills: [{ skill: "Stats", importance: "Essential", whyItMatters: "w" }, { skill: "Stats", importance: "Helpful", whyItMatters: "w" }],
  priorities: [{ rank: 10, skill: "Stats", timeframe: "1w", reason: "r", actionTip: "a" }, { rank: 10, skill: "Stats", timeframe: "1w", reason: "r", actionTip: "a" }] };
const stage = (n: number) => ({ stageNumber: n, title: "S", duration: "1w", goal: "g", topics: ["Basics", "Basics"], tools: ["x"],
  resources: [{ title: "Docs", type: "Documentation", description: "d" }, { title: "Docs", type: "Course", description: "d" }],
  project: { title: "P", description: "d", deliverables: ["Report", "Report"] } });
const roadmap = { careerTitle: "Data Analyst", totalDuration: "8w", overview: "o", stages: [stage(10), stage(10)], careerLaunchTip: "tip" };

function renderCapturing(el: unknown): { html: string; warnings: string[] } {
  const warnings: string[] = [];
  const origErr = console.error, origWarn = console.warn;
  console.error = (...a: unknown[]) => warnings.push(a.map(String).join(" "));
  console.warn = (...a: unknown[]) => warnings.push(a.map(String).join(" "));
  try { return { html: renderToStaticMarkup(el), warnings }; } finally { console.error = origErr; console.warn = origWarn; }
}
const noop = () => {};
const cf = renderCapturing(React.createElement(CareerFinder, { initialProfile: profile, careerResults: { profileSummary: "p", careers }, isLoading: false,
  onSubmitProfile: async () => {}, onSelectForSkillGap: noop, onSelectForRoadmap: noop }));
const sg = renderCapturing(React.createElement(SkillGapAnalyzer, { profile, careers, selectedCareer: careers[0], analysis, isLoading: false,
  onSelectCareer: noop, onGoToRoadmap: noop, onGoToFinder: noop }));
const lr = renderCapturing(React.createElement(LearningRoadmap, { profile, careers, selectedCareer: careers[0], roadmap, isLoading: false,
  onSelectCareerForRoadmap: noop, onGoToFinder: noop }));

// NOTE: react-dom/server does NOT validate keys (a negative control against the
// pre-D1 components also produced 0 key warnings), so duplicate-key behaviour
// can only be verified in a real browser. This check only confirms the three
// components render hostile data without throwing or warning.
check("three components render hostile/duplicate AI data without errors or warnings (keys NOT verified here)",
  [...cf.warnings, ...sg.warnings, ...lr.warnings].length === 0, [...cf.warnings, ...sg.warnings, ...lr.warnings].slice(0, 3));

check("CareerFinder: matchScore 140 -> '100% Fit', -20 -> '0% Fit', 87.4 -> '87% Fit'", cf.html.includes("100% Fit") && cf.html.includes("0% Fit") && cf.html.includes("87% Fit") && !cf.html.includes("140%") && !cf.html.includes("-20%"), null);
check("CareerFinder: card numbers '01 · Career Match' .. '03'", cf.html.includes("01 · Career Match") && cf.html.includes("03 · Career Match"), null);
check("SkillGapAnalyzer: readiness 150 -> text '100%' and bar width:100%", sg.html.includes(">100%<") && sg.html.includes("width:100%") && !sg.html.includes("150%"), null);
check("SkillGapAnalyzer: rank 10 renders '10' (not '010')", sg.html.includes(">10<") && !sg.html.includes("010"), null);
check("LearningRoadmap: stage 10 renders '10' (not '010')", lr.html.includes(">10<") && !lr.html.includes("010"), null);
check("all duplicate items still rendered (none dropped)", (cf.html.match(/Analyze data/g) ?? []).length === 6 && (lr.html.match(/Report/g) ?? []).length >= 4, null);

origError(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
