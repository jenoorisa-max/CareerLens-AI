// Response-shape validators shared by the server (handlers.ts: reject malformed
// Gemini output before it reaches the browser) and the browser (session.ts:
// reject malformed data restored from sessionStorage). Pure TypeScript, no
// dependencies, so it is safe to include in the browser bundle.

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// Response-shape checks (B+). They cover every field the frontend renders or
// calls .map()/.join() on, so malformed AI output cannot crash the page.
// Each returns null when usable, or the path of the first problem (for logs).
// The data itself is never modified.
// ---------------------------------------------------------------------------

type FieldType = "string" | "number" | "string[]";

function checkObject(
  value: unknown,
  path: string,
  fields: Record<string, FieldType>
): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return path;
  const record = value as Record<string, unknown>;
  for (const [key, type] of Object.entries(fields)) {
    const v = record[key];
    const ok =
      type === "string"
        ? typeof v === "string"
        : type === "number"
          ? typeof v === "number" && Number.isFinite(v)
          : Array.isArray(v) && v.every((item) => typeof item === "string");
    if (!ok) return `${path}.${key}`;
  }
  return null;
}

function checkEach(
  value: unknown,
  path: string,
  check: (item: unknown, itemPath: string) => string | null
): string | null {
  if (!Array.isArray(value)) return path;
  for (let i = 0; i < value.length; i++) {
    const problem = check(value[i], `${path}[${i}]`);
    if (problem) return problem;
  }
  return null;
}

export function checkCareersShape(data: unknown): string | null {
  // Only the first 3 careers are returned to the frontend (see handleCareers),
  // so extra careers are not validated and cannot trigger a needless retry.
  const careers = asRecord(data).careers;
  return (
    checkObject(data, "data", { profileSummary: "string" }) ??
    checkEach(Array.isArray(careers) ? careers.slice(0, 3) : careers, "data.careers", (career, p) =>
      checkObject(career, p, {
        title: "string",
        matchScore: "number",
        tagline: "string",
        explanation: "string",
        whyItFitsProfile: "string",
        dayToDay: "string[]",
        coreSkills: "string[]",
        growthOutlook: "string",
      })
    )
  );
}

export function checkSkillGapShape(data: unknown): string | null {
  const d = asRecord(data);
  return (
    checkObject(data, "data", {
      careerTitle: "string",
      readinessScore: "number",
      readinessSummary: "string",
    }) ??
    checkEach(d.skillsYouHave, "data.skillsYouHave", (item, p) =>
      checkObject(item, p, { skill: "string", howItTransfers: "string" })
    ) ??
    checkEach(d.missingSkills, "data.missingSkills", (item, p) =>
      checkObject(item, p, { skill: "string", importance: "string", whyItMatters: "string" })
    ) ??
    checkEach(d.priorities, "data.priorities", (item, p) =>
      checkObject(item, p, {
        rank: "number",
        skill: "string",
        timeframe: "string",
        reason: "string",
        actionTip: "string",
      })
    )
  );
}

export function checkRoadmapShape(data: unknown): string | null {
  return (
    checkObject(data, "data", {
      careerTitle: "string",
      totalDuration: "string",
      overview: "string",
      careerLaunchTip: "string",
    }) ??
    checkEach(asRecord(data).stages, "data.stages", (stage, p) => {
      const s = asRecord(stage);
      return (
        checkObject(stage, p, {
          stageNumber: "number",
          title: "string",
          duration: "string",
          goal: "string",
          topics: "string[]",
          tools: "string[]",
        }) ??
        checkEach(s.resources, `${p}.resources`, (resource, rp) =>
          checkObject(resource, rp, { title: "string", type: "string", description: "string" })
        ) ??
        checkObject(s.project, `${p}.project`, {
          title: "string",
          description: "string",
          deliverables: "string[]",
        })
      );
    })
  );
}
