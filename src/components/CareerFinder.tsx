import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  GraduationCap,
  Loader2,
  Map,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Wand2,
  X,
} from "lucide-react";
import type {
  CareerFinderResponse,
  CareerRecommendation,
  StudentProfile,
} from "../types/career";
import { clampPercent, padNumber } from "../lib/format";
import { mergeTags, type TagKind } from "../lib/tags";
import { PROFILE_LIMITS, validateProfile } from "../shared/profile";

/** Maps a validation message (unchanged wording) to the field it is about. */
function fieldForError(message: string | null): string | null {
  if (!message) return null;
  if (/education/i.test(message)) return "education-level";
  if (/field of study/i.test(message)) return "field-of-study";
  if (/skill/i.test(message)) return "skills-input";
  if (/interest/i.test(message)) return "interests-input";
  if (/goal/i.test(message)) return "career-goals";
  if (/name/i.test(message)) return "student-name";
  return null;
}

const INPUT_CLASS = "cl-input aria-[invalid=true]:border-red-500";

interface CareerFinderProps {
  initialProfile: StudentProfile | null;
  careerResults: CareerFinderResponse | null;
  /** The profile the displayed career results were generated for. */
  resultsProfile?: StudentProfile | null;
  isLoading: boolean;
  /** Seconds left in the global AI cooldown (0 = none). */
  cooldownSeconds?: number;
  /** The latest search failed; any results shown belong to the previous assessment. */
  searchFailure?: { message: string; retryable: boolean } | null;
  onRetrySearch?: () => void;
  onSubmitProfile: (profile: StudentProfile) => Promise<void>;
  onSelectForSkillGap: (career: CareerRecommendation) => void;
  onSelectForRoadmap: (career: CareerRecommendation) => void;
}

const EDUCATION_LEVELS = [
  "High School Student",
  "Associate Degree / Diploma",
  "Undergraduate (Bachelor's)",
  "Graduate (Master's / PhD)",
  "Bootcamp / Self-Taught",
];

const QUICK_SKILLS = [
  "Python",
  "Excel",
  "Communication",
  "Data Analysis",
  "JavaScript",
  "UI/UX Design",
  "Public Speaking",
  "SQL",
];

const QUICK_INTERESTS = [
  "Artificial Intelligence",
  "Product Strategy",
  "Healthcare Tech",
  "Visual Design",
  "Sustainability",
  "Finance",
  "Education",
];

