import React from "react";
import {
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  Target,
  Compass,
  RefreshCw,
  Clock,
  Map,
} from "lucide-react";
import type {
  CareerRecommendation,
  SkillGapAnalysis,
  StudentProfile,
} from "../types/career";
import { clampPercent, padNumber } from "../lib/format";

interface SkillGapAnalyzerProps {
  profile: StudentProfile | null;
  careers: CareerRecommendation[];
  selectedCareer: CareerRecommendation | null;
  analysis: SkillGapAnalysis | null;
  isLoading: boolean;
  /** The last request for the selected career failed (shows a retry hint). */
  hasFailed?: boolean;
  onSelectCareer: (career: CareerRecommendation, forceRefresh?: boolean) => void;
  onGoToRoadmap: () => void;
  onGoToFinder: () => void;
}

export default function SkillGapAnalyzer({
  profile,
  careers,
  selectedCareer,
  analysis,
  isLoading,
  hasFailed = false,
  onSelectCareer,
  onGoToRoadmap,
  onGoToFinder,
}: SkillGapAnalyzerProps) {
  if (!profile || careers.length === 0) {
    return (
      <div className="rounded-2xl border border-[#E8E1F8] bg-white p-10 text-center max-w-xl mx-auto mt-6 animate-enter">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F3EEFF] text-[#5B21B6] mb-4">
          <Compass className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-[#18132A]">
          Complete Career Finder First
        </h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Enter your background in Career Finder so CareerLens AI can identify
          3 matching career paths and evaluate your existing versus missing
          skills.
        </p>
        <button
          type="button"
          onClick={onGoToFinder}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#5B21B6] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4C1D95] transition-colors whitespace-nowrap"
        >
          <span>Go to Career Finder</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-enter">
      {/* Header & Career Switcher */}
      <section className="rounded-2xl border border-[#E8E1F8] bg-white p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#5B21B6]">
              02 · Skill Gap Analyzer
            </p>
            <h1 className="text-2xl font-extrabold text-[#18132A] mt-1">
              Skills Readiness &amp; Gap Breakdown
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Select a recommended career path to compare your current skills
              against industry expectations.
            </p>
          </div>

          {selectedCareer && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onSelectCareer(selectedCareer, true)}
              className="self-start inline-flex items-center gap-2 rounded-xl border border-[#DDD3F6] bg-[#FAF8FF] px-4 py-2 text-xs font-semibold text-[#4C1D95] hover:bg-[#F3EEFF] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
              Re-analyze
            </button>
          )}
        </div>

        {/* Career Tabs */}
        <div className="mt-5 inline-flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-[#FAF8FF] border border-[#E8E1F8]">
          {careers.map((career, index) => {
            const isSelected = selectedCareer?.title === career.title;
            return (
              <button
                key={`${index}-${career.id || career.title}`}
                type="button"
                disabled={isLoading}
                onClick={() => onSelectCareer(career)}
                className={`rounded-lg px-4 py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                  isSelected
                    ? "bg-[#5B21B6] text-white"
                    : "text-slate-600 hover:bg-white hover:text-[#4C1D95]"
                }`}
              >
                {career.title}
              </button>
            );
          })}
        </div>
      </section>

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-2xl border border-[#E8E1F8] bg-white p-10 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#5B21B6] mx-auto" />
          <h3 className="mt-4 text-base font-bold text-[#18132A]">
            Analyzing your skill gap for {selectedCareer?.title}...
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Mapping your existing strengths, missing competencies, and top
            priorities.
          </p>
        </div>
      )}

      {/* Failed State: stays until the user deliberately retries */}
      {!isLoading && !analysis && hasFailed && (
        <div className="rounded-2xl border border-[#E8E1F8] bg-white p-10 text-center">
          <AlertCircle className="h-7 w-7 text-[#5B21B6] mx-auto" />
          <h3 className="mt-4 text-base font-bold text-[#18132A]">
            This analysis didn&apos;t complete
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Use Re-analyze above to try again for {selectedCareer?.title}.
          </p>
        </div>
      )}

      {/* Analysis Output */}
      {!isLoading && analysis && (
        <div className="space-y-6 animate-enter">
          {/* Readiness Summary */}
          <section className="rounded-2xl border border-[#E8E1F8] bg-[#FAF8FF] p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#5B21B6]">
                  <Target className="h-4 w-4 shrink-0" />
                  <span>Target Role · {analysis.careerTitle}</span>
                </div>
                <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                  {analysis.readinessSummary}
                </p>
              </div>

              <div className="shrink-0 min-w-[200px] md:pl-6 md:border-l md:border-[#E8E1F8]">
                <div className="text-3xl font-extrabold font-mono tabular-nums text-[#4C1D95]">
                  {clampPercent(analysis.readinessScore)}%
                </div>
                <div className="text-xs font-semibold text-slate-500 mt-0.5">
                  Current Role Readiness
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-[#E8E1F8] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#5B21B6] transition-all duration-300"
                    style={{ width: `${clampPercent(analysis.readinessScore)}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Two-Column Breakdown: Skills You Have vs Missing Skills (Hairline Lists, No Nested Cards) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Existing Skills */}
            <section className="rounded-2xl border border-[#E8E1F8] bg-white p-6">
              <div className="flex items-center gap-2.5 pb-4 border-b border-[#EFEAF9]">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <h2 className="text-base font-bold text-[#18132A]">
                    Skills You Already Have
                  </h2>
                  <p className="text-xs text-slate-500">
                    Transferable foundations from your profile
                  </p>
                </div>
              </div>

              <div className="divide-y divide-[#EFEAF9]">
                {analysis.skillsYouHave.length > 0 ? (
                  analysis.skillsYouHave.map((item, index) => (
                    <div key={`${index}-${item.skill}`} className="py-4 first:pt-4 last:pb-1">
                      <div className="flex items-center gap-2 text-sm font-bold text-[#18132A]">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>{item.skill}</span>
                      </div>
                      <p className="mt-1 pl-6 text-xs text-slate-600 leading-relaxed">
                        {item.howItTransfers}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-sm text-slate-500">
                    You are starting fresh in this domain—your learning roadmap
                    will build core fundamentals step by step.
                  </p>
                )}
              </div>
            </section>

            {/* Missing Skills */}
            <section className="rounded-2xl border border-[#E8E1F8] bg-white p-6">
              <div className="flex items-center gap-2.5 pb-4 border-b border-[#EFEAF9]">
                <AlertCircle className="h-5 w-5 text-[#5B21B6] shrink-0" />
                <div>
                  <h2 className="text-base font-bold text-[#18132A]">
                    Missing Skills to Acquire
                  </h2>
                  <p className="text-xs text-slate-500">
                    Competencies needed for entry-level readiness
                  </p>
                </div>
              </div>

              <div className="divide-y divide-[#EFEAF9]">
                {analysis.missingSkills.map((item, index) => (
                  <div key={`${index}-${item.skill}`} className="py-4 first:pt-4 last:pb-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-bold text-[#18132A]">
                        {item.skill}
                      </span>
                      <span
                        className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                          item.importance === "Essential"
                            ? "text-[#5B21B6]"
                            : item.importance === "Important"
                            ? "text-slate-700"
                            : "text-slate-500"
                        }`}
                      >
                        {item.importance}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                      {item.whyItMatters}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Priorities Sequence */}
          <section className="rounded-2xl border border-[#E8E1F8] bg-white p-6">
            <div className="pb-4 border-b border-[#EFEAF9]">
              <h2 className="text-lg font-bold text-[#18132A]">
                What to Prioritize First
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Sequenced for momentum based on your background and target role
              </p>
            </div>

            <div className="divide-y divide-[#EFEAF9]">
              {analysis.priorities.map((step, index) => (
                <div
                  key={`${index}-${step.skill}`}
                  className="py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-start"
                >
                  <div className="md:col-span-4 flex items-start gap-3">
                    <span className="font-mono tabular-nums text-sm font-bold text-[#5B21B6] pt-0.5">
                      {padNumber(step.rank)}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-[#18132A]">
                        {step.skill}
                      </div>
                      <div className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-slate-500">
                        <Clock className="h-3 w-3 text-[#5B21B6]" />
                        <span>{step.timeframe}</span>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-4 text-xs text-slate-600 leading-relaxed">
                    {step.reason}
                  </div>

                  <div className="md:col-span-4 text-xs text-slate-700 leading-relaxed bg-[#FAF8FF] rounded-xl px-3.5 py-2.5">
                    <span className="font-semibold text-[#4C1D95]">
                      First step:{" "}
                    </span>
                    {step.actionTip}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 pt-5 border-t border-[#EFEAF9] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs text-slate-600">
                Turn these priorities into a structured, stage-by-stage learning
                plan.
              </p>
              <button
                type="button"
                onClick={onGoToRoadmap}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5B21B6] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4C1D95] transition-colors whitespace-nowrap shrink-0"
              >
                <Map className="h-4 w-4" />
                <span>Generate Learning Roadmap</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
