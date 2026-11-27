import React, { useEffect, useReducer, useRef, useState } from "react";
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
import {
  createRequestCoordinator,
  loadCooldownUntil,
  saveCooldownUntil,
  type RequestCoordinator,
  type RequestOptions,
} from "./lib/requests";
import { clearSession, loadSession, saveSession } from "./lib/session";

const DELIBERATE: RequestOptions = { trigger: "deliberate" };
const DELIBERATE_REFRESH: RequestOptions = { trigger: "deliberate", forceRefresh: true };
const NAVIGATION: RequestOptions = { trigger: "navigation" };

/** Progress keys: "<career title>::<stage number>". */
const stageKey = (careerTitle: string, stageNumber: number) =>
  `${careerTitle}::${stageNumber}`;

function withoutCareerProgress(
  progress: Record<string, true>,
  careerTitle: string
): Record<string, true> {
  const prefix = `${careerTitle}::`;
  return Object.fromEntries(
    Object.entries(progress).filter(([key]) => !key.startsWith(prefix))
  ) as Record<string, true>;
}

export default function App() {
  // F5: restore the previous session (validated) once, on first render.
  const [restored] = useState(() => loadSession());

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    restored?.activeTab ?? "finder"
  );
  const [profile, setProfile] = useState<StudentProfile | null>(
    restored?.profile ?? null
  );
  const [careerResults, setCareerResults] =
    useState<CareerFinderResponse | null>(restored?.careerResults ?? null);
  const [selectedCareer, setSelectedCareer] =
    useState<CareerRecommendation | null>(
      restored?.careerResults.careers.find(
        (c) => c.title === restored.selectedCareerTitle
      ) ?? null
    );

  const [skillGapsByCareer, setSkillGapsByCareer] = useState<
    Record<string, SkillGapAnalysis>
  >(restored?.skillGapsByCareer ?? {});
  const [roadmapsByCareer, setRoadmapsByCareer] = useState<
    Record<string, LearningRoadmapData>
  >(restored?.roadmapsByCareer ?? {});
  // Roadmap progress lives here (not in LearningRoadmap) so it survives tab
  // switches and refreshes.
  const [completedStages, setCompletedStages] = useState<Record<string, true>>(
    restored?.completedStages ?? {}
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // `profile` + `careerResults` always belong together (the committed
  // assessment). A new search is tracked separately until it succeeds.
  const [draftProfile, setDraftProfile] = useState<StudentProfile | null>(null);
  const [searchFailure, setSearchFailure] = useState<{
    profile: StudentProfile;
    message: string;
    retryable: boolean;
  } | null>(null);

  // Latest values for the request coordinator: async request flows read these
  // refs instead of possibly stale render closures.
  const profileRef = useRef<StudentProfile | null>(restored?.profile ?? null);
  const skillGapsRef = useRef<Record<string, SkillGapAnalysis>>(
    restored?.skillGapsByCareer ?? {}
  );
  const roadmapsRef = useRef<Record<string, LearningRoadmapData>>(
    restored?.roadmapsByCareer ?? {}
  );
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const updateProfile = (next: StudentProfile | null) => {
    profileRef.current = next;
    setProfile(next);
  };
  const replaceSkillGaps = (next: Record<string, SkillGapAnalysis>) => {
    skillGapsRef.current = next;
    setSkillGapsByCareer(next);
  };
  const replaceRoadmaps = (next: Record<string, LearningRoadmapData>) => {
    roadmapsRef.current = next;
    setRoadmapsByCareer(next);
  };

  // F1–F3: one coordinator for the whole app (see src/lib/requests.ts).
  const coordinatorRef = useRef<RequestCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createRequestCoordinator({
      getProfile: () => profileRef.current,
      getSkillGap: (title) => skillGapsRef.current[title],
      getRoadmap: (title) => roadmapsRef.current[title],
      commitAssessment: (newProfile, data) => {
        updateProfile(newProfile);
        setCareerResults(data);
        setSelectedCareer(data.careers[0] ?? null);
        replaceSkillGaps({});
        replaceRoadmaps({});
        setCompletedStages({});
        setDraftProfile(null);
        setSearchFailure(null);
      },
      onSearchFailed: (attemptedProfile, message, retryable) =>
        setSearchFailure({ profile: attemptedProfile, message, retryable }),
      setSkillGap: (title, data) =>
        replaceSkillGaps({ ...skillGapsRef.current, [title]: data }),
      setRoadmap: (title, data) => {
        replaceRoadmaps({ ...roadmapsRef.current, [title]: data });
        // A new (e.g. regenerated) roadmap may have different stages.
        setCompletedStages((prev) => withoutCareerProgress(prev, title));
      },
      setError: (message) => setErrorMessage(message),
      onRequestsChanged: () => rerender(),
      onCooldownChanged: (until) => saveCooldownUntil(until),
    }, undefined, { initialCooldownUntil: loadCooldownUntil() });
  }
  const requests = coordinatorRef.current;

  // F4: re-render every 500ms only while a cooldown is active, so the
  // countdown updates; the interval is always cleared.
  const cooldownUntil = requests.cooldownUntil;
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => {
      rerender();
      if (Date.now() >= cooldownUntil) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

  // F5: save the committed assessment whenever it changes; clear it when there
  // is none (e.g. after "New Assessment").
  useEffect(() => {
    if (!profile || !careerResults || !selectedCareer) {
      clearSession();
      return;
    }
    saveSession({
      profile,
      careerResults,
      selectedCareerTitle: selectedCareer.title,
      activeTab,
      skillGapsByCareer,
      roadmapsByCareer,
      completedStages,
    });
  }, [profile, careerResults, selectedCareer, activeTab, skillGapsByCareer, roadmapsByCareer, completedStages]);

  // F5: a request interrupted by the refresh is resumed once, as a first-visit
  // (navigation) load, so F3/F4 rules still apply.
  useEffect(() => {
    if (!restored || !selectedCareer) return;
    if (restored.activeTab === "skill-gap") {
      void requests.analyzeSkillGap(selectedCareer, NAVIGATION);
    } else if (restored.activeTab === "roadmap") {
      void requests.generateRoadmap(selectedCareer, NAVIGATION);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // The new profile is NOT committed here: the previous assessment stays intact
  // until the search succeeds, so old results are never shown with a new profile.
  const handleFindCareers = async (newProfile: StudentProfile) => {
    if (requests.isCoolingDown()) return; // button is disabled; guard anyway
    setErrorMessage(null);
    setSearchFailure(null);
    setDraftProfile(newProfile);
    await requests.findCareers(newProfile);
  };

  const handleRetrySearch = () => {
    if (searchFailure) void handleFindCareers(searchFailure.profile);
  };

  const handleAnalyzeSkillGap = (
    career: CareerRecommendation,
    options: RequestOptions
  ) => {
    if (!profileRef.current) return;

    setErrorMessage(null);
    setSelectedCareer(career);
    setActiveTab("skill-gap");
    void requests.analyzeSkillGap(career, options);
  };

  const handleGenerateRoadmap = (
    career: CareerRecommendation,
    options: RequestOptions
  ) => {
    if (!profileRef.current) return;

    setErrorMessage(null);
    setSelectedCareer(career);
    setActiveTab("roadmap");
    void requests.generateRoadmap(career, options);
  };

  // Tab switching is navigation: it auto-loads only results that were never
  // attempted, and never re-sends a request that just failed (F3).
  const handleTabChange = (tab: ActiveTab) => {
    setErrorMessage(null);
    setActiveTab(tab);

    if (!selectedCareer) return;
    if (tab === "skill-gap") {
      void requests.analyzeSkillGap(selectedCareer, NAVIGATION);
    } else if (tab === "roadmap") {
      void requests.generateRoadmap(selectedCareer, NAVIGATION);
    }
  };

  const handleReset = () => {
    requests.reset();
    clearSession();
    updateProfile(null);
    setDraftProfile(null);
    setSearchFailure(null);
    setCompletedStages({});
    setCareerResults(null);
    setSelectedCareer(null);
    replaceSkillGaps({});
    replaceRoadmaps({});
    setErrorMessage(null);
    setActiveTab("finder");
  };

  const currentSkillGap = selectedCareer
    ? skillGapsByCareer[selectedCareer.title] ?? null
    : null;
  const currentRoadmap = selectedCareer
    ? roadmapsByCareer[selectedCareer.title] ?? null
    : null;

  // Loading/failed state is per career, so one career finishing cannot hide
  // another career's spinner.
  const loadingCareers = requests.isPending("careers");
  const loadingSkillGap = selectedCareer
    ? requests.isPending("skill-gap", selectedCareer.title)
    : false;
  const loadingRoadmap = selectedCareer
    ? requests.isPending("roadmap", selectedCareer.title)
    : false;
  const skillGapFailed = selectedCareer
    ? requests.hasFailed("skill-gap", selectedCareer.title)
    : false;
  const roadmapFailed = selectedCareer
    ? requests.hasFailed("roadmap", selectedCareer.title)
    : false;

  // Completed stage numbers for the selected career's roadmap.
  const currentProgress: Record<number, boolean> = {};
  if (selectedCareer) {
    const prefix = `${selectedCareer.title}::`;
    for (const key of Object.keys(completedStages)) {
      if (key.startsWith(prefix)) currentProgress[Number(key.slice(prefix.length))] = true;
    }
  }
  const handleToggleStage = (stageNumber: number) => {
    if (!selectedCareer) return;
    const key = stageKey(selectedCareer.title, stageNumber);
    setCompletedStages((prev) => {
      if (prev[key]) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: true };
    });
  };

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
              initialProfile={draftProfile ?? profile}
              careerResults={careerResults}
              resultsProfile={profile}
              isLoading={loadingCareers}
              cooldownSeconds={cooldownSeconds}
              searchFailure={
                searchFailure
                  ? { message: searchFailure.message, retryable: searchFailure.retryable }
                  : null
              }
              onRetrySearch={handleRetrySearch}
              onSubmitProfile={handleFindCareers}
              onSelectForSkillGap={(career) =>
                handleAnalyzeSkillGap(career, DELIBERATE)
              }
              onSelectForRoadmap={(career) =>
                handleGenerateRoadmap(career, DELIBERATE)
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
              hasFailed={skillGapFailed}
              cooldownSeconds={cooldownSeconds}
              onSelectCareer={(career, refresh) =>
                handleAnalyzeSkillGap(
                  career,
                  refresh ? DELIBERATE_REFRESH : NAVIGATION
                )
              }
              onGoToRoadmap={() => {
                if (selectedCareer) {
                  handleGenerateRoadmap(selectedCareer, DELIBERATE);
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
              hasFailed={roadmapFailed}
              cooldownSeconds={cooldownSeconds}
              completedStages={currentProgress}
              onToggleStage={handleToggleStage}
              onSelectCareerForRoadmap={(career, refresh) =>
                handleGenerateRoadmap(
                  career,
                  refresh ? DELIBERATE_REFRESH : NAVIGATION
                )
              }
              onGoToFinder={() => setActiveTab("finder")}
            />
          )}
        </main>
      </div>
    </div>
  );
}
