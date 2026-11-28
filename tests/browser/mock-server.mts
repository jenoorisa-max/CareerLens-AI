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

function mockCvAnalysis(withJobMatch: boolean) {
  const sc = (score: number, explanation: string) => ({ score, explanation });
  return {
    cvReadable: true, readabilityNote: "", candidateStage: "Student", overallScore: 72,
    overallSummary: "A solid student CV with relevant projects; descriptions could show more impact.",
    categoryScores: { contentQuality: sc(68, "Projects are relevant but outcomes are vague."), completeness: sc(74, "Core sections are present."),
      careerRelevance: sc(80, "Skills fit software roles."), professionalPresentation: sc(70, "Mostly consistent formatting.") },
    strengths: ["Relevant Flutter project", "Clear education section"], weaknesses: ["Vague society role", "No summary"],
    missingSections: [{ section: "Professional summary", importance: "Recommended", suggestion: "Add a two-line summary of your goals." }],
    languageIssues: [{ type: "Style", excerpt: "Helped with various tasks", issue: "Vague wording", suggestion: "Name the tasks you did." }],
    weakDescriptions: [{ excerpt: "Helped with various tasks in the computing society.", problem: "Generic", suggestion: "Describe a specific contribution." }],
    formattingIssues: [{ issue: "Dates are missing for projects", suggestion: "Add month and year to each project." }],
    ats: { estimatedScore: 66, summary: "Mostly parseable; simple layout.", parsingRisks: ["Contact details on one line with separators"] },
    keywords: { present: ["Flutter", "Python"], missing: ["Git", "REST APIs"] },
    improvements: [{ priority: "Low", action: "Add a summary", reason: "Helps recruiters scan." }, { priority: "High", action: "Quantify your attendance app", reason: "Shows impact." }],
    ...(withJobMatch ? { jobMatch: { matchScore: 74, summary: "Good fit for a junior mobile role.", matchedRequirements: ["Flutter"], gaps: ["Git"] } } : {}),
  };
}

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
  // CV Analyzer: markers in the job description pick a scenario
  // (MOCK_UNREADABLE -> unreadable verdict, MOCK_OVERLOAD -> 503).
  if (body.includes("Analyse this CV")) {
    if (body.includes("MOCK_OVERLOAD")) {
      console.log("[mock] cv-analyze -> 503");
      return json({ error: { code: 503, message: "The model is overloaded", status: "UNAVAILABLE" } }, 503);
    }
    const cv = body.includes("MOCK_UNREADABLE") ? { cvReadable: false, readabilityNote: "Page 2 is too blurry to read." } : mockCvAnalysis(body.includes("JOB_DESCRIPTION"));
    console.log(`[mock] cv-analyze -> 200${body.includes("MOCK_UNREADABLE") ? " (unreadable)" : ""}`);
    return json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(cv) }] }, finishReason: "STOP" }] });
  }
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
