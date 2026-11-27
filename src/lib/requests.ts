// Request coordination for the three AI features (Phase 0 Step D2).
//
// - F1: one in-flight request per (session, feature, career). Repeated calls
//   reuse the running promise instead of sending another Gemini request.
// - F2: a roadmap waits for the same career's in-flight skill gap and uses its
//   result as context. It never starts a skill-gap request itself.
// - F3: a request that just failed is not retried by navigation (tab or career
//   switching). Deliberate actions (buttons) always retry.
//
// Every key includes the session id. A session is one assessment: a profile
// together with the career results generated for it. A new session starts when
// a career search SUCCEEDS (the new profile and careers are committed together)
// or on "New Assessment". Older promises are never reused, and their results
// are ignored. While a new search runs, or if it fails, the previous assessment
// stays intact and is never mixed with the new profile.
// Framework-free so the exact logic App.tsx runs can be unit-tested.
import { postJSON, type ApiResult } from "./api";
import type {
  CareerFinderResponse,
  CareerRecommendation,
  LearningRoadmapData,
  SkillGapAnalysis,
  StudentProfile,
} from "../types/career";

export type RequestFeature = "careers" | "skill-gap" | "roadmap";

/** "deliberate" = a button the user pressed; "navigation" = tab/career switching. */
export type RequestTrigger = "deliberate" | "navigation";

export interface RequestOptions {
  forceRefresh?: boolean;
  trigger: RequestTrigger;
}

/** JSON encoding avoids collisions between career titles containing separators. */
export function requestKey(sessionId: number, feature: RequestFeature, careerTitle = ""): string {
  return JSON.stringify([sessionId, feature, careerTitle]);
}

/**
 * Map of running requests. `run` reuses an existing promise for the same key.
 * An entry is only removed by the promise that owns it, so an older request
 * settling late can never delete a newer request's entry.
 */
export class InFlightRequests {
  private readonly entries = new Map<string, Promise<unknown>>();
  private readonly onChange: () => void;

  constructor(onChange: () => void = () => {}) {
    this.onChange = onChange;
  }

  run<T>(key: string, start: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) return existing as Promise<T>;

    let promise: Promise<T>;
    try {
      promise = start();
    } catch (error) {
      promise = Promise.reject(error);
    }

    this.entries.set(key, promise);
    this.onChange();

    const release = () => {
      if (this.entries.get(key) === promise) {
        this.entries.delete(key);
        this.onChange();
      }
    };
    promise.then(release, release);
    return promise;
  }

  get<T>(key: string): Promise<T> | undefined {
    return this.entries.get(key) as Promise<T> | undefined;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  clear(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this.onChange();
  }
}

/** How the coordinator reads and writes App state (refs + React setters in App). */
export interface RequestStore {
  getProfile(): StudentProfile | null;
  getSkillGap(careerTitle: string): SkillGapAnalysis | undefined;
  getRoadmap(careerTitle: string): LearningRoadmapData | undefined;
  /**
   * A search succeeded: replace the assessment atomically (profile + careers),
   * clear per-career caches and select the first career.
   */
  commitAssessment(profile: StudentProfile, data: CareerFinderResponse): void;
  /**
   * A search failed. The previous assessment (if any) is left untouched.
   * `retryable` is false for input problems (400/413), where resending the
   * same details cannot help.
   */
  onSearchFailed(profile: StudentProfile, message: string, retryable: boolean): void;
  setSkillGap(careerTitle: string, data: SkillGapAnalysis): void;
  setRoadmap(careerTitle: string, data: LearningRoadmapData): void;
  setError(message: string): void;
  /** Pending or failed state changed; App re-renders. */
  onRequestsChanged(): void;
}

export type PostFn = <T>(url: string, body: unknown, fallbackMessage: string) => Promise<ApiResult<T>>;

const FALLBACK = {
  careers: "Failed to generate career recommendations.",
  skillGap: "Failed to analyze skill gap for this career.",
  roadmap: "Failed to generate your learning roadmap.",
} as const;

/** Input problems cannot be fixed by resending the same details. */
export function isRetryableStatus(status: number): boolean {
  return !(status >= 400 && status < 500 && status !== 408 && status !== 429);
}

