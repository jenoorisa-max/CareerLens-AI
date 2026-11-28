import React from "react";
import {
  Clock,
  Wrench,
  BookOpen,
  FolderGit2,
  CheckCircle2,
  Circle,
  Loader2,
  ArrowRight,
  Compass,
  RefreshCw,
  Printer,
  Lightbulb,
  AlertCircle,
  Layers,
  Target,
} from "lucide-react";
import type {
  CareerRecommendation,
  LearningRoadmapData,
  StudentProfile,
} from "../types/career";
import { padNumber } from "../lib/format";
import { roadmapStatus, type StageStatus } from "../lib/roadmap";

interface LearningRoadmapProps {
  profile: StudentProfile | null;
  careers: CareerRecommendation[];
  selectedCareer: CareerRecommendation | null;
  roadmap: LearningRoadmapData | null;
  isLoading: boolean;
  /** The last request for the selected career failed (shows a retry hint). */
  hasFailed?: boolean;
  /** Seconds left in the global AI cooldown (0 = none). */
  cooldownSeconds?: number;
  /** Completed stage numbers for the selected career (owned by App). */
  completedStages?: Record<number, boolean>;
  onToggleStage?: (stageNumber: number) => void;
  onSelectCareerForRoadmap: (
    career: CareerRecommendation,
    forceRefresh?: boolean
  ) => void;
  onGoToFinder: () => void;
}

// Status is always written out; colour and icons only reinforce it.
const STATUS: Record<StageStatus, { label: string; badge: string; node: string; card: string }> = {
  completed: {
    label: "Complete",
    badge: "bg-emerald-50 text-emerald-700",
    node: "bg-primary text-white border-primary",
    card: "border-primary/30",
  },
  current: {
    label: "Current stage",
    badge: "bg-primary text-white",
    node: "bg-surface text-primary-strong border-primary shadow-focus",
    card: "border-primary/50 shadow-raised",
  },
  upcoming: {
    label: "Upcoming",
    badge: "border border-line bg-canvas text-ink-muted",
    node: "bg-lavender-soft text-primary-strong border-line",
    card: "",
  },
};

