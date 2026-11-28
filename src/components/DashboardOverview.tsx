import React from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Circle,
  Compass,
  Loader2,
  Map,
  Sparkles,
  Target,
} from "lucide-react";
import type {
  ActiveTab,
  CareerFinderResponse,
  CareerRecommendation,
  LearningRoadmapData,
  SkillGapAnalysis,
  StudentProfile,
} from "../types/career";
import { clampPercent } from "../lib/format";
import {
  focusCareer,
  getNextStep,
  journeySteps,
  roadmapProgress,
  type JourneyInput,
} from "../lib/dashboard";

interface DashboardOverviewProps {
  profile: StudentProfile | null;
  careerResults: CareerFinderResponse | null;
  selectedCareer: CareerRecommendation | null;
  skillGapsByCareer: Record<string, SkillGapAnalysis>;
  roadmapsByCareer: Record<string, LearningRoadmapData>;
  completedStages: Record<string, true>;
  /** Requests currently running (for the focus career / career search). */
  pending: { careers: boolean; skillGap: boolean; roadmap: boolean };
  cooldownSeconds: number;
  /** Navigation to a feature (existing tab navigation rules apply). */
  onOpenFeature: (tab: ActiveTab) => void;
  /** Opens or requests a skill gap for a career (existing handler; cached results are reused). */
  onSkillGap: (career: CareerRecommendation) => void;
  /** Opens or requests a roadmap for a career (existing handler; cached results are reused). */
  onRoadmap: (career: CareerRecommendation) => void;
}

const STEP_INFO = {
  finder: { label: "Discover careers", icon: Compass },
  "skill-gap": { label: "Identify skill gaps", icon: BarChart3 },
  roadmap: { label: "Follow your roadmap", icon: Map },
} as const;

const FEATURES: Array<{ tab: ActiveTab; title: string; text: string; icon: typeof Compass }> = [
  { tab: "finder", title: "Career Finder", text: "Get three career paths matched to your profile.", icon: Compass },
  { tab: "skill-gap", title: "Skill Gap Analyzer", text: "See which skills transfer and what to learn next.", icon: BarChart3 },
  { tab: "roadmap", title: "Learning Roadmap", text: "Follow a four-stage plan with resources and projects.", icon: Map },
];

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-pill bg-lavender-soft"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div className="cl-progress-fill h-full rounded-pill bg-primary" style={{ width: `${value}%` }} />
    </div>
  );
}

