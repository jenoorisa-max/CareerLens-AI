import React from "react";
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Target,
  Compass,
  RefreshCw,
  Clock,
  Map,
  ListChecks,
  Footprints,
} from "lucide-react";
import type {
  CareerRecommendation,
  SkillGapAnalysis,
  StudentProfile,
} from "../types/career";
import { clampPercent, padNumber } from "../lib/format";
import { gapCounts, groupMissingSkills } from "../lib/skillGap";

interface SkillGapAnalyzerProps {
  profile: StudentProfile | null;
  careers: CareerRecommendation[];
  selectedCareer: CareerRecommendation | null;
  analysis: SkillGapAnalysis | null;
  isLoading: boolean;
  /** The last request for the selected career failed (shows a retry hint). */
  hasFailed?: boolean;
  /** Seconds left in the global AI cooldown (0 = none). */
  cooldownSeconds?: number;
  onSelectCareer: (career: CareerRecommendation, forceRefresh?: boolean) => void;
  onGoToRoadmap: () => void;
  onGoToFinder: () => void;
}

// Importance is always shown as text; colour only reinforces it.
const IMPORTANCE_BADGE: Record<string, string> = {
  Essential: "bg-primary text-white",
  Important: "bg-lavender-soft text-primary-deep",
  Helpful: "border border-line bg-canvas text-ink-muted",
};

