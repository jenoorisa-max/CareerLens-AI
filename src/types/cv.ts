// CV Analyzer types (request contract and analysis result).

export type CvImageMimeType = "image/png" | "image/jpeg";

/** What the student uploaded, as sent to POST /api/cv-analyze. */
export type CvSource =
  /** Text extracted from a DOCX file in the browser. */
  | { kind: "text"; text: string }
  /** One PDF file, base64 without a "data:" prefix. */
  | { kind: "pdf"; file: { mimeType: "application/pdf"; data: string } }
  /** 1–5 page images, in page order (page 1 first). */
  | { kind: "images"; files: Array<{ mimeType: CvImageMimeType; data: string }> };

export interface CvAnalyzeRequest {
  /** Both must be literally true: the student acknowledged the privacy notice. */
  consent: {
    /** CV content is sent to Google's Gemini API (free tier) for analysis. */
    geminiFreeTier: true;
    /** CareerLens does not permanently store the uploaded CV. */
    noPermanentStorage: true;
  };
  source: CvSource;
  /** Optional job description for targeted matching. */
  jobDescription?: string;
}

export type CandidateStage = "Student" | "Fresh graduate" | "Early career" | "Experienced";
export type Priority = "High" | "Medium" | "Low";
export type SectionImportance = "Essential" | "Recommended" | "Optional";
export type LanguageIssueType = "Grammar" | "Spelling" | "Punctuation" | "Style";

export interface ScoreWithReason {
  /** 0–100 */
  score: number;
  explanation: string;
}

export interface CvAnalysis {
  candidateStage: CandidateStage;
  /** 0–100 */
  overallScore: number;
  overallSummary: string;
  categoryScores: {
    contentQuality: ScoreWithReason;
    completeness: ScoreWithReason;
    careerRelevance: ScoreWithReason;
    professionalPresentation: ScoreWithReason;
  };
  strengths: string[];
  weaknesses: string[];
  missingSections: Array<{ section: string; importance: SectionImportance; suggestion: string }>;
  languageIssues: Array<{ type: LanguageIssueType; excerpt: string; issue: string; suggestion: string }>;
  weakDescriptions: Array<{ excerpt: string; problem: string; suggestion: string }>;
  formattingIssues: Array<{ issue: string; suggestion: string }>;
  /** An estimate only: no real applicant tracking system is used. */
  ats: { estimatedScore: number; summary: string; parsingRisks: string[] };
  keywords: { present: string[]; missing: string[] };
  improvements: Array<{ priority: Priority; action: string; reason: string }>;
  /** Present only when a job description was provided. */
  jobMatch?: { matchScore: number; summary: string; matchedRequirements: string[]; gaps: string[] };
}
