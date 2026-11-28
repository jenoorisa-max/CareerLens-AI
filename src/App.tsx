import React, { useEffect, useReducer, useRef, useState } from "react";
import { AlertTriangle, Home, X } from "lucide-react";
import SidebarNav from "./components/SidebarNav";
import LandingPage from "./components/LandingPage";
import DashboardOverview from "./components/DashboardOverview";
import CareerFinder from "./components/CareerFinder";
import SkillGapAnalyzer from "./components/SkillGapAnalyzer";
import LearningRoadmap from "./components/LearningRoadmap";
import CvAnalyzer from "./features/cv/CvAnalyzer";
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

/** URL hash of the application view; anything else shows the Landing Page. */
const APP_HASH = "#/app";

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

  // CV Analyzer: mounted on first visit and then kept mounted (hidden on other
  // pages), so an uploaded CV and its results survive page switches without
  // ever being written to the saved session.
  const [cvOpened, setCvOpened] = useState(activeTab === "cv");
  useEffect(() => {
    if (activeTab === "cv") setCvOpened(true);
  }, [activeTab]);

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

  // Landing Page vs application. The app lives at "#/app" so a refresh keeps
  // the Dashboard open and the browser Back button returns to the Landing Page.
  const [view, setView] = useState<"landing" | "app">(() =>
    window.location.hash === APP_HASH ? "app" : "landing"
  );
  useEffect(() => {
    const onHashChange = () =>
      setView(window.location.hash === APP_HASH ? "app" : "landing");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // F5: a request interrupted by the refresh is resumed once, as a first-visit
  // (navigation) load, so F3/F4 rules still apply. Intentionally runs only on
  // mount (empty dependency list), and only if the app (not the Landing Page)
  // is what the user is looking at.
  useEffect(() => {
    if (view !== "app" || !restored || !selectedCareer) return;
    if (restored.activeTab === "skill-gap") {
      void requests.analyzeSkillGap(selectedCareer, NAVIGATION);
    } else if (restored.activeTab === "roadmap") {
      void requests.generateRoadmap(selectedCareer, NAVIGATION);
    }
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

  // Opens the application from the Landing Page, through the existing tab
  // navigation (so cached results, F3 failure rules and F4 cooldown apply).
  const openApp = (tab: ActiveTab = activeTab) => {
    if (window.location.hash !== APP_HASH) window.location.hash = APP_HASH;
    setView("app");
    handleTabChange(tab);
    window.scrollTo({ top: 0 });
  };

  const goHome = () => {
    window.history.pushState(null, "", window.location.pathname + window.location.search);
    setView("landing");
    window.scrollTo({ top: 0 });
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
    activeTab === "dashboard"
      ? "Dashboard"
      : activeTab === "finder"
      ? "Career Finder"
      : activeTab === "skill-gap"
      ? "Skill Gap Analyzer"
      : activeTab === "cv"
      ? "CV Analyzer"
      : "Learning Roadmap";

  if (view === "landing") {
    // Get Started: start at Career Finder, or continue where the user left off
    // if an assessment already exists.
    return (
      <LandingPage
        onGetStarted={() => openApp(careerResults ? activeTab : "finder")}
        onOpenFeature={openApp}
      />
    );
  }

  return (
    <div className="min-h-screen cl-app-bg">
      <button
        type="button"
        className="cl-skip-link"
        onClick={() => document.getElementById("main-content")?.focus()}
      >
        Skip to main content
      </button>
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={handleTabChange}
        onGoHome={goHome}
        pageTitle={sectionLabel}
        profile={profile}
        hasCareers={Boolean(careerResults)}
        selectedCareer={selectedCareer}
        hasSkillGap={Boolean(currentSkillGap)}
        hasRoadmap={Boolean(currentRoadmap)}
        onReset={handleReset}
      />

      <div className="lg:pl-[272px]">
        {/* Desktop topbar: page title, selected career, Home control, real profile */}
        <div className="sticky top-0 z-10 hidden h-16 items-center justify-between gap-6 border-b border-line bg-surface/90 px-10 backdrop-blur no-print lg:flex">
          <div className="min-w-0">
            <p id="app-page-title" className="font-display text-lg font-bold text-ink">
              {sectionLabel}
            </p>
            {selectedCareer && (activeTab === "skill-gap" || activeTab === "roadmap") && (
              <p className="truncate text-xs text-ink-muted">{selectedCareer.title}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={goHome}
              className="cl-btn cl-btn-ghost px-3 py-2"
              aria-label="Back to the CareerLens AI home page"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Home
            </button>
            {profile && (
              <div className="flex items-center gap-2.5 border-l border-line pl-4">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-pill bg-lavender-soft font-display text-sm font-bold text-primary-strong"
                  aria-hidden="true"
                >
                  {profile.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="max-w-[12rem] truncate text-sm font-semibold text-ink">{profile.name}</span>
              </div>
            )}
          </div>
        </div>

        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-10 py-6 sm:py-8 focus:outline-none">
          {/* Global Error Alert */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 flex items-start justify-between gap-3 rounded-card border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800"
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
                className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-red-600 hover:bg-red-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {activeTab === "dashboard" && (
            <DashboardOverview
              profile={profile}
              careerResults={careerResults}
              selectedCareer={selectedCareer}
              skillGapsByCareer={skillGapsByCareer}
              roadmapsByCareer={roadmapsByCareer}
              completedStages={completedStages}
              pending={{
                careers: loadingCareers,
                skillGap: loadingSkillGap,
                roadmap: loadingRoadmap,
              }}
              cooldownSeconds={cooldownSeconds}
              onOpenFeature={handleTabChange}
              onSkillGap={(career) => handleAnalyzeSkillGap(career, DELIBERATE)}
              onRoadmap={(career) => handleGenerateRoadmap(career, DELIBERATE)}
            />
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
          {(cvOpened || activeTab === "cv") && (
            <div hidden={activeTab !== "cv"}>
              <CvAnalyzer runShared={requests.runShared} cooldownSeconds={cooldownSeconds} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
