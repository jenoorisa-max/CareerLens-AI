// Student profile validation shared by the server (handlers.ts: reject bad
// API input with a 400) and the browser (session.ts: reject a bad profile
// restored from sessionStorage). Pure TypeScript with no runtime imports, so
// it is safe in the browser bundle. Moved verbatim from src/server/validation.ts.
import type { StudentProfile } from "../types/career.ts";

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

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
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
