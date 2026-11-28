// Gemini response schema for the CV analysis. Built per request so the
// job-match section only exists when a job description was provided.
import { Type, type Schema } from "@google/genai";

const scoreWithReason = (what: string): Schema => ({
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER, description: `0-100 score for ${what}.` },
    explanation: { type: Type.STRING, description: "1-2 sentences explaining the score, citing the CV." },
  },
  required: ["score", "explanation"],
});

const stringList = (description: string): Schema => ({ type: Type.ARRAY, items: { type: Type.STRING }, description });

export function buildCvAnalysisSchema(withJobMatch: boolean): Schema {
  const properties: Record<string, Schema> = {
    cvReadable: {
      type: Type.BOOLEAN,
      description: "False if the document is unreadable (blurry, cut off, blank, not a CV) so it cannot be assessed fairly.",
    },
    readabilityNote: {
      type: Type.STRING,
      description: "One sentence on legibility, e.g. which page is blurry. Empty string if everything is clear.",
    },
    candidateStage: {
      type: Type.STRING,
      enum: ["Student", "Fresh graduate", "Early career", "Experienced"],
      description: "Career stage inferred only from the CV.",
    },
    overallScore: { type: Type.INTEGER, description: "0-100 overall CV quality, fair to the candidate's stage." },
    overallSummary: { type: Type.STRING, description: "2-3 sentences explaining the overall score." },
    categoryScores: {
      type: Type.OBJECT,
      properties: {
        contentQuality: scoreWithReason("content quality (specific, results-focused descriptions)"),
        completeness: scoreWithReason("completeness of standard sections for this career stage"),
        careerRelevance: scoreWithReason("relevance to the candidate's apparent target careers"),
        professionalPresentation: scoreWithReason("professional presentation, tone and consistency"),
      },
      required: ["contentQuality", "completeness", "careerRelevance", "professionalPresentation"],
    },
    strengths: stringList("3-6 specific strengths found in the CV."),
    weaknesses: stringList("3-6 specific weaknesses found in the CV."),
    missingSections: {
      type: Type.ARRAY,
      description: "Standard sections that are missing or incomplete for this career stage.",
      items: {
        type: Type.OBJECT,
        properties: {
          section: { type: Type.STRING },
          importance: { type: Type.STRING, enum: ["Essential", "Recommended", "Optional"] },
          suggestion: { type: Type.STRING },
        },
        required: ["section", "importance", "suggestion"],
      },
    },
    languageIssues: {
      type: Type.ARRAY,
      description: "Grammar, spelling, punctuation or style problems. Each excerpt is copied exactly from the CV.",
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["Grammar", "Spelling", "Punctuation", "Style"] },
          excerpt: { type: Type.STRING, description: "Exact text from the CV (max ~15 words)." },
          issue: { type: Type.STRING },
          suggestion: { type: Type.STRING },
        },
        required: ["type", "excerpt", "issue", "suggestion"],
      },
    },
    weakDescriptions: {
      type: Type.ARRAY,
      description: "Vague or generic descriptions. Each excerpt is copied exactly from the CV.",
      items: {
        type: Type.OBJECT,
        properties: {
          excerpt: { type: Type.STRING, description: "Exact text from the CV (max ~25 words)." },
          problem: { type: Type.STRING },
          suggestion: { type: Type.STRING, description: "How to improve it using only facts already in the CV, or what to add if the student has it." },
        },
        required: ["excerpt", "problem", "suggestion"],
      },
    },
    formattingIssues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { issue: { type: Type.STRING }, suggestion: { type: Type.STRING } },
        required: ["issue", "suggestion"],
      },
    },
    ats: {
      type: Type.OBJECT,
      description: "Heuristic estimate of how well applicant tracking systems could parse this CV. Not a guarantee.",
      properties: {
        estimatedScore: { type: Type.INTEGER, description: "0-100 estimate." },
        summary: { type: Type.STRING },
        parsingRisks: stringList("Layout or content features that commonly cause parsing problems."),
      },
      required: ["estimatedScore", "summary", "parsingRisks"],
    },
    keywords: {
      type: Type.OBJECT,
      properties: {
        present: stringList("Relevant career keywords already in the CV."),
        missing: stringList("Relevant keywords missing from the CV, worth adding only if the candidate genuinely has the skill."),
      },
      required: ["present", "missing"],
    },
    improvements: {
      type: Type.ARRAY,
      description: "Concrete, prioritised improvement actions.",
      items: {
        type: Type.OBJECT,
        properties: {
          priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
          action: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ["priority", "action", "reason"],
      },
    },
  };
  const required = [
    "cvReadable", "readabilityNote", "candidateStage", "overallScore", "overallSummary", "categoryScores",
    "strengths", "weaknesses", "missingSections", "languageIssues", "weakDescriptions", "formattingIssues",
    "ats", "keywords", "improvements",
  ];
  if (withJobMatch) {
    properties.jobMatch = {
      type: Type.OBJECT,
      description: "How well the CV matches the provided job description.",
      properties: {
        matchScore: { type: Type.INTEGER, description: "0-100 estimate." },
        summary: { type: Type.STRING },
        matchedRequirements: stringList("Job requirements the CV shows evidence for."),
        gaps: stringList("Job requirements with no evidence in the CV."),
      },
      required: ["matchScore", "summary", "matchedRequirements", "gaps"],
    };
    required.push("jobMatch");
  }
  return { type: Type.OBJECT, properties, required, propertyOrdering: ["cvReadable", "readabilityNote", ...required.filter((k) => k !== "cvReadable" && k !== "readabilityNote")] };
}
