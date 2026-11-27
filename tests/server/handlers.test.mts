// Offline behaviour check for Phase 0 Step A. Never calls Gemini:
// GEMINI_API_KEY is removed, so valid requests stop at the "not configured" error.
delete process.env.GEMINI_API_KEY;

const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const { handleCareers, handleSkillGap, handleRoadmap } = await import(`${root}/src/server/handlers.ts`);
const { sanitizeSkillGap } = await import(`${root}/src/server/validation.ts`);
const { buildRoadmapPrompt } = await import(`${root}/src/server/prompts.ts`);
const careersFn = (await import(`${root}/api/careers.ts`)).default;
const roadmapFn = (await import(`${root}/api/roadmap.ts`)).default;

const profile = {
  name: "Test Student", educationLevel: "Undergraduate (Bachelor's)", fieldOfStudy: "Computer Science",
  skills: ["Python", "  ", "SQL"], interests: ["AI"], careerGoals: "Build useful data products.",
};
const career = { id: "da", title: "Data Analyst", tagline: "Turn data into decisions", coreSkills: ["SQL", "Python"] };
// Step B replaced the raw "GEMINI_API_KEY is not configured" text with this safe
// user-facing message; reaching it still proves validation passed and the
// request got to the Gemini step (status 500 when no key is configured).
const NOT_CONFIGURED = "The AI service is temporarily unavailable";

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail: unknown) {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
}
async function expect(label: string, p: Promise<any>, status: number, msgIncludes: string) {
  const r = await p;
  check(label, r.status === status && String(r.body.error ?? "").includes(msgIncludes), r);
}

// careers
await expect("careers: valid profile reaches Gemini step", handleCareers(profile), 500, NOT_CONFIGURED);
await expect("careers: empty body", handleCareers({}), 400, "Please enter your name.");
await expect("careers: null body", handleCareers(null), 400, "Please enter your name.");
await expect("careers: name is a number (was TypeError)", handleCareers({ ...profile, name: 42 }), 400, "Please enter your name.");
await expect("careers: skills is a string", handleCareers({ ...profile, skills: "Python" }), 400, "at least one current skill");
await expect("careers: only blank skills", handleCareers({ ...profile, skills: ["  ", ""] }), 400, "at least one current skill");
await expect("careers: name 101 chars", handleCareers({ ...profile, name: "a".repeat(101) }), 400, "100 characters");
await expect("careers: name 100 chars ok", handleCareers({ ...profile, name: "a".repeat(100) }), 500, NOT_CONFIGURED);
await expect("careers: 31 skills", handleCareers({ ...profile, skills: Array.from({ length: 31 }, (_, i) => `s${i}`) }), 400, "no more than 30 skills");
await expect("careers: skill 81 chars", handleCareers({ ...profile, skills: ["a".repeat(81)] }), 400, "80 characters");
await expect("careers: goals 2001 chars", handleCareers({ ...profile, careerGoals: "a".repeat(2001) }), 400, "2000 characters");
await expect("careers: field 151 chars", handleCareers({ ...profile, fieldOfStudy: "a".repeat(151) }), 400, "150 characters");

// skill gap
await expect("skill-gap: valid reaches Gemini step", handleSkillGap({ profile, career }), 500, NOT_CONFIGURED);
await expect("skill-gap: no career", handleSkillGap({ profile }), 400, "selected career are required");
await expect("skill-gap: no profile", handleSkillGap({ career }), 400, "selected career are required");
await expect("skill-gap: career w/o coreSkills (was TypeError)", handleSkillGap({ profile, career: { title: "X" } }), 500, NOT_CONFIGURED);
await expect("skill-gap: profile.skills not array (was TypeError)", handleSkillGap({ profile: { ...profile, skills: 5 }, career }), 400, "at least one current skill");

// roadmap
await expect("roadmap: valid, no skillGap", handleRoadmap({ profile, career, skillGap: null }), 500, NOT_CONFIGURED);
await expect("roadmap: malformed skillGap (was TypeError)", handleRoadmap({ profile, career, skillGap: { readinessScore: 5 } }), 500, NOT_CONFIGURED);
await expect("roadmap: skillGap is a string", handleRoadmap({ profile, career, skillGap: "x" }), 500, NOT_CONFIGURED);

// sanitizer + prompt fallback
const gap = sanitizeSkillGap({ readinessScore: 250, skillsYouHave: [], missingSkills: [{ skill: "Stats", importance: "Bogus" }], priorities: [{ skill: "Stats" }] });
check("sanitizeSkillGap clamps score to 100", gap?.readinessScore === 100, gap);
check("sanitizeSkillGap defaults bad importance", gap?.missingSkills[0].importance === "Important", gap);
check("sanitizeSkillGap defaults missing rank", gap?.priorities[0].rank === 1, gap);
const prompt = buildRoadmapPrompt({ ...profile, skills: ["Python"] }, { ...career, coreSkills: ["SQL"] } as any, gap);
check("roadmap prompt keeps 'Foundational academic background' fallback", prompt.includes("Existing Strengths: Foundational academic background"), prompt);

// Vercel wrappers with mock req/res
function mockRes() {
  const out: any = { status: 0, body: null };
  return { out, res: { status(c: number) { out.status = c; return { json(b: unknown) { out.body = b; } }; } } };
}
let m = mockRes(); await careersFn({ method: "GET" }, m.res);
check("api/careers: GET -> 405", m.out.status === 405, m.out);
m = mockRes();
await careersFn({ method: "POST", get body() { throw new Error("Invalid JSON"); } }, m.res);
check("api/careers: malformed JSON -> 400", m.out.status === 400 && m.out.body.error === "Invalid JSON request body.", m.out);
m = mockRes(); await careersFn({ method: "POST", body: undefined }, m.res);
check("api/careers: missing body -> 400", m.out.status === 400, m.out);
m = mockRes(); await roadmapFn({ method: "POST", body: { profile, career } }, m.res);
check("api/roadmap: valid -> reaches Gemini step", m.out.status === 500 && m.out.body.error.includes(NOT_CONFIGURED), m.out);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
