// Adds comma-separated tags (skills or interests) to a list, enforcing the same
// limits as the server (src/shared/profile.ts). An invalid addition is rejected
// as a whole with the server's exact message, so nothing is silently dropped
// or truncated: the caller keeps the user's text in the input.
import { PROFILE_LIMITS } from "../shared/profile";

export type TagKind = "skill" | "interest";

export type TagMergeResult =
  | { ok: true; tags: string[] }
  | { ok: false; error: string };

export function mergeTags(raw: string, current: string[], kind: TagKind): TagMergeResult {
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) return { ok: true, tags: current };

  if (items.some((item) => item.length > PROFILE_LIMITS.tagLength)) {
    return { ok: false, error: `Each ${kind} must be ${PROFILE_LIMITS.tagLength} characters or fewer.` };
  }

  // Case-insensitive de-duplication (unchanged behaviour); duplicates do not count.
  const existingLower = new Set(current.map((s) => s.toLowerCase()));
  const next = [...current];
  for (const item of items) {
    if (!existingLower.has(item.toLowerCase())) {
      next.push(item);
      existingLower.add(item.toLowerCase());
    }
  }

  if (next.length > PROFILE_LIMITS.maxTags) {
    return { ok: false, error: `Please add no more than ${PROFILE_LIMITS.maxTags} ${kind}s.` };
  }
  return { ok: true, tags: next };
}