export default function CareerFinder({
  initialProfile,
  careerResults,
  resultsProfile = null,
  isLoading,
  cooldownSeconds = 0,
  searchFailure = null,
  onRetrySearch,
  onSubmitProfile,
  onSelectForSkillGap,
  onSelectForRoadmap,
}: CareerFinderProps) {
  const [name, setName] = useState(initialProfile?.name ?? "");
  const [educationLevel, setEducationLevel] = useState(
    initialProfile?.educationLevel ?? "Undergraduate (Bachelor's)"
  );
  const [fieldOfStudy, setFieldOfStudy] = useState(
    initialProfile?.fieldOfStudy ?? ""
  );
  const [skills, setSkills] = useState<string[]>(initialProfile?.skills ?? []);
  const [skillInput, setSkillInput] = useState("");
  const [interests, setInterests] = useState<string[]>(
    initialProfile?.interests ?? []
  );
  const [interestInput, setInterestInput] = useState("");
  const [careerGoals, setCareerGoals] = useState(
    initialProfile?.careerGoals ?? ""
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  // Tag-limit errors are shown under the field they belong to.
  const [tagError, setTagError] = useState<{ kind: TagKind; message: string } | null>(null);

  /** Returns the new list, or null if the addition was rejected (input is kept). */
  const addTags = (
    raw: string,
    current: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    kind: TagKind
  ): string[] | null => {
    const result = mergeTags(raw, current, kind);
    if (!result.ok) {
      setTagError({ kind, message: result.error });
      return null;
    }
    if (tagError?.kind === kind) setTagError(null);
    if (result.tags !== current) setter(result.tags);
    return result.tags;
  };

  const removeTag = (
    index: number,
    current: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter(current.filter((_, idx) => idx !== index));
    setTagError(null);
  };

  const handleFillSample = () => {
    setValidationError(null);
    setName("Amina Tariq");
    setEducationLevel("Undergraduate (Bachelor's)");
    setFieldOfStudy("Computer Science");
    setSkills([
      "Python",
      "HTML & CSS",
      "SQL",
      "Problem Solving",
      "Technical Writing",
    ]);
    setSkillInput("");
    setInterests([
      "Artificial Intelligence",
      "Data Storytelling",
      "Healthcare Tech",
    ]);
    setInterestInput("");
    setCareerGoals(
      "I want a role where I can solve real-world problems using data and technology, collaborate with cross-functional teams, and grow into a high-impact specialist within 3 years."
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Pending text in a tag input is added first; if it breaks a limit the
    // submit stops and the text stays in the input (never silently dropped).
    let finalSkills = skills;
    if (skillInput.trim()) {
      const merged = addTags(skillInput, skills, setSkills, "skill");
      if (!merged) return;
      finalSkills = merged;
      setSkillInput("");
    }

    let finalInterests = interests;
    if (interestInput.trim()) {
      const merged = addTags(interestInput, interests, setInterests, "interest");
      if (!merged) return;
      finalInterests = merged;
      setInterestInput("");
    }

    if (!name.trim()) {
      setValidationError("Please enter your name.");
      return;
    }
    if (!fieldOfStudy.trim()) {
      setValidationError("Please enter your field of study.");
      return;
    }
    if (finalSkills.length === 0) {
      setValidationError("Please add at least one current skill.");
      return;
    }
    if (finalInterests.length === 0) {
      setValidationError("Please add at least one interest.");
      return;
    }
    if (!careerGoals.trim()) {
      setValidationError("Please share your career goals.");
      return;
    }

    const submission: StudentProfile = {
      name: name.trim(),
      educationLevel,
      fieldOfStudy: fieldOfStudy.trim(),
      skills: finalSkills,
      interests: finalInterests,
      careerGoals: careerGoals.trim(),
    };
    // Same rules and messages as the server, so an over-limit value (e.g. one
    // restored from an earlier session) is caught here instead of by a 400.
    const limits = validateProfile(submission);
    if (!limits.ok) {
      setValidationError(limits.error);
      return;
    }

    await onSubmitProfile(submission);
  };


  // ----- Presentation helpers (no business logic) -----
  const errorField = fieldForError(validationError);
  const formErrorRef = useRef<string | null>(null);
  // Move focus to the field a validation error is about (keyboard and screen readers).
  useEffect(() => {
    if (validationError && validationError !== formErrorRef.current) {
      const id = fieldForError(validationError);
      if (id) document.getElementById(id)?.focus();
    }
    formErrorRef.current = validationError;
  }, [validationError]);

  const completion = [
    { label: "Name", done: Boolean(name.trim()) },
    { label: "Field of study", done: Boolean(fieldOfStudy.trim()) },
    { label: "Skills", done: skills.length > 0 },
    { label: "Interests", done: interests.length > 0 },
    { label: "Career goals", done: Boolean(careerGoals.trim()) },
  ];
  const completedCount = completion.filter((c) => c.done).length;

  const fieldError = (id: string) =>
    errorField === id && validationError ? (
      <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {validationError}
      </p>
    ) : null;
  const describedBy = (...ids: Array<string | false | null | undefined>) =>
    ids.filter(Boolean).join(" ") || undefined;

  const tagSection = (kind: TagKind) => {
    const isSkill = kind === "skill";
    const id = isSkill ? "skills-input" : "interests-input";
    const list = isSkill ? skills : interests;
    const setList = isSkill ? setSkills : setInterests;
    const value = isSkill ? skillInput : interestInput;
    const setValue = isSkill ? setSkillInput : setInterestInput;
    const quick = isSkill ? QUICK_SKILLS : QUICK_INTERESTS;
    const tagErr = tagError?.kind === kind ? tagError.message : null;
    const errId = isSkill ? "skills-error" : "interests-error";
    const label = isSkill ? "Current Skills" : "Interests & Domains";
    const add = () => {
      if (addTags(value, list, setList, kind)) setValue("");
    };
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={id} className="cl-label mb-0">
            {label}
          </label>
          <span id={`${id}-count`} className="text-xs tabular-nums text-ink-muted">
            {list.length}/{PROFILE_LIMITS.maxTags}
          </span>
        </div>
        <p id={`${id}-help`} className="mt-0.5 text-xs text-ink-muted">
          {isSkill
            ? "Type a skill and press Enter, or separate several with commas."
            : "Subjects, industries or causes you care about."}
        </p>
        <div className="mt-2 flex gap-2">
          <input
            id={id}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (tagError?.kind === kind) setTagError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            aria-invalid={Boolean(tagErr) || errorField === id}
            aria-describedby={describedBy(`${id}-help`, `${id}-count`, tagErr && errId, errorField === id && `${id}-error`)}
            placeholder={isSkill ? "Type a skill & press Enter" : "Type an interest & press Enter"}
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          />
          <button type="button" onClick={add} className="cl-btn cl-btn-secondary shrink-0 px-4">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </button>
        </div>

        {tagErr && (
          <p id={errId} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {tagErr}
          </p>
        )}
        {fieldError(id)}

        {list.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={isSkill ? "Added skills" : "Added interests"}>
            {list.map((tag, idx) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => removeTag(idx, list, setList)}
                  aria-label={`Remove ${kind} ${tag}`}
                  className="cl-press inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-pill bg-lavender-soft px-3 py-1.5 text-xs font-semibold text-primary-deep hover:bg-lavender/25"
                >
                  <span className="truncate">{tag}</span>
                  <X className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">Suggestions:</span>
          {quick
            .filter((q) => !list.some((s) => s.toLowerCase() === q.toLowerCase()))
            .slice(0, 5)
            .map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => addTags(q, list, setList, kind)}
                className="cl-press min-h-9 rounded-pill border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-muted hover:border-lavender hover:text-primary-deep"
              >
                + {q}
              </button>
            ))}
        </div>
      </div>
    );
  };

  const sectionHeading = (n: number, title: string, text: string) => (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-lavender-soft font-mono text-xs font-semibold text-primary-strong" aria-hidden="true">
        {n}
      </span>
      <div>
        <h3 className="font-display text-base font-bold text-ink">{title}</h3>
        <p className="text-sm text-ink-muted">{text}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-enter">
      {/* Page header */}
      <section className="cl-card cl-card-hero p-6 sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <p className="cl-eyebrow">Career Finder</p>
            <h1 className="mt-2 text-heading font-bold text-ink">Find career paths that fit you</h1>
            <p className="mt-2 text-ink-muted">
              Tell CareerLens AI about your studies, skills, interests and goals. Google Gemini uses your profile to
              recommend three tailored career paths you can then analyze and plan for.
            </p>
          </div>
          <button
            type="button"
            onClick={handleFillSample}
            disabled={isLoading}
            className="cl-btn cl-btn-secondary shrink-0 self-start"
          >
            <Wand2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Try Sample Profile
          </button>
        </div>

        {/* Profile completeness (from the form itself) */}
        <div className="mt-6 rounded-control border border-line bg-canvas p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-ink">Your profile</span>
            <span className="tabular-nums text-ink-muted">
              {completedCount} of {completion.length} complete
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-pill bg-lavender-soft"
            role="progressbar"
            aria-label="Profile completeness"
            aria-valuemin={0}
            aria-valuemax={completion.length}
            aria-valuenow={completedCount}
          >
            <div
              className="cl-progress-fill h-full rounded-pill bg-primary"
              style={{ width: `${(completedCount / completion.length) * 100}%` }}
            />
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {completion.map((item) => (
              <li key={item.label} className={`flex items-center gap-1.5 text-xs ${item.done ? "text-ink" : "text-ink-muted"}`}>
                {item.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                ) : (
                  <Circle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {item.label}
                <span className="sr-only">{item.done ? "(done)" : "(to do)"}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Profile form */}
      <section className="cl-card p-6 sm:p-8" aria-labelledby="profile-form-title">
        <h2 id="profile-form-title" className="font-display text-lg font-bold text-ink">
          Your Student Profile
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Specific details lead to more accurate recommendations. All fields are required.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-8">
          {/* 1. About you */}
          <fieldset className="space-y-5">
            <legend className="sr-only">About you</legend>
            {sectionHeading(1, "About you", "Your name and what you are studying.")}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div>
                <label htmlFor="student-name" className="cl-label">
                  Full Name
                </label>
                <input
                  id="student-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={PROFILE_LIMITS.name}
                  autoComplete="name"
                  placeholder="e.g., Alex Morgan"
                  aria-invalid={errorField === "student-name"}
                  aria-describedby={describedBy(errorField === "student-name" && "student-name-error")}
                  className={INPUT_CLASS}
                />
                {fieldError("student-name")}
              </div>

              <div>
                <label htmlFor="education-level" className="cl-label">
                  Education Level
                </label>
                <select
                  id="education-level"
                  value={educationLevel}
                  onChange={(e) => setEducationLevel(e.target.value)}
                  aria-invalid={errorField === "education-level"}
                  aria-describedby={describedBy(errorField === "education-level" && "education-level-error")}
                  className={INPUT_CLASS}
                >
                  {EDUCATION_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
                {fieldError("education-level")}
              </div>

              <div>
                <label htmlFor="field-of-study" className="cl-label">
                  Field of Study
                </label>
                <input
                  id="field-of-study"
                  type="text"
                  value={fieldOfStudy}
                  onChange={(e) => setFieldOfStudy(e.target.value)}
                  maxLength={PROFILE_LIMITS.fieldOfStudy}
                  placeholder="e.g., Computer Science, Economics, Biology"
                  aria-invalid={errorField === "field-of-study"}
                  aria-describedby={describedBy(errorField === "field-of-study" && "field-of-study-error")}
                  className={INPUT_CLASS}
                />
                {fieldError("field-of-study")}
              </div>
            </div>
          </fieldset>

          {/* 2. Skills & interests */}
          <fieldset className="space-y-5 border-t border-line pt-8">
            <legend className="sr-only">Skills and interests</legend>
            {sectionHeading(2, "Skills & interests", "What you can already do and what you enjoy.")}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {tagSection("skill")}
              {tagSection("interest")}
            </div>
          </fieldset>

          {/* 3. Career goals */}
          <fieldset className="space-y-5 border-t border-line pt-8">
            <legend className="sr-only">Career goals</legend>
            {sectionHeading(3, "Career goals", "The kind of work, impact or role you are aiming for.")}
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="career-goals" className="cl-label mb-0">
                  Career Goals
                </label>
                <span id="career-goals-count" className="text-xs tabular-nums text-ink-muted">
                  {careerGoals.length.toLocaleString()}/{PROFILE_LIMITS.careerGoals.toLocaleString()}
                </span>
              </div>
              <textarea
                id="career-goals"
                rows={4}
                value={careerGoals}
                onChange={(e) => setCareerGoals(e.target.value)}
                maxLength={PROFILE_LIMITS.careerGoals}
                placeholder="What kind of work environment, impact, or role are you hoping to build toward?"
                aria-invalid={errorField === "career-goals"}
                aria-describedby={describedBy("career-goals-count", errorField === "career-goals" && "career-goals-error")}
                className={`${INPUT_CLASS} mt-2 resize-y`}
              />
              {fieldError("career-goals")}
            </div>
          </fieldset>

          {validationError && !errorField && (
            <div role="alert" className="flex items-start gap-2 rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {validationError}
            </div>
          )}

          <div className="flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-xs text-ink-muted">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              Your profile is analyzed by Google Gemini. It is not saved to an account.
            </p>
            <button
              type="submit"
              disabled={isLoading || cooldownSeconds > 0}
              className="cl-btn cl-btn-primary shrink-0 px-6 py-3"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  Analyzing Profile...
                </>
              ) : cooldownSeconds > 0 ? (
                <span>Try again in {cooldownSeconds}s</span>
              ) : (
                <>
                  <span>Find 3 Career Paths</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Loading */}
      {isLoading && (
        <section className="space-y-4" aria-busy="true">
          <div role="status" className="cl-card p-5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 shrink-0 text-primary motion-safe:animate-spin" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink">
                  CareerLens AI is evaluating your education, skills, and goals...
                </p>
                <p className="text-xs text-ink-muted">Matching your background against tailored career trajectories.</p>
              </div>
            </div>
            <div className="cl-loading-bar mt-4" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" aria-hidden="true">
            {[1, 2, 3].map((item) => (
              <div key={item} className="cl-card h-80 space-y-4 p-6 motion-safe:animate-pulse">
                <div className="h-4 w-28 rounded-pill bg-lavender-soft" />
                <div className="h-6 w-3/4 rounded-pill bg-lavender-soft" />
                <div className="h-16 w-full rounded-control bg-canvas" />
                <div className="h-24 w-full rounded-control bg-canvas" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Failed search: the new details were not analyzed. Any results below
          belong to the previous assessment and are labelled as such. */}
      {!isLoading && searchFailure && (
        <section
          role="alert"
          className="cl-card flex flex-col gap-4 border-red-200 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-red-50 text-red-600">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">
                We couldn&apos;t generate career paths for your updated details.
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                {searchFailure.message}
                {careerResults && resultsProfile && (
                  <>
                    {" "}
                    The results below are from your previous assessment for{" "}
                    <span className="font-semibold text-ink">{resultsProfile.name}</span> (
                    {resultsProfile.fieldOfStudy}).
                  </>
                )}
              </p>
            </div>
          </div>
          {searchFailure.retryable && onRetrySearch && (
            <button
              type="button"
              onClick={onRetrySearch}
              disabled={cooldownSeconds > 0}
              className="cl-btn cl-btn-secondary shrink-0 self-start sm:self-center"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {cooldownSeconds > 0 ? `Try again in ${cooldownSeconds}s` : "Try again"}
            </button>
          )}
        </section>
      )}

      {/* Results */}
      {!isLoading && careerResults && (
        <section className="space-y-6 animate-enter" aria-labelledby="career-results-title">
          <div className="cl-card cl-card-accent p-6">
            <div className="flex items-start gap-4">
              <span className="cl-icon-tile-solid flex h-10 w-10 shrink-0 items-center justify-center rounded-control">
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-base font-bold text-ink">Profile Synthesis</h2>
                {resultsProfile && (
                  <p className="text-xs font-medium text-ink-muted">
                    For {resultsProfile.name} · {resultsProfile.fieldOfStudy}
                  </p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-ink">{careerResults.profileSummary}</p>
              </div>
            </div>
          </div>

          <div>
            <h2 id="career-results-title" className="text-heading font-bold text-ink">
              3 Recommended Career Paths
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Inspect your skill gap or generate a step-by-step learning roadmap for any match.
            </p>
          </div>

          <ul className="cl-stagger grid grid-cols-1 gap-6 lg:grid-cols-3">
            {careerResults.careers.map((career, index) => {
              const fit = clampPercent(career.matchScore);
              return (
                <li key={`${index}-${career.id || career.title}`} className="flex">
                  <article
                    className="cl-card cl-card-interactive cl-accent-top flex w-full flex-col p-6"
                    aria-labelledby={`career-${index}-title`}
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-mono font-semibold tabular-nums text-ink-muted">
                        {padNumber(index + 1)} · Career Match
                      </span>
                      <span className="cl-badge font-mono tabular-nums">{fit}% Fit</span>
                    </div>
                    <div
                      className="mt-3 h-1.5 overflow-hidden rounded-pill bg-lavender-soft"
                      role="progressbar"
                      aria-label={`Match for ${career.title}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={fit}
                    >
                      <div className="cl-progress-fill h-full rounded-pill bg-primary" style={{ width: `${fit}%` }} />
                    </div>

                    <h3 id={`career-${index}-title`} className="mt-5 font-display text-lg font-extrabold text-ink">
                      {career.title}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-primary">{career.tagline}</p>
                    <p className="mt-3 text-sm leading-relaxed text-ink-muted">{career.explanation}</p>

                    <div className="mt-5 space-y-4 border-t border-line pt-5">
                      <div>
                        <h4 className="flex items-center gap-1.5 text-xs font-bold text-ink">
                          <Target className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                          Why It Fits Your Profile
                        </h4>
                        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{career.whyItFitsProfile}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-ink">Day-to-Day Responsibilities</h4>
                        <ul className="mt-2 space-y-1.5">
                          {career.dayToDay.map((item, itemIndex) => (
                            <li key={`${itemIndex}-${item}`} className="flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-pill bg-primary" aria-hidden="true" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-ink">Core Skills</h4>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {career.coreSkills.map((skill, skillIndex) => (
                            <li
                              key={`${skillIndex}-${skill}`}
                              className="rounded-pill border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink"
                            >
                              {skill}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <p className="flex items-start gap-2 rounded-control bg-canvas p-3 text-sm text-ink-muted">
                        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{career.growthOutlook}</span>
                      </p>
                    </div>

                    <div className="mt-auto flex flex-col gap-2.5 pt-6">
                      <button
                        type="button"
                        onClick={() => onSelectForSkillGap(career)}
                        className="cl-btn cl-btn-primary w-full"
                        aria-label={`Analyze Skill Gap for ${career.title}`}
                      >
                        <span>Analyze Skill Gap</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectForRoadmap(career)}
                        className="cl-btn cl-btn-secondary w-full"
                        aria-label={`Build Learning Roadmap for ${career.title}`}
                      >
                        <Map className="h-4 w-4" aria-hidden="true" />
                        <span>Build Learning Roadmap</span>
                      </button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {/* Announces new results to screen readers (empty while loading). */}
      <p className="sr-only" aria-live="polite">
        {!isLoading && careerResults ? `${careerResults.careers.length} career paths are ready.` : ""}
      </p>
    </div>
  );
}