export default function SkillGapAnalyzer({
  profile,
  careers,
  selectedCareer,
  analysis,
  isLoading,
  hasFailed = false,
  cooldownSeconds = 0,
  onSelectCareer,
  onGoToRoadmap,
  onGoToFinder,
}: SkillGapAnalyzerProps) {
  if (!profile || careers.length === 0) {
    return (
      <section className="cl-card mx-auto mt-6 max-w-xl p-8 text-center sm:p-10 animate-enter">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-lavender-soft text-primary">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="font-display text-xl font-bold text-ink">Complete Career Finder First</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Enter your background in Career Finder so CareerLens AI can identify
          3 matching career paths and evaluate your existing versus missing
          skills.
        </p>
        <button type="button" onClick={onGoToFinder} className="cl-btn cl-btn-primary mt-6">
          <span>Go to Career Finder</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    );
  }

  const readiness = analysis ? clampPercent(analysis.readinessScore) : 0;
  const counts = analysis ? gapCounts(analysis) : null;
  const missingGroups = analysis ? groupMissingSkills(analysis.missingSkills) : [];
  const careerSkills = selectedCareer?.coreSkills ?? [];

  return (
    <div className="space-y-6 animate-enter">
      {/* Header & career switcher */}
      <section className="cl-card cl-card-hero p-6 sm:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <p className="cl-eyebrow">Skill Gap Analyzer</p>
            <h1 className="mt-2 text-heading font-bold text-ink">Skills Readiness &amp; Gap Breakdown</h1>
            <p className="mt-2 text-ink-muted">
              Select a recommended career path to compare your current skills
              against industry expectations.
            </p>
          </div>

          {selectedCareer && (
            <button
              type="button"
              disabled={isLoading || cooldownSeconds > 0}
              onClick={() => onSelectCareer(selectedCareer, true)}
              className="cl-btn cl-btn-secondary shrink-0 self-start"
              aria-label={cooldownSeconds > 0 ? undefined : `Re-analyze skill gap for ${selectedCareer.title}`}
            >
              <RefreshCw
                className={`h-4 w-4 text-primary ${isLoading ? "motion-safe:animate-spin" : ""}`}
                aria-hidden="true"
              />
              {cooldownSeconds > 0 ? `Try again in ${cooldownSeconds}s` : "Re-analyze"}
            </button>
          )}
        </div>

        <div className="mt-6">
          <p id="skill-gap-career-label" className="text-xs font-semibold text-ink-muted">
            Career path
          </p>
          <div
            role="group"
            aria-labelledby="skill-gap-career-label"
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
                  onClick={() => onSelectCareer(career)}
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
                  Analyzing your skill gap for {selectedCareer?.title}...
                </p>
                <p className="text-xs text-ink-muted">
                  Mapping your existing strengths, missing competencies, and top
                  priorities.
                </p>
              </div>
            </div>
            <div className="cl-loading-bar mt-4" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" aria-hidden="true">
            {[1, 2].map((item) => (
              <div key={item} className="cl-card h-56 space-y-4 p-6 motion-safe:animate-pulse">
                <div className="h-4 w-32 rounded-pill bg-lavender-soft" />
                <div className="h-5 w-2/3 rounded-pill bg-lavender-soft" />
                <div className="h-14 w-full rounded-control bg-canvas" />
                <div className="h-14 w-full rounded-control bg-canvas" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Failed: stays until the user deliberately retries */}
      {!isLoading && !analysis && hasFailed && (
        <section role="alert" className="cl-card flex items-start gap-3 border-red-200 p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-red-50 text-red-600">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink">This analysis didn&apos;t complete</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
              {cooldownSeconds > 0
                ? `The AI service is busy. You can try again in ${cooldownSeconds}s.`
                : `Use Re-analyze above to try again for ${selectedCareer?.title ?? "this career"}.`}
            </p>
          </div>
        </section>
      )}

      {/* Nothing requested yet (no career selected) */}
      {!isLoading && !analysis && !hasFailed && !selectedCareer && (
        <section className="cl-card p-6 text-center">
          <p className="text-sm text-ink-muted">Choose a career path above to analyze your skill gap.</p>
        </section>
      )}

      {/* Analysis */}
      {!isLoading && analysis && counts && (
        <div className="cl-stagger space-y-6">
          {/* Readiness summary */}
          <section className="cl-card cl-card-accent p-6 sm:p-8" aria-labelledby="readiness-title">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl space-y-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Target className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Target Role · {analysis.careerTitle}</span>
                </p>
                <h2 id="readiness-title" className="sr-only">
                  Readiness for {analysis.careerTitle}
                </h2>
                <p className="leading-relaxed text-ink">{analysis.readinessSummary}</p>
                <ul className="flex flex-wrap gap-2 pt-1 text-xs font-semibold" aria-label="Analysis summary">
                  <li className="cl-badge bg-emerald-50 text-emerald-700">
                    {counts.have} {counts.have === 1 ? "skill" : "skills"} you have
                  </li>
                  <li className="cl-badge">
                    {counts.missing} to build
                  </li>
                  {counts.essential > 0 && (
                    <li className="cl-badge bg-primary text-white">{counts.essential} essential</li>
                  )}
                </ul>
              </div>

              <div className="shrink-0 md:min-w-[220px] md:border-l md:border-line md:pl-8">
                <div className="font-mono text-4xl font-bold tabular-nums text-primary-deep">
                  <span>{readiness}%</span>
                </div>
                <div className="mt-0.5 text-xs font-semibold text-ink-muted">Current Role Readiness</div>
                <div
                  className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-lavender-soft"
                  role="progressbar"
                  aria-label={`Current role readiness for ${analysis.careerTitle}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={readiness}
                >
                  <div
                    className="cl-progress-fill h-full rounded-pill bg-primary"
                    style={{ width: `${readiness}%` }}
                  />
                </div>
              </div>
            </div>

            {(careerSkills.length > 0 || profile.skills.length > 0) && (
              <div className="mt-6 grid grid-cols-1 gap-4 border-t border-line pt-6 md:grid-cols-2">
                {careerSkills.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-ink">Core skills for {selectedCareer?.title}</h3>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {careerSkills.map((skill, i) => (
                        <li key={`${i}-${skill}`} className="rounded-pill border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink">
                          {skill}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {profile.skills.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-ink">Skills on your profile</h3>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {profile.skills.map((skill, i) => (
                        <li key={`${i}-${skill}`} className="rounded-pill bg-lavender-soft px-2.5 py-0.5 text-xs font-medium text-primary-deep">
                          {skill}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Skills you have vs missing skills */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="cl-card p-6" aria-labelledby="skills-have-title">
              <div className="flex items-start gap-3 border-b border-line pb-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="skills-have-title" className="font-display text-base font-bold text-ink">
                    Skills You Already Have
                  </h2>
                  <p className="text-xs text-ink-muted">Transferable foundations from your profile</p>
                </div>
              </div>

              {analysis.skillsYouHave.length > 0 ? (
                <ul className="divide-y divide-line">
                  {analysis.skillsYouHave.map((item, index) => (
                    <li key={`${index}-${item.skill}`} className="py-4 last:pb-0">
                      <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                        <span>{item.skill}</span>
                      </h3>
                      <p className="mt-1 pl-6 text-sm leading-relaxed text-ink-muted">{item.howItTransfers}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pt-4 text-sm text-ink-muted">
                  You are starting fresh in this domain—your learning roadmap
                  will build core fundamentals step by step.
                </p>
              )}
            </section>

            <section className="cl-card p-6" aria-labelledby="skills-missing-title">
              <div className="flex items-start gap-3 border-b border-line pb-4">
                <span className="cl-icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-control">
                  <ListChecks className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="skills-missing-title" className="font-display text-base font-bold text-ink">
                    Missing Skills to Acquire
                  </h2>
                  <p className="text-xs text-ink-muted">Competencies needed for entry-level readiness</p>
                </div>
              </div>

              {missingGroups.length > 0 ? (
                <div className="space-y-5 pt-4">
                  {missingGroups.map((group) => (
                    <div key={group.importance || "unlabelled"}>
                      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
                        <span>{group.importance || "Other"}</span>
                        <span className="font-mono tabular-nums">· {group.items.length}</span>
                      </h3>
                      <ul className="mt-2 space-y-2">
                        {group.items.map((item, index) => (
                          <li key={`${index}-${item.skill}`} className="rounded-control border border-line bg-canvas p-3.5">
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-sm font-bold text-ink">{item.skill}</span>
                              <span
                                className={`shrink-0 whitespace-nowrap rounded-pill px-2 py-0.5 text-[0.6875rem] font-semibold ${
                                  IMPORTANCE_BADGE[item.importance] ?? IMPORTANCE_BADGE.Helpful
                                }`}
                              >
                                {item.importance}
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.whyItMatters}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pt-4 text-sm text-ink-muted">No missing skills were returned for this role.</p>
              )}
            </section>
          </div>

          {/* Priorities */}
          <section className="cl-card p-6 sm:p-8" aria-labelledby="priorities-title">
            <div className="border-b border-line pb-4">
              <h2 id="priorities-title" className="font-display text-lg font-bold text-ink">
                What to Prioritize First
              </h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                Sequenced for momentum based on your background and target role
              </p>
            </div>

            <ol className="divide-y divide-line">
              {analysis.priorities.map((step, index) => (
                <li key={`${index}-${step.skill}`} className="grid grid-cols-1 items-start gap-4 py-5 md:grid-cols-12">
                  <div className="flex items-start gap-3 md:col-span-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-lavender-soft font-mono text-xs font-bold tabular-nums text-primary-strong">
                      <span className="sr-only">Priority </span>
                      <span>{padNumber(step.rank)}</span>
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-ink">{step.skill}</h3>
                      <p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-ink-muted">
                        <Clock className="h-3 w-3 text-primary" aria-hidden="true" />
                        <span>{step.timeframe}</span>
                      </p>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-ink-muted md:col-span-4">{step.reason}</p>

                  <p className="flex items-start gap-2 rounded-control bg-canvas px-3.5 py-2.5 text-sm leading-relaxed text-ink md:col-span-4">
                    <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <span className="font-semibold text-primary-deep">First step: </span>
                      {step.actionTip}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {/* Next step */}
          <section
            className="cl-card cl-card-tint flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
            aria-labelledby="skill-gap-next-title"
          >
            <div>
              <h2 id="skill-gap-next-title" className="font-display text-base font-bold text-ink">
                Next: your learning roadmap
              </h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                Turn these priorities into a structured, stage-by-stage learning
                plan.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row-reverse sm:items-center">
              <button type="button" onClick={onGoToRoadmap} className="cl-btn cl-btn-primary">
                <Map className="h-4 w-4" aria-hidden="true" />
                <span>Generate Learning Roadmap</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={onGoToFinder} className="cl-btn cl-btn-ghost">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Back to Career Finder</span>
              </button>
            </div>
          </section>
        </div>
      )}
      {/* Announces a finished analysis to screen readers (empty while loading). */}
      <p className="sr-only" aria-live="polite">
        {!isLoading && analysis ? `Skill gap analysis for ${analysis.careerTitle} is ready.` : ""}
      </p>
    </div>
  );
}
