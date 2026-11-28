// CV Analyzer limits, shared by the server (src/server/cv/) and, later, the
// browser upload form, so both enforce exactly the same rules.
// Pure TypeScript, no dependencies.

export const CV_LIMITS = {
  /**
   * Largest accepted request body, in bytes. Below Vercel's 4.5 MB function
   * payload limit, so an oversized request gets this app's own clear 413
   * instead of a platform error.
   */
  maxRequestBytes: 4_400_000,
  /** Total size of all uploaded files after base64 decoding (about 3 MB). */
  maxTotalFileBytes: 3 * 1024 * 1024,
  /** Anything smaller cannot be a real CV document or photo. */
  minFileBytes: 64,
  /** Multi-page CV photos/scans, in page order. */
  maxImages: 5,
  /** Extracted text (e.g. from a DOCX file), after trimming. */
  minTextChars: 50,
  maxTextChars: 30_000,
  /** Optional job description for targeted matching. */
  maxJobDescriptionChars: 5_000,
} as const;

/** Accepted file types (DOCX is converted to text in the browser). */
export const CV_PDF_MIME_TYPE = "application/pdf";
export const CV_IMAGE_MIME_TYPES = ["image/png", "image/jpeg"] as const;
