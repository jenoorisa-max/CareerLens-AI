// Request validation shared by the Vercel functions (api/*.ts) and the local
// Express server (server.ts).
//
// Two strategies, on purpose:
// - The student profile is typed by the user, so it is VALIDATED: bad input
//   gets a 400 with a friendly message (same messages the app already shows).
// - The career and skill-gap objects are AI output that the browser sends
//   back, so they are SANITIZED instead: coerced to the expected shape and
//   trimmed to safe sizes, never rejected (except a career without a title,
//   which was already a 400). A normal user flow can therefore never be
//   blocked by these checks.
import type {
  CareerRecommendation,
  MissingSkillItem,
  SkillGapAnalysis,
  StudentProfile,
} from "../types/career.ts";

export const PROFILE_LIMITS = {
  name: 100,
  educationLevel: 100,
  fieldOfStudy: 150,
  maxTags: 30,
  tagLength: 80,
  careerGoals: 2000,
} as const;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: unknown, max: number): string {
  return trimmedString(value).slice(0, max);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function truncatedList(value: unknown, maxItems: number, maxLength: number): string[] {
  return stringList(value)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength));
}

function objectList(value: unknown, maxItems: number): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item !== null && typeof item === "object" && !Array.isArray(item))
    .slice(0, maxItems) as UnknownRecord[];
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

// ---------------------------------------------------------------------------
// Student profile (user input): validate
// ---------------------------------------------------------------------------

export function validateProfile(input: unknown): ValidationResult<StudentProfile> {
  const body = asRecord(input);
  const L = PROFILE_LIMITS;

  const name = trimmedString(body.name);
  if (!name) return { ok: false, error: "Please enter your name." };
  if (name.length > L.name) {
    return { ok: false, error: `Name must be ${L.name} characters or fewer.` };
  }

  const educationLevel = trimmedString(body.educationLevel);
  if (!educationLevel) return { ok: false, error: "Please select your education level." };
  if (educationLevel.length > L.educationLevel) {
    return { ok: false, error: `Education level must be ${L.educationLevel} characters or fewer.` };
  }

  const fieldOfStudy = trimmedString(body.fieldOfStudy);
  if (!fieldOfStudy) return { ok: false, error: "Please enter your field of study." };
  if (fieldOfStudy.length > L.fieldOfStudy) {
    return { ok: false, error: `Field of study must be ${L.fieldOfStudy} characters or fewer.` };
  }

  const skills = stringList(body.skills);
  if (skills.length === 0) return { ok: false, error: "Please add at least one current skill." };
  if (skills.length > L.maxTags) {
    return { ok: false, error: `Please add no more than ${L.maxTags} skills.` };
  }
  if (skills.some((s) => s.length > L.tagLength)) {
    return { ok: false, error: `Each skill must be ${L.tagLength} characters or fewer.` };
  }

  const interests = stringList(body.interests);
  if (interests.length === 0) return { ok: false, error: "Please add at least one interest." };
  if (interests.length > L.maxTags) {
    return { ok: false, error: `Please add no more than ${L.maxTags} interests.` };
  }
  if (interests.some((i) => i.length > L.tagLength)) {
    return { ok: false, error: `Each interest must be ${L.tagLength} characters or fewer.` };
  }

  const careerGoals = trimmedString(body.careerGoals);
  if (!careerGoals) return { ok: false, error: "Please describe your career goals." };
  if (careerGoals.length > L.careerGoals) {
    return { ok: false, error: `Career goals must be ${L.careerGoals} characters or fewer.` };
  }

  return {
    ok: true,
    value: { name, educationLevel, fieldOfStudy, skills, interests, careerGoals },
  };
}

// ---------------------------------------------------------------------------
// Career recommendation (AI output echoed back): sanitize
// ---------------------------------------------------------------------------

/** Returns null only when the career has no usable title. */
export function sanitizeCareer(input: unknown): CareerRecommendation | null {
  const c = asRecord(input);
  const title = truncate(c.title, 150);
  if (!title) return null;

  return {
    id: truncate(c.id, 100),
    title,
    matchScore: clampInteger(c.matchScore, 0, 100, 0),
    tagline: truncate(c.tagline, 300),
    explanation: truncate(c.explanation, 1500),
    whyItFitsProfile: truncate(c.whyItFitsProfile, 1500),
    dayToDay: truncatedList(c.dayToDay, 10, 300),
    coreSkills: truncatedList(c.coreSkills, 20, 100),
    growthOutlook: truncate(c.growthOutlook, 600),
  };
}

// ---------------------------------------------------------------------------
// Skill gap analysis (AI output echoed back): sanitize
// ---------------------------------------------------------------------------

const IMPORTANCE_LEVELS: ReadonlyArray<MissingSkillItem["importance"]> = [
  "Essential",
  "Important",
  "Helpful",
];

/**
 * Returns null when the value is missing or not shaped like a skill gap
 * analysis; the roadmap prompt then falls back to the career's core skills,
 * exactly as it does when no analysis has been run.
 */
export function sanitizeSkillGap(input: unknown): SkillGapAnalysis | null {
  if (input === null || input === undefined) return null;
  const g = asRecord(input);

  if (
    !Array.isArray(g.skillsYouHave) ||
    !Array.isArray(g.missingSkills) ||
    !Array.isArray(g.priorities)
  ) {
    return null;
  }

  return {
    careerTitle: truncate(g.careerTitle, 150),
    readinessScore: clampInteger(g.readinessScore, 0, 100, 0),
    readinessSummary: truncate(g.readinessSummary, 1500),
    skillsYouHave: objectList(g.skillsYouHave, 20)
      .map((item) => ({
        skill: truncate(item.skill, 100),
        howItTransfers: truncate(item.howItTransfers, 600),
      }))
      .filter((item) => item.skill),
    missingSkills: objectList(g.missingSkills, 20)
      .map((item) => {
        const importance = trimmedString(item.importance);
        return {
          skill: truncate(item.skill, 100),
          importance: IMPORTANCE_LEVELS.includes(importance as MissingSkillItem["importance"])
            ? (importance as MissingSkillItem["importance"])
            : "Important",
          whyItMatters: truncate(item.whyItMatters, 600),
        };
      })
      .filter((item) => item.skill),
    priorities: objectList(g.priorities, 20)
      .map((item, index) => ({
        rank: clampInteger(item.rank, 1, 99, index + 1),
        skill: truncate(item.skill, 100),
        timeframe: truncate(item.timeframe, 100),
        reason: truncate(item.reason, 600),
        actionTip: truncate(item.actionTip, 600),
      }))
      .filter((item) => item.skill),
  };
}
