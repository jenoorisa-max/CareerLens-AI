// Framework-agnostic request handlers shared by the Vercel functions
// (api/*.ts, used in production) and the local Express server (server.ts).
// Each handler takes the parsed JSON body and returns a status + JSON body;
// it never throws, so the thin wrappers only have to send the result.
import { formatGeminiError, generateStructuredJSON } from "./gemini.ts";
import { careerFinderSchema, roadmapSchema, skillGapSchema } from "./schemas.ts";
import {
  SYSTEM_INSTRUCTIONS,
  buildCareersPrompt,
  buildRoadmapPrompt,
  buildSkillGapPrompt,
} from "./prompts.ts";
import {
  asRecord,
  sanitizeCareer,
  sanitizeSkillGap,
  validateProfile,
} from "./validation.ts";
import type {
  CareerFinderResponse,
  LearningRoadmapData,
  SkillGapAnalysis,
} from "../types/career.ts";

export interface HandlerResult {
  status: number;
  body: { data?: unknown; error?: string };
}

const MISSING_CONTEXT_ERROR = "Student profile and a selected career are required.";

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

function checkCareersShape(data: unknown): string | null {
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

function checkSkillGapShape(data: unknown): string | null {
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

function checkRoadmapShape(data: unknown): string | null {
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

function errorResult(error: unknown): HandlerResult {
  const { message, status } = formatGeminiError(error);
  return { status, body: { error: message } };
}

export async function handleCareers(input: unknown): Promise<HandlerResult> {
  try {
    const profile = validateProfile(input);
    if (!profile.ok) {
      return { status: 400, body: { error: profile.error } };
    }

    const data = await generateStructuredJSON<CareerFinderResponse>({
      systemInstruction: SYSTEM_INSTRUCTIONS.careers,
      prompt: buildCareersPrompt(profile.value),
      responseSchema: careerFinderSchema,
      validate: checkCareersShape,
    });

    if (!data.careers || data.careers.length === 0) {
      return {
        status: 502,
        body: { error: "Unable to generate career recommendations. Please try again." },
      };
    }

    return { status: 200, body: { data: { ...data, careers: data.careers.slice(0, 3) } } };
  } catch (error) {
    return errorResult(error);
  }
}

export async function handleSkillGap(input: unknown): Promise<HandlerResult> {
  try {
    const body = asRecord(input);
    const career = sanitizeCareer(body.career);
    if (!body.profile || !career) {
      return { status: 400, body: { error: MISSING_CONTEXT_ERROR } };
    }

    const profile = validateProfile(body.profile);
    if (!profile.ok) {
      return { status: 400, body: { error: profile.error } };
    }

    const data = await generateStructuredJSON<SkillGapAnalysis>({
      systemInstruction: SYSTEM_INSTRUCTIONS.skillGap,
      prompt: buildSkillGapPrompt(profile.value, career),
      responseSchema: skillGapSchema,
      validate: checkSkillGapShape,
    });

    return { status: 200, body: { data } };
  } catch (error) {
    return errorResult(error);
  }
}

export async function handleRoadmap(input: unknown): Promise<HandlerResult> {
  try {
    const body = asRecord(input);
    const career = sanitizeCareer(body.career);
    if (!body.profile || !career) {
      return { status: 400, body: { error: MISSING_CONTEXT_ERROR } };
    }

    const profile = validateProfile(body.profile);
    if (!profile.ok) {
      return { status: 400, body: { error: profile.error } };
    }

    const data = await generateStructuredJSON<LearningRoadmapData>({
      systemInstruction: SYSTEM_INSTRUCTIONS.roadmap,
      prompt: buildRoadmapPrompt(profile.value, career, sanitizeSkillGap(body.skillGap)),
      responseSchema: roadmapSchema,
      validate: checkRoadmapShape,
    });

    return { status: 200, body: { data } };
  } catch (error) {
    return errorResult(error);
  }
}
