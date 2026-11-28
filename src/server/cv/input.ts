// Validation for POST /api/cv-analyze. Every rejection happens here, before
// Gemini is called. Nothing in this module logs: CV text, file data and
// contact details must never reach the server logs.
import { CV_IMAGE_MIME_TYPES, CV_LIMITS, CV_PDF_MIME_TYPE } from "../../shared/cvLimits.ts";
import type { GeminiInlinePart } from "../gemini.ts";

export type CvErrorCode =
  | "invalid_request"
  | "consent_required"
  | "invalid_source"
  | "unsupported_type"
  | "invalid_file"
  | "too_many_images"
  | "too_large"
  | "empty_cv"
  | "too_long"
  | "invalid_job_description";

/** The validated request, ready for the prompt and Gemini. */
export interface ValidCvRequest {
  kind: "text" | "pdf" | "images";
  /** Text CVs only (normalised extracted text). */
  text?: string;
  /** PDF / image CVs only, in page order. */
  parts?: GeminiInlinePart[];
  jobDescription?: string;
}

export type CvValidation =
  | { ok: true; request: ValidCvRequest }
  | { ok: false; status: number; code: CvErrorCode; error: string };

const fail = (status: number, code: CvErrorCode, error: string): CvValidation => ({ ok: false, status, code, error });

const MESSAGES = {
  invalid: "Invalid request.",
  consent: "Please confirm the privacy notice before your CV is analyzed.",
  source: "Please upload your CV as a PDF, a DOCX file, or JPG/PNG images.",
  type: "This file type is not supported. Please upload a PDF, DOCX, JPG or PNG file.",
  file: "This file could not be read. Please check that it is a valid, undamaged file.",
  tooManyImages: `Please upload at most ${CV_LIMITS.maxImages} images (one per CV page).`,
  tooLarge: "Your CV files are too large. Please keep the total under 3 MB (for example, upload a compressed PDF or smaller photos).",
  empty: "Your CV appears to be empty. Please upload a CV with readable content.",
  tooLong: "Your CV text is too long. Please upload a shorter CV (around 10 pages or less).",
  jobDescription: `The job description must be text of at most ${CV_LIMITS.maxJobDescriptionChars.toLocaleString("en-US")} characters.`,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** Decoded size from the base64 length, without decoding the whole file. */
function decodedBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

/** The file really is what it claims to be (checks its first bytes). */
function hasExpectedSignature(mimeType: string, base64: string): boolean {
  const head = Buffer.from(base64.slice(0, 16), "base64");
  if (mimeType === CV_PDF_MIME_TYPE) return head.subarray(0, 5).toString("latin1") === "%PDF-";
  if (mimeType === "image/png") return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  return false;
}

/** Checks one file; returns its decoded size or a rejection. */
function checkFile(file: unknown, allowed: readonly string[]): { bytes: number; part: GeminiInlinePart } | CvValidation {
  if (!isRecord(file)) return fail(400, "invalid_file", MESSAGES.file);
  const { mimeType, data } = file;
  if (typeof mimeType !== "string" || !allowed.includes(mimeType)) {
    return fail(400, "unsupported_type", MESSAGES.type);
  }
  if (typeof data !== "string" || data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) {
    return fail(400, "invalid_file", MESSAGES.file);
  }
  const bytes = decodedBytes(data);
  if (bytes < CV_LIMITS.minFileBytes || !hasExpectedSignature(mimeType, data)) {
    return fail(400, "invalid_file", MESSAGES.file);
  }
  return { bytes, part: { mimeType: mimeType as GeminiInlinePart["mimeType"], data } };
}

/** Removes control characters (keeps line breaks and tabs); does not change words. */
function normaliseText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

export function validateCvAnalyzeRequest(input: unknown): CvValidation {
  if (!isRecord(input)) return fail(400, "invalid_request", MESSAGES.invalid);

  // 1. Privacy consent: both acknowledgements must be explicitly true.
  const consent = input.consent;
  if (!isRecord(consent) || consent.geminiFreeTier !== true || consent.noPermanentStorage !== true) {
    return fail(400, "consent_required", MESSAGES.consent);
  }

  // 2. Optional job description.
  let jobDescription: string | undefined;
  if (input.jobDescription !== undefined && input.jobDescription !== null) {
    if (typeof input.jobDescription !== "string") return fail(400, "invalid_job_description", MESSAGES.jobDescription);
    const jd = normaliseText(input.jobDescription);
    if (jd.length > CV_LIMITS.maxJobDescriptionChars) return fail(400, "invalid_job_description", MESSAGES.jobDescription);
    jobDescription = jd || undefined;
  }

  // 3. The CV itself.
  const source = input.source;
  if (!isRecord(source)) return fail(400, "invalid_source", MESSAGES.source);

  if (source.kind === "text") {
    if (typeof source.text !== "string") return fail(400, "invalid_source", MESSAGES.source);
    const text = normaliseText(source.text);
    if (text.replace(/\s/g, "").length < CV_LIMITS.minTextChars) return fail(400, "empty_cv", MESSAGES.empty);
    if (text.length > CV_LIMITS.maxTextChars) return fail(400, "too_long", MESSAGES.tooLong);
    return { ok: true, request: { kind: "text", text, jobDescription } };
  }

  if (source.kind === "pdf") {
    const checked = checkFile(source.file, [CV_PDF_MIME_TYPE]);
    if ("ok" in checked) return checked;
    if (checked.bytes > CV_LIMITS.maxTotalFileBytes) return fail(413, "too_large", MESSAGES.tooLarge);
    return { ok: true, request: { kind: "pdf", parts: [checked.part], jobDescription } };
  }

  if (source.kind === "images") {
    const files = source.files;
    if (!Array.isArray(files) || files.length === 0) return fail(400, "invalid_source", MESSAGES.source);
    if (files.length > CV_LIMITS.maxImages) return fail(400, "too_many_images", MESSAGES.tooManyImages);
    const parts: GeminiInlinePart[] = [];
    let total = 0;
    for (const file of files) {
      const checked = checkFile(file, CV_IMAGE_MIME_TYPES);
      if ("ok" in checked) return checked;
      total += checked.bytes;
      if (total > CV_LIMITS.maxTotalFileBytes) return fail(413, "too_large", MESSAGES.tooLarge);
      parts.push(checked.part);
    }
    return { ok: true, request: { kind: "images", parts, jobDescription } };
  }

  return fail(400, "invalid_source", MESSAGES.source);
}
