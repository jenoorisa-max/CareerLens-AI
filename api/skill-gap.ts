import { handleSkillGap } from "../src/server/handlers.ts";

// Vercel serverless function: POST /api/skill-gap
// All logic lives in src/server/handlers.ts (shared with server.ts).
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  let body: unknown;
  try {
    body = req.body; // Vercel parses JSON lazily and throws on malformed JSON
  } catch {
    return res.status(400).json({ error: "Invalid JSON request body." });
  }

  const result = await handleSkillGap(body);
  return res.status(result.status).json(result.body);
}
