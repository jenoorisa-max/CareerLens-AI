// CV analysis output: a shape check (used by generateStructuredJSON's
// `validate`, which retries once on a bad shape) and a sanitiser that trims
// the result to safe sizes and removes quotes that are not really in the CV.
import type { CvAnalysis, LanguageIssueType, Priority, SectionImportance, CandidateStage } from "../../types/cv.ts";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

const CATEGORIES = ["contentQuality", "completeness", "careerRelevance", "professionalPresentation"] as const;
const LIST_FIELDS = ["strengths", "weaknesses", "missingSections", "languageIssues", "weakDescriptions", "formattingIssues", "improvements"] as const;

/** Returns null when usable, or the path of the first problem (logged, never shown). */
export function checkCvAnalysisShape(withJobMatch: boolean) {
  return (data: unknown): string | null => {
    if (!isRec(data)) return "root";
    if (typeof data.cvReadable !== "boolean") return "cvReadable";
    if (data.cvReadable === false) return typeof data.readabilityNote === "string" ? null : "readabilityNote";
    if (!isNum(data.overallScore)) return "overallScore";
    if (typeof data.overallSummary !== "string") return "overallSummary";
    if (!isRec(data.categoryScores)) return "categoryScores";
    for (const c of CATEGORIES) {
      const s = (data.categoryScores as Rec)[c];
      if (!isRec(s) || !isNum(s.score) || typeof s.explanation !== "string") return `categoryScores.${c}`;
    }
    for (const f of LIST_FIELDS) if (!Array.isArray(data[f])) return f;
    if (!isRec(data.ats) || !isNum(data.ats.estimatedScore) || typeof data.ats.summary !== "string" || !Array.isArray(data.ats.parsingRisks)) return "ats";
    if (!isRec(data.keywords) || !Array.isArray(data.keywords.present) || !Array.isArray(data.keywords.missing)) return "keywords";
    if (withJobMatch) {
      const j = data.jobMatch;
      if (!isRec(j) || !isNum(j.matchScore) || typeof j.summary !== "string" || !Array.isArray(j.matchedRequirements) || !Array.isArray(j.gaps)) return "jobMatch";
    }
    return null;
  };
}

// ---------------------------------------------------------------- sanitiser
const LIMITS = { text: 600, short: 200, excerpt: 300, list: 8, items: 12, keywords: 25 } as const;

const str = (v: unknown, max: number = LIMITS.text) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const score = (v: unknown) => (isNum(v) ? Math.min(100, Math.max(0, Math.round(v as number))) : 0);
const strings = (v: unknown, maxItems: number, maxLen: number = LIMITS.short) =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];
const records = (v: unknown, maxItems: number) => (Array.isArray(v) ? v.filter(isRec).slice(0, maxItems) : []);
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return allowed.find((a) => a.toLowerCase() === s) ?? fallback;
}

/** Case- and whitespace-insensitive comparison for "is this excerpt in the CV?". */
const squash = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export interface SanitiseOptions {
  withJobMatch: boolean;
  /** For text CVs: excerpts not found in this text are dropped (no fabricated quotes). */
  sourceText?: string;
}

export function sanitizeCvAnalysis(data: Rec, options: SanitiseOptions): CvAnalysis {
  const source = options.sourceText ? squash(options.sourceText) : undefined;
  const quoted = (excerpt: string) => excerpt.length > 0 && (source === undefined || source.includes(squash(excerpt)));
  const cs = isRec(data.categoryScores) ? data.categoryScores : {};
  const cat = (key: (typeof CATEGORIES)[number]) => {
    const s = isRec(cs[key]) ? (cs[key] as Rec) : {};
    return { score: score(s.score), explanation: str(s.explanation) };
  };
  const ats = isRec(data.ats) ? data.ats : {};
  const kw = isRec(data.keywords) ? data.keywords : {};

  const result: CvAnalysis = {
    candidateStage: oneOf<CandidateStage>(data.candidateStage, ["Student", "Fresh graduate", "Early career", "Experienced"], "Student"),
    overallScore: score(data.overallScore),
    overallSummary: str(data.overallSummary),
    categoryScores: {
      contentQuality: cat("contentQuality"),
      completeness: cat("completeness"),
      careerRelevance: cat("careerRelevance"),
      professionalPresentation: cat("professionalPresentation"),
    },
    strengths: strings(data.strengths, LIMITS.list, LIMITS.text),
    weaknesses: strings(data.weaknesses, LIMITS.list, LIMITS.text),
    missingSections: records(data.missingSections, LIMITS.items)
      .map((m) => ({ section: str(m.section, LIMITS.short), importance: oneOf<SectionImportance>(m.importance, ["Essential", "Recommended", "Optional"], "Recommended"), suggestion: str(m.suggestion) }))
      .filter((m) => m.section),
    languageIssues: records(data.languageIssues, LIMITS.items * 2)
      .map((m) => ({ type: oneOf<LanguageIssueType>(m.type, ["Grammar", "Spelling", "Punctuation", "Style"], "Style"), excerpt: str(m.excerpt, LIMITS.excerpt), issue: str(m.issue), suggestion: str(m.suggestion) }))
      .filter((m) => quoted(m.excerpt) && m.issue)
      .slice(0, LIMITS.items + 3),
    weakDescriptions: records(data.weakDescriptions, LIMITS.items * 2)
      .map((m) => ({ excerpt: str(m.excerpt, LIMITS.excerpt), problem: str(m.problem), suggestion: str(m.suggestion) }))
      .filter((m) => quoted(m.excerpt) && m.problem)
      .slice(0, LIMITS.items),
    formattingIssues: records(data.formattingIssues, LIMITS.items)
      .map((m) => ({ issue: str(m.issue), suggestion: str(m.suggestion) }))
      .filter((m) => m.issue),
    ats: { estimatedScore: score(ats.estimatedScore), summary: str(ats.summary), parsingRisks: strings(ats.parsingRisks, LIMITS.items, LIMITS.text) },
    keywords: { present: strings(kw.present, LIMITS.keywords, 60), missing: strings(kw.missing, LIMITS.keywords, 60) },
    improvements: records(data.improvements, LIMITS.items)
      .map((m) => ({ priority: oneOf<Priority>(m.priority, ["High", "Medium", "Low"], "Medium"), action: str(m.action), reason: str(m.reason) }))
      .filter((m) => m.action),
  };
  if (options.withJobMatch && isRec(data.jobMatch)) {
    const j = data.jobMatch;
    result.jobMatch = { matchScore: score(j.matchScore), summary: str(j.summary), matchedRequirements: strings(j.matchedRequirements, LIMITS.items, LIMITS.text), gaps: strings(j.gaps, LIMITS.items, LIMITS.text) };
  }
  return result;
}
