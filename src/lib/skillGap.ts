// Skill Gap display helpers (no React, no requests). Everything is derived
// from the analysis returned by the API: nothing is estimated or invented.
import type { MissingSkillItem, SkillGapAnalysis } from "../types/career";

export const IMPORTANCE_ORDER = ["Essential", "Important", "Helpful"] as const;

export interface ImportanceGroup {
  importance: string;
  items: MissingSkillItem[];
}

/**
 * Groups missing skills by importance (Essential, Important, Helpful, then any
 * other label in first-seen order). Items keep their original order within a
 * group, none are dropped, and empty groups are omitted.
 */
export function groupMissingSkills(items: MissingSkillItem[]): ImportanceGroup[] {
  const groups: ImportanceGroup[] = [];
  const byLabel: Record<string, ImportanceGroup> = {};
  for (const label of IMPORTANCE_ORDER) {
    byLabel[label] = { importance: label, items: [] };
    groups.push(byLabel[label]);
  }
  for (const item of items) {
    const label = String(item.importance ?? "");
    if (!byLabel[label]) {
      byLabel[label] = { importance: label, items: [] };
      groups.push(byLabel[label]);
    }
    byLabel[label].items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

/** Counts shown in the readiness summary (plain lengths of the returned lists). */
export function gapCounts(analysis: SkillGapAnalysis) {
  return {
    have: analysis.skillsYouHave.length,
    missing: analysis.missingSkills.length,
    essential: analysis.missingSkills.filter((s) => s.importance === "Essential").length,
    priorities: analysis.priorities.length,
  };
}
