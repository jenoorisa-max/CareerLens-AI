// D4 follow-up tests: (1) validateProfile/PROFILE_LIMITS moved to src/shared/profile.ts
// with identical behaviour; (2) canonical stage numbers in restored progress.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const shared = await import(`${root}/src/shared/profile.ts`);
// Expected outputs of the ORIGINAL validateProfile (see tests/fixtures/profile-inputs.mts).
const { base, inputs } = await import(`${root}/tests/fixtures/profile-inputs.mts`);
const golden = JSON.parse((await import("node:fs")).readFileSync(new URL(`${root}/tests/fixtures/validate-profile-golden.json`), "utf8"));
const serverValidation = await import(`${root}/src/server/validation.ts`);
const S = await import(`${root}/src/lib/session.ts`);
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)}`); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("--- 1. validateProfile moved with identical behaviour");
const diffs = (inputs as unknown[]).map((i, n) => [n, shared.validateProfile(i), golden.results[n]]).filter(([, a, b]) => !eq(a, b));
check(`shared validateProfile === original for all ${inputs.length} inputs (results and error messages)`,
  golden.results.length === inputs.length && diffs.length === 0, diffs.slice(0, 2));
check("PROFILE_LIMITS identical", eq(shared.PROFILE_LIMITS, golden.limits), shared.PROFILE_LIMITS);
check("src/server/validation.ts no longer exports validateProfile / PROFILE_LIMITS",
  !("validateProfile" in serverValidation) && !("PROFILE_LIMITS" in serverValidation), Object.keys(serverValidation));
check("server sanitizers still exported and working",
  serverValidation.sanitizeCareer({ title: " T " })?.title === "T" && serverValidation.sanitizeSkillGap({ skillsYouHave: [], missingSkills: [], priorities: [] }) !== null, null);

const fs = await import("node:fs/promises");
const path = await import("node:path");
const srcDir = new URL(`${root}/src/`);
async function walk(dir: URL): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const u = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
    if (e.isDirectory()) out.push(...(await walk(u))); else if (/\.(ts|tsx)$/.test(e.name)) out.push(u.pathname);
  }
  return out;
}
const browserFiles = (await walk(srcDir)).filter((p) => !p.includes("/src/server/"));
const offenders: string[] = [];
for (const f of browserFiles) if (/from\s+["'][^"']*\/server\//.test(await fs.readFile(new URL("file://" + f), "utf8"))) offenders.push(path.basename(f));
check(`no browser-side file imports from src/server (${browserFiles.length} files checked)`, offenders.length === 0, offenders);
const sharedSrc = await fs.readFile(new URL(`${root}/src/shared/profile.ts`), "utf8");
check("shared/profile.ts has no runtime imports (only `import type`)", !/^import (?!type)/m.test(sharedSrc), null);

console.log("--- 2. canonical stage numbers in restored progress");
const career = (n: number) => ({ id: `c${n}`, title: `Career ${n}`, matchScore: 90, tagline: "t", explanation: "e", whyItFitsProfile: "w", dayToDay: ["d"], coreSkills: ["s"], growthOutlook: "g" });
const NOW = 1_700_000_000_000;
const snap = (completedStages: Record<string, unknown>) => ({ version: 1, savedAt: NOW, profile: base, careerResults: { profileSummary: "s", careers: [career(1), career(2), career(3)] },
  selectedCareerTitle: "Career 1", activeTab: "roadmap", skillGapsByCareer: {}, roadmapsByCareer: {}, completedStages });
const accepted = ["1", "2", "9", "10", "12", "123", String(Number.MAX_SAFE_INTEGER)];
const rejected = ["0", "00", "01", "007", "-1", "+1", "1.5", "1.0", "1e2", "0x1", " 1", "1 ", "", "abc", "1a", "Infinity", "NaN", "9007199254740993", "99999999999999999999"];
const input: Record<string, unknown> = {};
for (const n of [...accepted, ...rejected]) input[`Career 1::${n}`] = true;
const got = S.parseSession(snap(input), NOW)?.completedStages ?? {};
const keptNums = Object.keys(got).map((k) => k.split("::")[1]);
check(`accepted: ${accepted.join(", ")}`, eq(keptNums.sort(), [...accepted].sort()), keptNums);
check(`rejected: ${rejected.map((r) => JSON.stringify(r)).join(", ")}`, rejected.every((r) => !(`Career 1::${r}` in got)), keptNums.filter((n) => rejected.includes(n)));
const valid = { "Career 1::1": true, "Career 2::3": true, "Career 3::12": true };
check("valid existing progress preserved exactly", eq(S.parseSession(snap(valid), NOW)?.completedStages, valid), S.parseSession(snap(valid), NOW)?.completedStages);
check("other rules unchanged: false values, unknown careers, missing stage dropped",
  eq(S.parseSession(snap({ "Career 1::1": true, "Career 1::2": false, "Ghost::1": true, "Career 1::": true, "::1": true }), NOW)?.completedStages, { "Career 1::1": true }), null);
check("title containing '::' still handled (last separator used)",
  eq(S.parseSession({ ...snap({ "A::B::2": true, "A::B::02": true }), careerResults: { profileSummary: "s", careers: [{ ...career(1), title: "A::B" }] }, selectedCareerTitle: "A::B" }, NOW)?.completedStages, { "A::B::2": true }), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
