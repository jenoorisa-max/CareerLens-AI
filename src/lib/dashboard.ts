// Dashboard logic (no React): journey status, roadmap progress and the next
// recommended step, derived ONLY from the student's real saved assessment.
// Nothing here makes requests; the Dashboard calls the existing App handlers.
import type {
  CareerFinderResponse,
  CareerRecommendation,
  LearningRoadmapData,
  SkillGapAnalysis,
} from "../types/career";

export interface JourneyInput {
  careerResults: CareerFinderResponse | null;
  selectedCareer: CareerRecommendation | null;
  skillGapsByCareer: Record<string, SkillGapAnalysis>;
  roadmapsByCareer: Record<string, LearningRoadmapData>;
  /** Keys "<career title>::<stage number>" (as stored by App / session.ts). */
  completedStages: Record<string, true>;
}

export interface RoadmapProgress {
  completed: number;
  total: number;
  /** Title of the first stage not yet completed, or null when all are done. */
  nextStageTitle: string | null;
}

export type NextStep =
  | { kind: "find-careers" }
  | { kind: "analyze-skill-gap"; career: CareerRecommendation }
  | { kind: "build-roadmap"; career: CareerRecommendation }
  | { kind: "continue-roadmap"; career: CareerRecommendation; progress: RoadmapProgress }
  | { kind: "roadmap-complete"; career: CareerRecommendation; progress: RoadmapProgress };

export interface JourneyStep {
  key: "finder" | "skill-gap" | "roadmap";
  done: boolean;
}

/** Progress counts only stages that exist in this roadmap. */
export function roadmapProgress(
  careerTitle: string,
  roadmap: LearningRoadmapData,
  completedStages: Record<string, true>
): RoadmapProgress {
  let completed = 0;
  let nextStageTitle: string | null = null;
  for (const stage of roadmap.stages) {
    if (completedStages[`${careerTitle}::${stage.stageNumber}`]) completed++;
    else if (nextStageTitle === null) nextStageTitle = stage.title;
  }
  return { completed, total: roadmap.stages.length, nextStageTitle };
}

/** The career the Dashboard focuses on: the selected one, else the first match. */
export function focusCareer(input: JourneyInput): CareerRecommendation | null {
  const careers = input.careerResults?.careers ?? [];
  if (careers.length === 0) return null;
  const selected = input.selectedCareer;
  return selected && careers.some((c) => c.title === selected.title) ? selected : careers[0];
}

export function getNextStep(input: JourneyInput): NextStep {
  const career = focusCareer(input);
  if (!career) return { kind: "find-careers" };
  if (!input.skillGapsByCareer[career.title]) return { kind: "analyze-skill-gap", career };
  const roadmap = input.roadmapsByCareer[career.title];
  if (!roadmap) return { kind: "build-roadmap", career };
  const progress = roadmapProgress(career.title, roadmap, input.completedStages);
  return progress.completed < progress.total
    ? { kind: "continue-roadmap", career, progress }
    : { kind: "roadmap-complete", career, progress };
}

/** Status of the three journey steps for the focus career. */
export function journeySteps(input: JourneyInput): JourneyStep[] {
  const career = focusCareer(input);
  return [
    { key: "finder", done: career !== null },
    { key: "skill-gap", done: career !== null && Boolean(input.skillGapsByCareer[career.title]) },
    { key: "roadmap", done: career !== null && Boolean(input.roadmapsByCareer[career.title]) },
  ];
}
