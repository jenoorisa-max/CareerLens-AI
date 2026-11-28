// Runs the real server.ts with Gemini mocked (no network, no quota).
// Careers -> valid result; Skill Gap -> always 503; Roadmap -> valid result.
process.env.GEMINI_API_KEY = "AIzaSyMOCK_KEY_FOR_LOCAL_BROWSER_TEST_000";
process.env.PORT = process.env.PORT || "3123";
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)

const career = (n: number) => ({ id: `c${n}`, title: `Mock Career ${n}`, matchScore: 90 - n, tagline: "Mock tagline", explanation: "Mock explanation.",
  whyItFitsProfile: "Mock fit.", dayToDay: ["Task one", "Task two"], coreSkills: ["SQL", "Python"], growthOutlook: "Growing." });
const CAREERS = { profileSummary: "Mock profile summary.", careers: [career(1), career(2), career(3)] };
const stage = (n: number) => ({ stageNumber: n, title: `Stage ${n}`, duration: "2 weeks", goal: "Goal", topics: ["Topic"], tools: ["Tool"],
  resources: [{ title: "Resource", type: "Course", description: "Desc" }], project: { title: "Project", description: "Desc", deliverables: ["One"] } });
const ROADMAP = { careerTitle: "Mock Career 1", totalDuration: "8 weeks", overview: "Overview", stages: [1, 2, 3, 4].map(stage), careerLaunchTip: "Tip" };

const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (url: any, init?: any) => {
  if (!String(url).includes("generativelanguage.googleapis.com")) return realFetch(url, init);
  const body = String(init?.body ?? "");
  // Optional test knobs (unset = previous behaviour):
  // MOCK_DELAY_MS delays every response (to observe loading states);
  // MOCK_CAREERS_STATUS makes the career search fail with that HTTP status.
  const delay = Number(process.env.MOCK_DELAY_MS || 0);
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  const isCareers = !body.includes("Skill Gap Analysis") && !body.includes("Learning Roadmap");
  if (isCareers && process.env.MOCK_CAREERS_STATUS) {
    const status = Number(process.env.MOCK_CAREERS_STATUS);
    console.log(`[mock] careers -> ${status}`);
    return json({ error: { code: status, message: "Mock failure", status: "INVALID_ARGUMENT" } }, status);
  }
  if (body.includes("Skill Gap Analysis") && process.env.MOCK_SKILLGAP !== "ok") {
    console.log("[mock] skill-gap -> 503");
    return json({ error: { code: 503, message: "The model is overloaded", status: "UNAVAILABLE" } }, 503);
  }
  const GAP = { careerTitle: "Mock Career 1", readinessScore: 60, readinessSummary: "Mock readiness.", skillsYouHave: [{ skill: "SQL", howItTransfers: "h" }],
    missingSkills: [{ skill: "Statistics", importance: "Essential", whyItMatters: "w" }], priorities: [{ rank: 1, skill: "Statistics", timeframe: "2 weeks", reason: "r", actionTip: "a" }] };
  const data = body.includes("Skill Gap Analysis") ? GAP : body.includes("Learning Roadmap") ? ROADMAP : CAREERS;
  console.log(`[mock] ${data === GAP ? "skill-gap" : data === ROADMAP ? "roadmap" : "careers"} -> 200`);
  return json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(data) }] }, finishReason: "STOP" }] });
}) as typeof fetch;

await import(`${root}/server.ts`);
