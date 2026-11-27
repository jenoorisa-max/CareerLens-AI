// F5: keep the current assessment across a page refresh (sessionStorage:
// per tab, cleared when the tab closes). Everything restored is re-validated;
// invalid or outdated data is dropped instead of being shown.
import type {
  ActiveTab,
  CareerFinderResponse,
  LearningRoadmapData,
  SkillGapAnalysis,
  StudentProfile,
} from "../types/career";
import { validateProfile } from "../shared/profile";
import {
  checkCareersShape,
  checkRoadmapShape,
  checkSkillGapShape,
} from "../shared/responseShape";

export const SESSION_STORAGE_KEY = "careerlens:session:v1";
const VERSION = 1;
/** Older saved sessions are discarded. */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Tolerance for a savedAt slightly in the future (clock adjustments). */
const CLOCK_SKEW_MS = 60_000;
const TABS: ActiveTab[] = ["finder", "skill-gap", "roadmap"];

export interface PersistedSession {
  profile: StudentProfile;
  careerResults: CareerFinderResponse;
  selectedCareerTitle: string;
  activeTab: ActiveTab;
  skillGapsByCareer: Record<string, SkillGapAnalysis>;
  roadmapsByCareer: Record<string, LearningRoadmapData>;
  /** Keys are "<career title>::<stage number>"; only completed stages are stored. */
  completedStages: Record<string, true>;
}

/**
 * Canonical positive integer as written by the app ("1", "12"): rejects "0",
 * leading zeros ("01"), negatives, decimals, exponents and unsafe integers.
 */
function isStageNumber(text: string): boolean {
  return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Keeps only entries for known careers that pass the shape check. */
function validEntries<T>(
  value: unknown,
  titles: Set<string>,
  check: (data: unknown) => string | null
): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isRecord(value)) return out;
  for (const [title, data] of Object.entries(value)) {
    if (titles.has(title) && check(data) === null) out[title] = data as T;
  }
  return out;
}

/** Validates a parsed snapshot. Returns null if it cannot be trusted as a whole. */
export function parseSession(raw: unknown, now: number = Date.now()): PersistedSession | null {
  if (!isRecord(raw) || raw.version !== VERSION) return null;
  const savedAt = raw.savedAt;
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  if (now - savedAt > SESSION_MAX_AGE_MS || savedAt - now > CLOCK_SKEW_MS) return null;

  const profile = validateProfile(raw.profile);
  if (!profile.ok) return null;

  if (checkCareersShape(raw.careerResults) !== null) return null;
  const results = raw.careerResults as CareerFinderResponse;
  const careers = results.careers.slice(0, 3);
  if (careers.length === 0) return null;
  const careerResults: CareerFinderResponse = { ...results, careers };
  const titles = new Set(careers.map((c) => c.title));

  const selectedCareerTitle =
    typeof raw.selectedCareerTitle === "string" && titles.has(raw.selectedCareerTitle)
      ? raw.selectedCareerTitle
      : careers[0].title;
  const activeTab = TABS.includes(raw.activeTab as ActiveTab)
    ? (raw.activeTab as ActiveTab)
    : "finder";

  const completedStages: Record<string, true> = {};
  if (isRecord(raw.completedStages)) {
    for (const [key, done] of Object.entries(raw.completedStages)) {
      const sep = key.lastIndexOf("::");
      if (done === true && sep > 0 && titles.has(key.slice(0, sep)) && isStageNumber(key.slice(sep + 2))) {
        completedStages[key] = true;
      }
    }
  }

  return {
    profile: profile.value,
    careerResults,
    selectedCareerTitle,
    activeTab,
    skillGapsByCareer: validEntries<SkillGapAnalysis>(raw.skillGapsByCareer, titles, checkSkillGapShape),
    roadmapsByCareer: validEntries<LearningRoadmapData>(raw.roadmapsByCareer, titles, checkRoadmapShape),
    completedStages,
  };
}

export function loadSession(now: number = Date.now()): PersistedSession | null {
  try {
    const text = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!text) return null;
    const session = parseSession(JSON.parse(text), now);
    if (!session) clearSession(); // drop invalid/outdated data
    return session;
  } catch {
    return null; // corrupt JSON or storage unavailable
  }
}

export function saveSession(session: PersistedSession, now: number = Date.now()): void {
  try {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ version: VERSION, savedAt: now, ...session })
    );
  } catch {
    // Storage full or unavailable: the app keeps working without persistence.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}
