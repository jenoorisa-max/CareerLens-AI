import React, { useState } from "react";
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
} from "lucide-react";
import type {
  CareerRecommendation,
  LearningRoadmapData,
  StudentProfile,
} from "../types/career";
import { padNumber } from "../lib/format";

interface LearningRoadmapProps {
  profile: StudentProfile | null;
  careers: CareerRecommendation[];
  selectedCareer: CareerRecommendation | null;
  roadmap: LearningRoadmapData | null;
  isLoading: boolean;
  onSelectCareerForRoadmap: (
    career: CareerRecommendation,
    forceRefresh?: boolean
  ) => void;
  onGoToFinder: () => void;
}

export default function LearningRoadmap({
  profile,
  careers,
  selectedCareer,
  roadmap,
  isLoading,
  onSelectCareerForRoadmap,
  onGoToFinder,
}: LearningRoadmapProps) {
  const [completedStages, setCompletedStages] = useState<
    Record<string, boolean>
  >({});

  if (!profile || careers.length === 0) {
    return (
      <div className="rounded-2xl border border-[#E8E1F8] bg-white p-10 text-center max-w-xl mx-auto mt-6 animate-enter">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F3EEFF] text-[#5B21B6] mb-4">
          <Compass className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-[#18132A]">
          Start with Career Finder
        </h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Complete your profile in Career Finder first to generate a tailored
          learning roadmap with beginner-friendly stages, tools, resources, and
          portfolio projects.
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

  const toggleStage = (careerTitle: string, stageNum: number) => {
    const key = `${careerTitle}::${stageNum}`;
    setCompletedStages((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCount = roadmap
    ? roadmap.stages.filter(
        (s) => completedStages[`${roadmap.careerTitle}::${s.stageNumber}`]
      ).length
    : 0;
  const totalStages = roadmap?.stages.length ?? 0;
  const progressPercent =
    totalStages > 0 ? Math.round((completedCount / totalStages) * 100) : 0;

  return (
    <div className="space-y-6 animate-enter">
      {/* Header & Career Switcher */}
      <section className="rounded-2xl border border-[#E8E1F8] bg-white p-6 no-print">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#5B21B6]">
              03 · Personalized Learning Roadmap
            </p>
            <h1 className="text-2xl font-extrabold text-[#18132A] mt-1">
              Your Beginner-Friendly Action Plan
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Progressive stages, tools, curated resources, and hands-on
              projects tailored to your background.
            </p>
          </div>

          {selectedCareer && (
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => onSelectCareerForRoadmap(selectedCareer, true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#DDD3F6] bg-[#FAF8FF] px-3.5 py-2 text-xs font-semibold text-[#4C1D95] hover:bg-[#F3EEFF] transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
                />
                Regenerate
              </button>
              {roadmap && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E1F8] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#FAF8FF] transition-colors whitespace-nowrap"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Plan
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 inline-flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-[#FAF8FF] border border-[#E8E1F8]">
          {careers.map((career, index) => {
            const isSelected = selectedCareer?.title === career.title;
            return (
              <button
                key={`${index}-${career.id || career.title}`}
                type="button"
                disabled={isLoading}
                onClick={() => onSelectCareerForRoadmap(career)}
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
            Building your personalized roadmap for {selectedCareer?.title}...
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Organizing learning stages, tools, beginner resources, and hands-on
            projects.
          </p>
        </div>
      )}

      {/* Roadmap Content */}
      {!isLoading && roadmap && (
        <div className="space-y-6 animate-enter">
          {/* Overview & Progress */}
          <section className="rounded-2xl border border-[#E8E1F8] bg-[#FAF8FF] p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#5B21B6]">
                  <span>{roadmap.careerTitle}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-600">
                    <Clock className="h-3.5 w-3.5 text-[#5B21B6]" />
                    {roadmap.totalDuration}
                  </span>
                </div>
                <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
                  {roadmap.overview}
                </p>
              </div>

              <div className="shrink-0 min-w-[220px] lg:pl-6 lg:border-l lg:border-[#E8E1F8] no-print">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>Roadmap Progress</span>
                  <span className="font-mono tabular-nums text-[#5B21B6] font-bold">
                    {completedCount}/{totalStages} Stages
                  </span>
                </div>
                <div className="mt-2.5 h-2.5 w-full rounded-full bg-[#E8E1F8] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#5B21B6] transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Check off stages below as you finish them
                </p>
              </div>
            </div>
          </section>

          {/* Stages */}
          <div className="space-y-6">
            {roadmap.stages.map((stage, stageIndex) => {
              const stageKey = `${roadmap.careerTitle}::${stage.stageNumber}`;
              const isDone = Boolean(completedStages[stageKey]);

              return (
                <article
                  key={`${stageIndex}-${stage.stageNumber}`}
                  className={`rounded-2xl border bg-white p-6 transition-colors ${
                    isDone ? "border-[#5B21B6]/50" : "border-[#E8E1F8]"
                  }`}
                >
                  {/* Stage Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#EFEAF9]">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4C1D95] text-sm font-mono tabular-nums font-bold text-white">
                        {padNumber(stage.stageNumber)}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-baseline gap-2.5">
                          <h2 className="text-lg font-extrabold text-[#18132A]">
                            {stage.title}
                          </h2>
                          <span className="text-xs font-mono tabular-nums font-semibold text-[#5B21B6]">
                            {stage.duration}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {stage.goal}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        toggleStage(roadmap.careerTitle, stage.stageNumber)
                      }
                      className={`self-start sm:self-center inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 no-print ${
                        isDone
                          ? "bg-[#5B21B6] text-white"
                          : "border border-[#DDD3F6] bg-[#FAF8FF] text-[#4C1D95] hover:bg-[#F3EEFF]"
                      }`}
                    >
                      {isDone ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Completed</span>
                        </>
                      ) : (
                        <>
                          <Circle className="h-4 w-4" />
                          <span>Mark Complete</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Stage Body */}
                  <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Topics & Tools */}
                    <div className="space-y-5">
                      <div>
                        <h3 className="text-xs font-bold text-[#18132A] mb-2.5">
                          Topics to Master
                        </h3>
                        <ul className="space-y-2">
                          {stage.topics.map((topic, topicIndex) => (
                            <li
                              key={`${topicIndex}-${topic}`}
                              className="flex items-start gap-2 text-sm text-slate-700 leading-snug"
                            >
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#5B21B6] shrink-0" />
                              <span>{topic}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="pt-4 border-t border-[#EFEAF9]">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold text-[#18132A] mb-2">
                          <Wrench className="h-3.5 w-3.5 text-[#5B21B6]" />
                          <span>Suggested Tools</span>
                        </h3>
                        <p className="text-xs font-medium text-slate-700 leading-relaxed">
                          {stage.tools.join(" · ")}
                        </p>
                      </div>
                    </div>

                    {/* Resources */}
                    <div className="lg:border-l lg:border-[#EFEAF9] lg:pl-6">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold text-[#18132A] mb-3">
                        <BookOpen className="h-3.5 w-3.5 text-[#5B21B6]" />
                        <span>Beginner Resources</span>
                      </h3>
                      <div className="divide-y divide-[#EFEAF9]">
                        {stage.resources.map((res, resIndex) => (
                          <div
                            key={`${resIndex}-${res.title}`}
                            className="py-3 first:pt-0 last:pb-0"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-bold text-[#18132A]">
                                {res.title}
                              </span>
                              <span className="text-[11px] font-semibold text-[#5B21B6] whitespace-nowrap shrink-0">
                                {res.type}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                              {res.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Hands-On Stage Project */}
                    <div className="lg:border-l lg:border-[#EFEAF9] lg:pl-6">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold text-[#18132A] mb-3">
                        <FolderGit2 className="h-3.5 w-3.5 text-[#5B21B6]" />
                        <span>Hands-On Stage Project</span>
                      </h3>
                      <div className="rounded-xl bg-[#FAF8FF] p-4 space-y-3">
                        <div className="text-sm font-bold text-[#4C1D95]">
                          {stage.project.title}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {stage.project.description}
                        </p>
                        <div className="pt-2 border-t border-[#E8E1F8]">
                          <div className="text-xs font-semibold text-[#18132A] mb-1.5">
                            Deliverables
                          </div>
                          <ul className="space-y-1.5">
                            {stage.project.deliverables.map((del, delIndex) => (
                              <li
                                key={`${delIndex}-${del}`}
                                className="flex items-start gap-2 text-xs text-slate-700 leading-snug"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-[#5B21B6] shrink-0 mt-0.5" />
                                <span>{del}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Career Launch Tip */}
          <section className="rounded-2xl bg-[#4C1D95] text-white p-6">
            <div className="flex items-start gap-3.5">
              <Lightbulb className="h-5 w-5 text-[#DDD6FE] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold">
                  Career Launch Advice for {profile.name}
                </h2>
                <p className="mt-1 text-sm text-[#EDE9FE] leading-relaxed">
                  {roadmap.careerLaunchTip}
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
