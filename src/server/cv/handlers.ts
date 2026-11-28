// POST /api/cv-analyze handler, shared by the Vercel function (api/cv-analyze.ts)
// and the local Express server (server.ts). Like the existing handlers it never
// throws and returns a status + JSON body.
//
// Privacy: the CV is held in memory for this request only. It is never written
// to disk, a database or a cache, and never logged (gemini.ts logs only error
// metadata, with API keys and long base64 data redacted).
import { formatGeminiError, generateStructuredJSON } from "../gemini.ts";
import { validateCvAnalyzeRequest } from "./input.ts";
import { buildCvAnalysisPrompt, CV_ANALYSIS_SYSTEM_INSTRUCTION } from "./prompts.ts";
import { buildCvAnalysisSchema } from "./schemas.ts";
import { checkCvAnalysisShape, sanitizeCvAnalysis } from "./shape.ts";

export interface CvHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

const UNREADABLE_MESSAGE =
  "We couldn't read your CV clearly enough to analyze it. Please upload a sharper photo, a text-based PDF, or a DOCX file.";

export async function handleCvAnalyze(input: unknown): Promise<CvHandlerResult> {
  try {
    const validation = validateCvAnalyzeRequest(input);
    if (!validation.ok) {
      return { status: validation.status, body: { error: validation.error, code: validation.code } };
    }
    const request = validation.request;
    const withJobMatch = Boolean(request.jobDescription);

    const raw = await generateStructuredJSON<Record<string, unknown>>({
      systemInstruction: CV_ANALYSIS_SYSTEM_INSTRUCTION,
      prompt: buildCvAnalysisPrompt(request),
      responseSchema: buildCvAnalysisSchema(withJobMatch),
      validate: checkCvAnalysisShape(withJobMatch),
      parts: request.parts,
    });

    if (raw.cvReadable === false) {
      const note = typeof raw.readabilityNote === "string" ? raw.readabilityNote.trim().slice(0, 300) : "";
      return { status: 422, body: { error: UNREADABLE_MESSAGE, code: "unreadable", ...(note ? { detail: note } : {}) } };
    }

    const data = sanitizeCvAnalysis(raw, { withJobMatch, sourceText: request.text });
    return { status: 200, body: { data } };
  } catch (error) {
    const { message, status } = formatGeminiError(error);
    return { status, body: { error: message } };
  }
}