export function createRequestCoordinator(store: RequestStore, post: PostFn = postJSON) {
  let sessionId = 0;
  let searchId = 0;
  let activeSearchKey: string | null = null;
  const inFlight = new InFlightRequests(() => store.onRequestsChanged());
  const failed = new Set<string>();

  const isCurrent = (session: number) => session === sessionId;

  function setFailed(key: string, value: boolean) {
    const changed = value ? !failed.has(key) : failed.has(key);
    if (value) failed.add(key);
    else failed.delete(key);
    if (changed) store.onRequestsChanged();
  }

  /** Invalidates everything from the previous session. */
  function startNewSession(): number {
    sessionId += 1;
    inFlight.clear();
    failed.clear();
    store.onRequestsChanged();
    return sessionId;
  }

  function findCareers(profile: StudentProfile): Promise<void> {
    // Each search has its own key, so a search never reuses another search's
    // promise (even with a different profile in the same session).
    searchId += 1;
    const search = searchId;
    const session = sessionId;
    const key = requestKey(session, "careers", `search:${search}`);
    activeSearchKey = key;

    return inFlight.run(key, async () => {
      const result = await post<CareerFinderResponse>("/api/careers", profile, FALLBACK.careers);
      // Stale: "New Assessment" happened, or a newer search was started.
      if (!isCurrent(session) || search !== searchId) return;
      if (!result.ok) {
        store.onSearchFailed(profile, result.message, isRetryableStatus(result.status));
        return;
      }
      // Success: start a new session so requests from the previous assessment
      // are invalidated, then commit the new profile and careers together.
      startNewSession();
      store.commitAssessment(profile, result.data);
    });
  }

  function analyzeSkillGap(
    career: CareerRecommendation,
    options: RequestOptions
  ): Promise<SkillGapAnalysis | null> {
    const session = sessionId;
    const key = requestKey(session, "skill-gap", career.title);

    const cached = store.getSkillGap(career.title);
    if (cached && !options.forceRefresh) return Promise.resolve(cached);

    const running = inFlight.get<SkillGapAnalysis | null>(key);
    if (running) return running;

    if (options.trigger === "navigation" && failed.has(key)) return Promise.resolve(null);

    const profile = store.getProfile();
    if (!profile) return Promise.resolve(null);

    setFailed(key, false);
    return inFlight.run(key, async () => {
      const result = await post<SkillGapAnalysis>(
        "/api/skill-gap",
        { profile, career },
        FALLBACK.skillGap
      );
      if (!isCurrent(session)) return null;
      if (!result.ok) {
        setFailed(key, true);
        store.setError(result.message);
        return null;
      }
      store.setSkillGap(career.title, result.data);
      return result.data;
    });
  }

  function generateRoadmap(
    career: CareerRecommendation,
    options: RequestOptions
  ): Promise<LearningRoadmapData | null> {
    const session = sessionId;
    const key = requestKey(session, "roadmap", career.title);

    const cached = store.getRoadmap(career.title);
    if (cached && !options.forceRefresh) return Promise.resolve(cached);

    const running = inFlight.get<LearningRoadmapData | null>(key);
    if (running) return running;

    if (options.trigger === "navigation" && failed.has(key)) return Promise.resolve(null);

    const profile = store.getProfile();
    if (!profile) return Promise.resolve(null);

    setFailed(key, false);
    return inFlight.run(key, async () => {
      // F2: use the matching skill gap, waiting for it if it is still running.
      let skillGap: SkillGapAnalysis | null = store.getSkillGap(career.title) ?? null;
      if (!skillGap) {
        const pendingGap = inFlight.get<SkillGapAnalysis | null>(
          requestKey(session, "skill-gap", career.title)
        );
        if (pendingGap) skillGap = await pendingGap;
      }
      if (!isCurrent(session)) return null;

      const result = await post<LearningRoadmapData>(
        "/api/roadmap",
        { profile, career, skillGap },
        FALLBACK.roadmap
      );
      if (!isCurrent(session)) return null;
      if (!result.ok) {
        setFailed(key, true);
        store.setError(result.message);
        return null;
      }
      store.setRoadmap(career.title, result.data);
      return result.data;
    });
  }

  return {
    findCareers,
    analyzeSkillGap,
    generateRoadmap,
    /** "New Assessment": drop the session and everything still running in it. */
    reset(): void {
      startNewSession();
    },
    isPending(feature: RequestFeature, careerTitle?: string): boolean {
      if (feature === "careers") {
        return activeSearchKey !== null && inFlight.has(activeSearchKey);
      }
      return inFlight.has(requestKey(sessionId, feature, careerTitle));
    },
    hasFailed(feature: RequestFeature, careerTitle?: string): boolean {
      return failed.has(requestKey(sessionId, feature, careerTitle));
    },
    get sessionId(): number {
      return sessionId;
    },
  };
}

export type RequestCoordinator = ReturnType<typeof createRequestCoordinator>;
