import React, { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import SidebarNav from "./components/SidebarNav";
import CareerFinder from "./components/CareerFinder";
import SkillGapAnalyzer from "./components/SkillGapAnalyzer";
import LearningRoadmap from "./components/LearningRoadmap";
import type {
  ActiveTab,
  CareerFinderResponse,
  CareerRecommendation,
  LearningRoadmapData,
  SkillGapAnalysis,
  StudentProfile,
} from "./types/career";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("finder");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [careerResults, setCareerResults] =
    useState<CareerFinderResponse | null>(null);
  const [selectedCareer, setSelectedCareer] =
    useState<CareerRecommendation | null>(null);

  const [skillGapsByCareer, setSkillGapsByCareer] = useState<
    Record<string, SkillGapAnalysis>
  >({});
  const [roadmapsByCareer, setRoadmapsByCareer] = useState<
    Record<string, LearningRoadmapData>
  >({});

  const [loadingCareers, setLoadingCareers] = useState(false);
  const [loadingSkillGap, setLoadingSkillGap] = useState(false);
  const [loadingRoadmap, setLoadingRoadmap] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFindCareers = async (newProfile: StudentProfile) => {
    setErrorMessage(null);
    setLoadingCareers(true);
    setProfile(newProfile);

    try {
      const response = await fetch("/api/careers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProfile),
      });

      const payload = (await response.json()) as {
        data?: CareerFinderResponse;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error || "Failed to generate career recommendations."
        );
      }

      setCareerResults(payload.data);
      setSelectedCareer(payload.data.careers[0] ?? null);
      setSkillGapsByCareer({});
      setRoadmapsByCareer({});
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoadingCareers(false);
    }
  };

  const handleAnalyzeSkillGap = async (
    career: CareerRecommendation,
    forceRefresh = false
  ) => {
    if (!profile) return;

    setErrorMessage(null);
    setSelectedCareer(career);
    setActiveTab("skill-gap");

    if (!forceRefresh && skillGapsByCareer[career.title]) {
      return;
    }

    setLoadingSkillGap(true);
    try {
      const response = await fetch("/api/skill-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, career }),
      });

      const payload = (await response.json()) as {
        data?: SkillGapAnalysis;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error || "Failed to analyze skill gap for this career."
        );
      }

      setSkillGapsByCareer((prev) => ({
        ...prev,
        [career.title]: payload.data!,
      }));
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to analyze skill gap."
      );
    } finally {
      setLoadingSkillGap(false);
    }
  };

  const handleGenerateRoadmap = async (
    career: CareerRecommendation,
    forceRefresh = false
  ) => {
    if (!profile) return;

    setErrorMessage(null);
    setSelectedCareer(career);
    setActiveTab("roadmap");

    if (!forceRefresh && roadmapsByCareer[career.title]) {
      return;
    }

    setLoadingRoadmap(true);
    try {
      const existingGap = skillGapsByCareer[career.title] ?? null;
      const response = await fetch("/api/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          career,
          skillGap: existingGap,
        }),
      });

      const payload = (await response.json()) as {
        data?: LearningRoadmapData;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error || "Failed to generate your learning roadmap."
        );
      }

      setRoadmapsByCareer((prev) => ({
        ...prev,
        [career.title]: payload.data!,
      }));
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to generate roadmap."
      );
    } finally {
      setLoadingRoadmap(false);
    }
  };

  const handleTabChange = (tab: ActiveTab) => {
    setErrorMessage(null);
    setActiveTab(tab);

    if (
      tab === "skill-gap" &&
      selectedCareer &&
      !skillGapsByCareer[selectedCareer.title] &&
      !loadingSkillGap
    ) {
      void handleAnalyzeSkillGap(selectedCareer);
    } else if (
      tab === "roadmap" &&
      selectedCareer &&
      !roadmapsByCareer[selectedCareer.title] &&
      !loadingRoadmap
    ) {
      void handleGenerateRoadmap(selectedCareer);
    }
  };

  const handleReset = () => {
    setProfile(null);
    setCareerResults(null);
    setSelectedCareer(null);
    setSkillGapsByCareer({});
    setRoadmapsByCareer({});
    setErrorMessage(null);
    setActiveTab("finder");
  };

  const currentSkillGap = selectedCareer
    ? skillGapsByCareer[selectedCareer.title] ?? null
    : null;
  const currentRoadmap = selectedCareer
    ? roadmapsByCareer[selectedCareer.title] ?? null
    : null;

  const sectionLabel =
    activeTab === "finder"
      ? "Career Finder"
      : activeTab === "skill-gap"
      ? "Skill Gap Analyzer"
      : "Learning Roadmap";

  return (
    <div className="min-h-screen bg-white">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={handleTabChange}
        profile={profile}
        hasCareers={Boolean(careerResults)}
        selectedCareer={selectedCareer}
        hasSkillGap={Boolean(currentSkillGap)}
        hasRoadmap={Boolean(currentRoadmap)}
        onReset={handleReset}
      />

      <div className="lg:pl-[272px]">
        {/* Desktop Breadcrumb Bar */}
        <div className="hidden lg:flex items-center justify-between h-15 px-10 border-b border-[#E8E1F8] bg-white no-print">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="font-semibold text-[#18132A]">CareerLens AI</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#5B21B6] font-semibold">{sectionLabel}</span>
            {selectedCareer && activeTab !== "finder" && (
              <>
                <span aria-hidden="true">/</span>
                <span className="text-slate-700 truncate max-w-xs">
                  {selectedCareer.title}
                </span>
              </>
            )}
          </div>
          <div className="text-xs text-slate-500 whitespace-nowrap">
            Discover Your Career. Build Your Future.
          </div>
        </div>

        <main className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
          {/* Global Error Alert */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Unable to complete request: </span>
                  <span>{errorMessage}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                aria-label="Dismiss error"
                className="rounded-lg p-1 text-red-600 hover:bg-red-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {activeTab === "finder" && (
            <CareerFinder
              initialProfile={profile}
              careerResults={careerResults}
              isLoading={loadingCareers}
              onSubmitProfile={handleFindCareers}
              onSelectForSkillGap={(career) =>
                void handleAnalyzeSkillGap(career)
              }
              onSelectForRoadmap={(career) =>
                void handleGenerateRoadmap(career)
              }
            />
          )}

          {activeTab === "skill-gap" && (
            <SkillGapAnalyzer
              profile={profile}
              careers={careerResults?.careers ?? []}
              selectedCareer={selectedCareer}
              analysis={currentSkillGap}
              isLoading={loadingSkillGap}
              onSelectCareer={(career, refresh) =>
                void handleAnalyzeSkillGap(career, refresh)
              }
              onGoToRoadmap={() => {
                if (selectedCareer) {
                  void handleGenerateRoadmap(selectedCareer);
                }
              }}
              onGoToFinder={() => setActiveTab("finder")}
            />
          )}

          {activeTab === "roadmap" && (
            <LearningRoadmap
              profile={profile}
              careers={careerResults?.careers ?? []}
              selectedCareer={selectedCareer}
              roadmap={currentRoadmap}
              isLoading={loadingRoadmap}
              onSelectCareerForRoadmap={(career, refresh) =>
                void handleGenerateRoadmap(career, refresh)
              }
              onGoToFinder={() => setActiveTab("finder")}
            />
          )}
        </main>
      </div>
    </div>
  );
}
