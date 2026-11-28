// Builds the POST /api/cv-analyze request from what the student prepared, and
// checks it against the same limits the server enforces (src/shared/cvLimits.ts),
// so a request the server would reject is never sent.
import { CV_LIMITS } from "../../../shared/cvLimits";
import type { CvAnalyzeRequest, CvImageMimeType } from "../../../types/cv";

export type PreparedCv =
  | { kind: "text"; text: string }
  | { kind: "pdf"; data: string; bytes: number }
  | { kind: "images"; pages: Array<{ data: string; mimeType: CvImageMimeType; bytes: number }> };

export const REQUEST_MESSAGES = {
  consent: "Please confirm the privacy notice to continue.",
  empty: "Your CV appears to be empty. Please upload a CV with readable content.",
  tooLong: "Your CV text is too long. Please upload a shorter CV (around 10 pages or less).",
  tooLarge: "Your CV files are too large. Please keep the total under 3 MB (for example, upload a compressed PDF or smaller photos).",
  tooManyImages: `Please upload at most ${CV_LIMITS.maxImages} images (one per CV page).`,
  noImages: "Please add at least one page image.",
  jobDescription: `The job description can be at most ${CV_LIMITS.maxJobDescriptionChars.toLocaleString("en-US")} characters.`,
} as const;

/** Returns an error message, or null when the request can be sent. */
export function checkBeforeSend(cv: PreparedCv, options: { consent: boolean; jobDescription: string }): string | null {
  if (!options.consent) return REQUEST_MESSAGES.consent;
  if (options.jobDescription.trim().length > CV_LIMITS.maxJobDescriptionChars) return REQUEST_MESSAGES.jobDescription;
  if (cv.kind === "text") {
    if (cv.text.replace(/\s/g, "").length < CV_LIMITS.minTextChars) return REQUEST_MESSAGES.empty;
    if (cv.text.trim().length > CV_LIMITS.maxTextChars) return REQUEST_MESSAGES.tooLong;
    return null;
  }
  if (cv.kind === "pdf") return cv.bytes > CV_LIMITS.maxTotalFileBytes ? REQUEST_MESSAGES.tooLarge : null;
  if (cv.pages.length === 0) return REQUEST_MESSAGES.noImages;
  if (cv.pages.length > CV_LIMITS.maxImages) return REQUEST_MESSAGES.tooManyImages;
  const total = cv.pages.reduce((sum, p) => sum + p.bytes, 0);
  return total > CV_LIMITS.maxTotalFileBytes ? REQUEST_MESSAGES.tooLarge : null;
}

/** Pages are sent in the order the student arranged them (page 1 first). */
export function buildCvAnalyzeRequest(cv: PreparedCv, options: { jobDescription: string }): CvAnalyzeRequest {
  const jobDescription = options.jobDescription.trim();
  return {
    consent: { geminiFreeTier: true, noPermanentStorage: true },
    source:
      cv.kind === "text"
        ? { kind: "text", text: cv.text }
        : cv.kind === "pdf"
          ? { kind: "pdf", file: { mimeType: "application/pdf", data: cv.data } }
          : { kind: "images", files: cv.pages.map((p) => ({ mimeType: p.mimeType, data: p.data })) },
    ...(jobDescription ? { jobDescription } : {}),
  };
}
