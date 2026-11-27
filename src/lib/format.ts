// Small display helpers for AI-generated values.

/** Rounds a score and keeps it within 0–100 (non-numbers become 0). */
export function clampPercent(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
}

/** Two-digit display number: 1 -> "01", 10 -> "10" (previously rendered "010"). */
export function padNumber(value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
  return String(safe).padStart(2, "0");
}
