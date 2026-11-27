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
import {
  checkCareersShape,
  checkRoadmapShape,
  checkSkillGapShape,
} from "../shared/responseShape.ts";
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
