import { CV_LIMITS } from "../src/shared/cvLimits.ts";
import { handleCvAnalyze } from "../src/server/cv/handlers.ts";

// Vercel serverless function: POST /api/cv-analyze
// All logic lives in src/server/cv/ (shared with server.ts). Vercel itself
// rejects bodies over 4.5 MB; this function also enforces the app's own
// request limit (same as the Express route), and the handler the file limits.
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }
  if (Number(req.headers?.["content-length"] ?? 0) > CV_LIMITS.maxRequestBytes) {
    return res.status(413).json({ error: "Request body is too large." });
  }

  let body: unknown;
  try {
    body = req.body; // Vercel parses JSON lazily and throws on malformed JSON
  } catch {
    return res.status(400).json({ error: "Invalid JSON request body." });
  }

  const result = await handleCvAnalyze(body);
  return res.status(result.status).json(result.body);
}
