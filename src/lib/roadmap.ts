// Learning Roadmap display helpers (no React, no requests). Status comes only
// from the stages returned by the API and the completion ticks the student made.
import type { RoadmapStage } from "../types/career";

export type StageStatus = "completed" | "current" | "upcoming";

export interface RoadmapStatus {
  /** One status per stage, in the roadmap's order. */
  statuses: StageStatus[];
  completed: number;
  total: number;
  /** Rounded 0–100; 0 when there are no stages. */
  percent: number;
  /** The first stage (in order) that is not completed, or null when all are. */
  currentStage: RoadmapStage | null;
}

/**
 * Completed = ticked by the student. Current = the first stage in order that is
 * not ticked. Upcoming = every other unticked stage. Only stages that exist in
 * this roadmap count toward progress.
 */
export function roadmapStatus(
  stages: RoadmapStage[],
  completedStages: Record<number, boolean>
): RoadmapStatus {
  let completed = 0;
  let currentIndex = -1;
  const statuses = stages.map((stage, index): StageStatus => {
    if (completedStages[stage.stageNumber]) {
      completed++;
      return "completed";
    }
    if (currentIndex === -1) {
      currentIndex = index;
      return "current";
    }
    return "upcoming";
  });
  const total = stages.length;
  return {
    statuses,
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    currentStage: currentIndex === -1 ? null : stages[currentIndex],
  };
}