export default function LearningRoadmap({
  profile,
  careers,
  selectedCareer,
  roadmap,
  isLoading,
  hasFailed = false,
  cooldownSeconds = 0,
  completedStages = {},
  onToggleStage = () => {},
  onSelectCareerForRoadmap,
  onGoToFinder,
}: LearningRoadmapProps) {
  if (!profile || careers.length === 0) {
    return (
      <section className="cl-card mx-auto mt-6 max-w-xl p-8 text-center sm:p-10 animate-enter">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-lavender-soft text-primary">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="font-display text-xl font-bold text-ink">Start with Career Finder</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Complete your profile in Career Finder first to generate a tailored
          learning roadmap with beginner-friendly stages, tools, resources, and
          portfolio projects.
        </p>
        <button type="button" onClick={onGoToFinder} className="cl-btn cl-btn-primary mt-6">
          <span>Go to Career Finder</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    );
  }

  const status = roadmap ? roadmapStatus(roadmap.stages, completedStages) : null;
  const completedCount = status?.completed ?? 0;
  const totalStages = status?.total ?? 0;
  const progressPercent = status?.percent ?? 0;
  const allDone = totalStages > 0 && completedCount === totalStages;

  return (
    <div className="space-y-6 animate-enter">
      {/* Header & career switcher */}
      <section className="cl-card cl-card-hero p-6 sm:p-8 no-print">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <p className="cl-eyebrow">Learning Roadmap</p>
            <h1 className="mt-2 text-heading font-bold text-ink">Your Beginner-Friendly Action Plan</h1>
            <p className="mt-2 text-ink-muted">
              Progressive stages, tools, curated resources, and hands-on
              projects tailored to your background.
            </p>
          </div>

          {selectedCareer && (
            <div className="flex shrink-0 flex-wrap items-center gap-2.5 self-start">
              <button
                type="button"
                disabled={isLoading || cooldownSeconds > 0}
                onClick={() => onSelectCareerForRoadmap(selectedCareer, true)}
                className="cl-btn cl-btn-secondary"
                aria-label={cooldownSeconds > 0 ? undefined : `Regenerate roadmap for ${selectedCareer.title}`}
              >
                <RefreshCw
                  className={`h-4 w-4 text-primary ${isLoading ? "motion-safe:animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {cooldownSeconds > 0 ? `Try again in ${cooldownSeconds}s` : "Regenerate"}
              </button>
              {roadmap && (
                <button type="button" onClick={() => window.print()} className="cl-btn cl-btn-ghost">
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  Print Plan
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-6">
          <p id="roadmap-career-label" className="text-xs font-semibold text-ink-muted">
            Career path
          </p>
          <div
            role="group"
            aria-labelledby="roadmap-career-label"
            className="mt-2 flex flex-wrap gap-1.5 rounded-control border border-line bg-canvas p-1.5 sm:inline-flex"
          >
            {careers.map((career, index) => {
              const isSelected = selectedCareer?.title === career.title;
              return (
                <button
                  key={`${index}-${career.id || career.title}`}
                  type="button"
                  disabled={isLoading}
                  aria-pressed={isSelected}
                  onClick={() => onSelectCareerForRoadmap(career)}
                  className={`cl-press min-h-11 rounded-[0.625rem] px-4 py-2 text-left text-sm font-semibold focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed ${
                    isSelected
                      ? "bg-primary text-white shadow-card"
                      : "text-ink-muted hover:bg-surface hover:text-primary-deep disabled:opacity-60"
                  }`}
                >
                  {career.title}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Loading */}
      {isLoading && (
        <section className="space-y-4" aria-busy="true">
          <div role="status" className="cl-card p-5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 shrink-0 text-primary motion-safe:animate-spin" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink">
                  Building your personalized roadmap for {selectedCareer?.title}...
                </p>
                <p className="text-xs text-ink-muted">
                  Organizing learning stages, tools, beginner resources, and hands-on
                  projects.
                </p>
              </div>
            </div>
            <div className="cl-loading-bar mt-4" aria-hidden="true" />
          </div>
          <div className="space-y-4" aria-hidden="true">
            {[1, 2, 3].map((item) => (
              <div key={item} className="flex gap-4">
                <div className="hidden h-10 w-10 shrink-0 rounded-pill bg-lavender-soft sm:block motion-safe:animate-pulse" />
                <div className="cl-card h-40 flex-1 space-y-4 p-6 motion-safe:animate-pulse">
                  <div className="h-4 w-24 rounded-pill bg-lavender-soft" />
                  <div className="h-5 w-1/2 rounded-pill bg-lavender-soft" />
                  <div className="h-12 w-full rounded-control bg-canvas" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Failed: stays until the user deliberately retries */}
      {!isLoading && !roadmap && hasFailed && (
        <section role="alert" className="cl-card flex items-start gap-3 border-red-200 p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-red-50 text-red-600">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">This roadmap didn&apos;t complete</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
              {cooldownSeconds > 0
                ? `The AI service is busy. You can try again in ${cooldownSeconds}s.`
                : `Use Regenerate above to try again for ${selectedCareer?.title ?? "this career"}.`}
            </p>
          </div>
        </section>
      )}

      {/* Nothing requested yet (no career selected) */}
      {!isLoading && !roadmap && !hasFailed && !selectedCareer && (
        <section className="cl-card p-6 text-center">
          <p className="text-sm text-ink-muted">Choose a career path above to build its learning roadmap.</p>
        </section>
      )}

      {/* Roadmap */}
      {!isLoading && roadmap && status && (
        <div className="cl-stagger space-y-6">
          {/* Overview & progress */}
          <section className="cl-card cl-card-accent p-6 sm:p-8" aria-labelledby="roadmap-overview-title">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl space-y-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Target className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Target Role · {roadmap.careerTitle}</span>
                </p>
                <h2 id="roadmap-overview-title" className="font-display text-lg font-bold text-ink">
                  Roadmap overview
                </h2>
                <p className="leading-relaxed text-ink">{roadmap.overview}</p>
                <ul className="flex flex-wrap gap-2 pt-1 text-xs font-semibold" aria-label="Roadmap facts">
                  <li className="cl-badge">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="font-mono tabular-nums">{roadmap.totalDuration}</span>
                  </li>
                  <li className="cl-badge">
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {totalStages} {totalStages === 1 ? "stage" : "stages"}
                    </span>
                  </li>
                </ul>
              </div>

              <div
                className={`shrink-0 rounded-control border p-4 transition-colors duration-300 lg:w-72 no-print ${
                  allDone ? "border-emerald-200 bg-emerald-50" : "border-line bg-canvas"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold text-ink-muted">
                  <span>Roadmap Progress</span>
                  <span className="font-mono font-bold tabular-nums text-primary-strong">
                    {completedCount}/{totalStages} Stages
                  </span>
                </div>
                <div
                  className="mt-2.5 h-2.5 w-full overflow-hidden rounded-pill bg-lavender-soft"
                  role="progressbar"
                  aria-label="Roadmap progress"
                  aria-valuemin={0}
                  aria-valuemax={totalStages}
                  aria-valuenow={completedCount}
                  aria-valuetext={`${completedCount} of ${totalStages} stages complete`}
                >
                  <div
                    className="cl-progress-fill h-full rounded-pill bg-primary"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="sr-only" aria-live="polite">
                  {`${completedCount} of ${totalStages} stages complete.`}
                </p>
                {allDone ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="cl-pop h-4 w-4 shrink-0" aria-hidden="true" />
                    All stages complete.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-ink-muted">
                    {totalStages === 0
                      ? "This roadmap has no stages."
                      : `Next stage: ${status.currentStage?.title ?? ""}`}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-ink-muted">Check off stages below as you finish them</p>
              </div>
            </div>
          </section>

          {/* Stages timeline */}
          <section aria-labelledby="roadmap-stages-title">
            <h2 id="roadmap-stages-title" className="sr-only">
              Learning stages
            </h2>
            <ol className="space-y-6">
              {roadmap.stages.map((stage, stageIndex) => {
                const stageStatus = status.statuses[stageIndex];
                const look = STATUS[stageStatus];
                const isDone = stageStatus === "completed";
                const isLast = stageIndex === roadmap.stages.length - 1;
                const titleId = `roadmap-stage-${stageIndex}-title`;

                return (
                  <li key={`${stageIndex}-${stage.stageNumber}`} className="relative flex gap-4">
                    {/* Timeline rail (decorative; status is also written in the card) */}
                    <div className="relative hidden shrink-0 sm:block" aria-hidden="true">
                      <div
                        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-pill border-2 font-mono text-sm font-bold tabular-nums ${look.node}`}
                      >
                        {isDone ? <CheckCircle2 className="cl-pop h-5 w-5" /> : <span>{padNumber(stage.stageNumber)}</span>}
                      </div>
                      {!isLast && (
                        <div
                          className={`absolute left-1/2 top-10 -bottom-6 w-0.5 -translate-x-1/2 ${
                            isDone ? "bg-primary/50" : "bg-line"
                          }`}
                        />
                      )}
                    </div>

                    <article
                      className={`cl-card min-w-0 flex-1 p-6 transition-[box-shadow,border-color] duration-300 ${look.card}`}
                      aria-labelledby={titleId}
                    >
                      {/* Stage header */}
                      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-semibold tabular-nums text-ink-muted">
                              Stage {padNumber(stage.stageNumber)}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-semibold ${look.badge}`}>
                              {isDone && <CheckCircle2 className="cl-pop h-3 w-3" aria-hidden="true" />}
                              {look.label}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono font-semibold tabular-nums text-primary">
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              {stage.duration}
                            </span>
                          </div>
                          <h3 id={titleId} className="mt-2 font-display text-lg font-extrabold text-ink">
                            {stage.title}
                          </h3>
                          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                            <span className="font-semibold text-ink">Goal: </span>
                            {stage.goal}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onToggleStage(stage.stageNumber)}
                          className={`cl-btn shrink-0 self-start no-print ${isDone ? "cl-btn-primary" : "cl-btn-secondary"}`}
                        >
                          {isDone ? (
                            <>
                              <CheckCircle2 className="cl-pop h-4 w-4" aria-hidden="true" />
                              <span>Completed</span>
                              <span className="sr-only">
                                {`: stage ${padNumber(stage.stageNumber)}, ${stage.title}. Select to mark as not complete.`}
                              </span>
                            </>
                          ) : (
                            <>
                              <Circle className="h-4 w-4 text-primary" aria-hidden="true" />
                              <span>Mark Complete</span>
                              <span className="sr-only">{`: stage ${padNumber(stage.stageNumber)}, ${stage.title}`}</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Stage body */}
                      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
                        <div className="space-y-5">
                          <div>
                            <h4 className="mb-2.5 text-xs font-bold text-ink">Topics to Master</h4>
                            <ul className="space-y-2">
                              {stage.topics.map((topic, topicIndex) => (
                                <li key={`${topicIndex}-${topic}`} className="flex items-start gap-2 text-sm leading-snug text-ink">
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-primary" aria-hidden="true" />
                                  <span>{topic}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="border-t border-line pt-4">
                            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
                              <Wrench className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                              <span>Suggested Tools</span>
                            </h4>
                            <ul className="flex flex-wrap gap-1.5">
                              {stage.tools.map((tool, toolIndex) => (
                                <li
                                  key={`${toolIndex}-${tool}`}
                                  className="rounded-pill border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink"
                                >
                                  {tool}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div className="lg:border-l lg:border-line lg:pl-6">
                          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold text-ink">
                            <BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                            <span>Beginner Resources</span>
                          </h4>
                          <ul className="divide-y divide-line">
                            {stage.resources.map((res, resIndex) => (
                              <li key={`${resIndex}-${res.title}`} className="py-3 first:pt-0 last:pb-0">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-sm font-semibold text-ink">{res.title}</span>
                                  <span className="shrink-0 whitespace-nowrap rounded-pill bg-lavender-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-primary-deep">
                                    {res.type}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs leading-relaxed text-ink-muted">{res.description}</p>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="lg:border-l lg:border-line lg:pl-6">
                          <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold text-ink">
                            <FolderGit2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                            <span>Hands-On Stage Project</span>
                          </h4>
                          <div className="space-y-3 rounded-control bg-canvas p-4">
                            <p className="text-sm font-bold text-primary-deep">{stage.project.title}</p>
                            <p className="text-xs leading-relaxed text-ink-muted">{stage.project.description}</p>
                            <div className="border-t border-line pt-2">
                              <p className="mb-1.5 text-xs font-semibold text-ink">Deliverables</p>
                              <ul className="space-y-1.5">
                                {stage.project.deliverables.map((del, delIndex) => (
                                  <li key={`${delIndex}-${del}`} className="flex items-start gap-2 text-xs leading-snug text-ink">
                                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                                    <span>{del}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Career launch tip */}
          <section className="cl-cta-panel rounded-card p-6 text-white" aria-labelledby="roadmap-launch-title">
            <div className="flex items-start gap-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-white/15">
                <Lightbulb className="h-5 w-5 text-lavender-soft" aria-hidden="true" />
              </span>
              <div>
                <h2 id="roadmap-launch-title" className="font-display text-base font-bold">
                  Career Launch Advice for {profile.name}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-white/90">{roadmap.careerLaunchTip}</p>
              </div>
            </div>
          </section>
        </div>
      )}
      {/* Announces a finished roadmap to screen readers (empty while loading). */}
      <p className="sr-only" aria-live="polite">
        {!isLoading && roadmap ? `Learning roadmap for ${roadmap.careerTitle} is ready.` : ""}
      </p>
    </div>
  );
}