export default function DashboardOverview(props: DashboardOverviewProps) {
  const { profile, careerResults, pending, cooldownSeconds, onOpenFeature, onSkillGap, onRoadmap } = props;
  const input: JourneyInput = props;
  const career = focusCareer(input);
  const next = getNextStep(input);
  const steps = journeySteps(input);
  const firstName = profile?.name.trim().split(/\s+/)[0];
  const coolingDown = cooldownSeconds > 0;
  const gap = career ? props.skillGapsByCareer[career.title] : undefined;
  const roadmap = career ? props.roadmapsByCareer[career.title] : undefined;
  const progress = career && roadmap ? roadmapProgress(career.title, roadmap, props.completedStages) : null;

  // ----- Next step (only real data) -----
  let nextTitle = "";
  let nextText = "";
  let nextAction: { label: string; onClick: () => void; requestsAI: boolean; busy: boolean } | null = null;
  switch (next.kind) {
    case "find-careers":
      nextTitle = "Start with Career Finder";
      nextText = "Tell CareerLens AI about your studies, skills, interests and goals to get three career paths matched to you.";
      nextAction = { label: "Open Career Finder", onClick: () => onOpenFeature("finder"), requestsAI: false, busy: pending.careers };
      break;
    case "analyze-skill-gap":
      nextTitle = `Analyze your skill gap for ${next.career.title}`;
      nextText = "See which of your skills already transfer to this career and what you should learn first.";
      nextAction = { label: "Analyze skill gap", onClick: () => onSkillGap(next.career), requestsAI: true, busy: pending.skillGap };
      break;
    case "build-roadmap":
      nextTitle = `Build your learning roadmap for ${next.career.title}`;
      nextText = "Turn your skill gap analysis into a four-stage plan with resources and hands-on projects.";
      nextAction = { label: "Build roadmap", onClick: () => onRoadmap(next.career), requestsAI: true, busy: pending.roadmap };
      break;
    case "continue-roadmap":
      nextTitle = `Continue your roadmap: ${next.progress.nextStageTitle}`;
      nextText = `You have completed ${next.progress.completed} of ${next.progress.total} stages for ${next.career.title}.`;
      nextAction = { label: "Continue roadmap", onClick: () => onRoadmap(next.career), requestsAI: false, busy: false };
      break;
    case "roadmap-complete":
      nextTitle = `You completed every stage for ${next.career.title}`;
      nextText = "Great progress. Explore the skill gap and roadmap for another of your recommended careers.";
      nextAction = { label: "View your career matches", onClick: () => onOpenFeature("finder"), requestsAI: false, busy: false };
      break;
  }
  const actionDisabled = Boolean(nextAction && (nextAction.busy || (nextAction.requestsAI && coolingDown)));

  return (
    <div className="cl-stagger space-y-6">
      {/* Welcome */}
      <section className="cl-card cl-card-hero p-6 sm:p-8">
        <p className="cl-eyebrow">Dashboard</p>
        <h1 className="mt-2 text-heading font-bold text-ink">
          {firstName ? `Welcome back, ${firstName}` : "Welcome to CareerLens AI"}
        </h1>
        <p className="mt-2 max-w-reading text-ink-muted">
          {careerResults
            ? "Here is where you are in your career journey and what to do next."
            : "Your career journey has three steps. Start by telling CareerLens AI about yourself."}
        </p>

        {/* Journey stepper (real status) */}
        <ol className="cl-stagger mt-6 grid gap-3 sm:grid-cols-3" aria-label="Career journey">
          {steps.map((step, i) => {
            const { label, icon: Icon } = STEP_INFO[step.key];
            return (
              <li
                key={step.key}
                className={`flex items-center gap-3 rounded-control border p-3 ${
                  step.done ? "border-primary/30 bg-lavender-soft" : "border-line bg-surface"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${
                    step.done ? "bg-primary text-white" : "bg-canvas text-ink-muted"
                  }`}
                >
                  {step.done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-ink-muted">Step {i + 1}</span>
                  <span className="block truncate text-sm font-semibold text-ink">{label}</span>
                </span>
                <span className="sr-only">{step.done ? "(completed)" : "(not started)"}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Next step */}
      <section className="cl-card cl-card-accent p-6 sm:p-8" aria-labelledby="next-step-title">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <span className="cl-icon-tile-solid flex h-11 w-11 shrink-0 items-center justify-center rounded-control">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="cl-eyebrow">Recommended next step</p>
              <h2 id="next-step-title" className="mt-1 text-subheading font-bold text-ink">{nextTitle}</h2>
              <p className="mt-1 text-sm text-ink-muted">{nextText}</p>
            </div>
          </div>
          {nextAction && (
            <button
              type="button"
              onClick={nextAction.onClick}
              disabled={actionDisabled}
              className="cl-btn cl-btn-primary shrink-0 self-start md:self-center"
            >
              {nextAction.busy ? (
                <>
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Working on it…
                </>
              ) : nextAction.requestsAI && coolingDown ? (
                <>Try again in {cooldownSeconds}s</>
              ) : (
                <>
                  {nextAction.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {/* Progress (only when real data exists) */}
      {(gap || progress) && career && (
        <div className="grid gap-6 lg:grid-cols-2">
          {gap && (
            <section className="cl-card p-6" aria-labelledby="skill-progress-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="skill-progress-title" className="font-display text-base font-bold text-ink">Skill readiness</h2>
                <span className="cl-badge max-w-[60%] truncate">{career.title}</span>
              </div>
              <p className="mt-4 font-display text-3xl font-extrabold text-ink">
                {clampPercent(gap.readinessScore)}%
                <span className="ml-2 text-sm font-medium text-ink-muted">ready for this role</span>
              </p>
              <div className="mt-3">
                <ProgressBar value={clampPercent(gap.readinessScore)} label="Skill readiness" />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-ink-muted">Skills you have</dt>
                  <dd className="font-semibold text-ink">{gap.skillsYouHave.length}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Skills to develop</dt>
                  <dd className="font-semibold text-ink">{gap.missingSkills.length}</dd>
                </div>
              </dl>
              {gap.priorities[0] && (
                <p className="mt-4 flex items-start gap-2 rounded-control bg-canvas p-3 text-sm text-ink">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    <span className="font-semibold">Top priority:</span> {gap.priorities[0].skill}
                  </span>
                </p>
              )}
            </section>
          )}
          {progress && roadmap && (
            <section className="cl-card p-6" aria-labelledby="roadmap-progress-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="roadmap-progress-title" className="font-display text-base font-bold text-ink">Roadmap progress</h2>
                <span className="text-xs font-medium text-ink-muted">{roadmap.totalDuration}</span>
              </div>
              <p className="mt-4 font-display text-3xl font-extrabold text-ink">
                {progress.completed}/{progress.total}
                <span className="ml-2 text-sm font-medium text-ink-muted">stages completed</span>
              </p>
              <div className="mt-3">
                <ProgressBar
                  value={progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}
                  label="Roadmap progress"
                />
              </div>
              <p className="mt-5 text-sm text-ink-muted">
                {progress.nextStageTitle ? (
                  <>
                    Next stage: <span className="font-semibold text-ink">{progress.nextStageTitle}</span>
                  </>
                ) : (
                  "All stages completed."
                )}
              </p>
            </section>
          )}
        </div>
      )}

      {/* Assessment summary (only when a real assessment exists) */}
      {careerResults && (
        <section className="cl-card p-6 sm:p-8" aria-labelledby="assessment-title">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="assessment-title" className="font-display text-lg font-bold text-ink">Your career matches</h2>
              {profile && (
                <p className="text-sm text-ink-muted">
                  For {profile.name} · {profile.educationLevel} · {profile.fieldOfStudy}
                </p>
              )}
            </div>
          </div>
          <ul className="mt-5 divide-y divide-line">
            {careerResults.careers.map((c, index) => {
              const hasGap = Boolean(props.skillGapsByCareer[c.title]);
              const rm = props.roadmapsByCareer[c.title];
              const rp = rm ? roadmapProgress(c.title, rm, props.completedStages) : null;
              const isFocus = career?.title === c.title;
              return (
                <li key={`${index}-${c.title}`} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{c.title}</span>
                      <span className="text-xs font-semibold text-primary">{clampPercent(c.matchScore)}% fit</span>
                      {isFocus && <span className="cl-badge">Current focus</span>}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {hasGap ? "Skill gap analyzed" : "Skill gap not analyzed yet"} ·{" "}
                      {rp ? `Roadmap ${rp.completed}/${rp.total} stages` : "No roadmap yet"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSkillGap(c)}
                      disabled={!hasGap && coolingDown}
                      className="cl-btn cl-btn-secondary px-3.5 py-2 text-xs"
                    >
                      {hasGap ? "View skill gap" : "Analyze skill gap"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRoadmap(c)}
                      disabled={!rm && coolingDown}
                      className="cl-btn cl-btn-secondary px-3.5 py-2 text-xs"
                    >
                      {rm ? "View roadmap" : "Build roadmap"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Quick access */}
      <section aria-labelledby="quick-access-title">
        <h2 id="quick-access-title" className="font-display text-base font-bold text-ink">Quick access</h2>
        <ul className="cl-stagger mt-3 grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ tab, title, text, icon: Icon }) => (
            <li key={tab}>
              <button
                type="button"
                onClick={() => onOpenFeature(tab)}
                className="cl-card cl-card-interactive group flex h-full w-full flex-col items-start p-5 text-left"
              >
                <span className="cl-icon-tile flex h-10 w-10 items-center justify-center rounded-control">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="mt-4 font-display text-base font-bold text-ink">{title}</span>
                <span className="mt-1 text-sm text-ink-muted">{text}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {!careerResults && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Circle className="h-3 w-3" aria-hidden="true" />
          Your progress and results will appear here after you complete Career Finder.
        </p>
      )}
    </div>
  );
}
