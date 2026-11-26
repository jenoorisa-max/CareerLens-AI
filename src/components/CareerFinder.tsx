import React, { useState } from "react";
import {
  Plus,
  X,
  ArrowRight,
  Loader2,
  TrendingUp,
  CheckCircle2,
  Wand2,
  Map,
} from "lucide-react";
import type {
  CareerFinderResponse,
  CareerRecommendation,
  StudentProfile,
} from "../types/career";

interface CareerFinderProps {
  initialProfile: StudentProfile | null;
  careerResults: CareerFinderResponse | null;
  isLoading: boolean;
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
  isLoading,
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

  const addTags = (
    raw: string,
    current: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ): string[] => {
    const items = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) return current;

    const existingLower = new Set(current.map((s) => s.toLowerCase()));
    const next = [...current];
    for (const item of items) {
      if (!existingLower.has(item.toLowerCase())) {
        next.push(item);
        existingLower.add(item.toLowerCase());
      }
    }
    setter(next);
    return next;
  };

  const removeTag = (
    index: number,
    current: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter(current.filter((_, idx) => idx !== index));
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

    const finalSkills = skillInput.trim()
      ? addTags(skillInput, skills, setSkills)
      : skills;
    if (skillInput.trim()) setSkillInput("");

    const finalInterests = interestInput.trim()
      ? addTags(interestInput, interests, setInterests)
      : interests;
    if (interestInput.trim()) setInterestInput("");

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

    await onSubmitProfile({
      name: name.trim(),
      educationLevel,
      fieldOfStudy: fieldOfStudy.trim(),
      skills: finalSkills,
      interests: finalInterests,
      careerGoals: careerGoals.trim(),
    });
  };

  return (
    <div className="space-y-8 animate-enter">
      {/* Hero Banner */}
      <section className="rounded-2xl border border-[#E8E1F8] bg-[#FAF8FF] p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-2xl space-y-2.5">
            <p className="text-xs font-semibold text-[#5B21B6]">
              CareerLens AI · Guided Student Assessment
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#18132A]">
              Discover Your Career.{" "}
              <span className="text-[#5B21B6]">Build Your Future.</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Enter your academic background, current skills, and ambitions.
              Gemini evaluates your profile to recommend 3 tailored career
              paths, assess your skill gaps, and map out a beginner-friendly
              learning plan.
            </p>
          </div>
          <button
            type="button"
            onClick={handleFillSample}
            disabled={isLoading}
            className="self-start md:self-center inline-flex items-center gap-2 rounded-xl border border-[#DDD3F6] bg-white px-4 py-2.5 text-xs font-semibold text-[#4C1D95] hover:bg-[#F3EEFF] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B21B6]"
          >
            <Wand2 className="h-3.5 w-3.5 text-[#5B21B6]" />
            Try Sample Profile
          </button>
        </div>
      </section>

      {/* Profile Input Form */}
      <section className="rounded-2xl border border-[#E8E1F8] bg-white p-6 sm:p-8">
        <div className="pb-5 border-b border-[#EFEAF9]">
          <h2 className="text-lg font-bold text-[#18132A]">
            01. Your Student Profile
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Provide specific details about your studies, skills, and goals for
            more accurate recommendations.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label
                htmlFor="student-name"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Full Name
              </label>
              <input
                id="student-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Alex Morgan"
                className="w-full rounded-xl border border-[#E2DAF5] bg-[#FAF8FF]/60 px-4 py-2.5 text-sm text-[#18132A] placeholder:text-slate-400 focus:border-[#5B21B6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5B21B6]/20 transition"
              />
            </div>

            <div>
              <label
                htmlFor="education-level"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Education Level
              </label>
              <select
                id="education-level"
                value={educationLevel}
                onChange={(e) => setEducationLevel(e.target.value)}
                className="w-full rounded-xl border border-[#E2DAF5] bg-[#FAF8FF]/60 px-4 py-2.5 text-sm text-[#18132A] focus:border-[#5B21B6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5B21B6]/20 transition"
              >
                {EDUCATION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="field-of-study"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Field of Study
              </label>
              <input
                id="field-of-study"
                type="text"
                value={fieldOfStudy}
                onChange={(e) => setFieldOfStudy(e.target.value)}
                placeholder="e.g., Computer Science, Economics, Biology"
                className="w-full rounded-xl border border-[#E2DAF5] bg-[#FAF8FF]/60 px-4 py-2.5 text-sm text-[#18132A] placeholder:text-slate-400 focus:border-[#5B21B6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5B21B6]/20 transition"
              />
            </div>
          </div>

          {/* Skills & Interests */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Current Skills */}
            <div className="space-y-3">
              <label
                htmlFor="skills-input"
                className="block text-xs font-semibold text-slate-700"
              >
                Current Skills
              </label>
              <div className="flex gap-2">
                <input
                  id="skills-input"
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTags(skillInput, skills, setSkills);
                      setSkillInput("");
                    }
                  }}
                  placeholder="Type a skill & press Enter"
                  className="flex-1 min-w-0 rounded-xl border border-[#E2DAF5] bg-[#FAF8FF]/60 px-4 py-2.5 text-sm text-[#18132A] placeholder:text-slate-400 focus:border-[#5B21B6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5B21B6]/20 transition"
                />
                <button
                  type="button"
                  onClick={() => {
                    addTags(skillInput, skills, setSkills);
                    setSkillInput("");
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#F3EEFF] px-4 py-2.5 text-xs font-semibold text-[#4C1D95] hover:bg-[#E7DDFC] transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {skills.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill, idx) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => removeTag(idx, skills, setSkills)}
                      aria-label={`Remove skill ${skill}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#F3EEFF] px-3 py-1.5 text-xs font-semibold text-[#4C1D95] hover:bg-[#E7DDFC] transition-colors whitespace-nowrap"
                    >
                      <span>{skill}</span>
                      <X className="h-3 w-3 opacity-70" />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span className="text-xs text-slate-400">Suggestions:</span>
                {QUICK_SKILLS.filter(
                  (q) => !skills.some((s) => s.toLowerCase() === q.toLowerCase())
                )
                  .slice(0, 5)
                  .map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => addTags(q, skills, setSkills)}
                      className="rounded-lg border border-[#E8E1F8] bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-[#5B21B6] hover:text-[#4C1D95] transition-colors whitespace-nowrap"
                    >
                      + {q}
                    </button>
                  ))}
              </div>
            </div>

            {/* Interests */}
            <div className="space-y-3">
              <label
                htmlFor="interests-input"
                className="block text-xs font-semibold text-slate-700"
              >
                Interests &amp; Domains
              </label>
              <div className="flex gap-2">
                <input
                  id="interests-input"
                  type="text"
                  value={interestInput}
                  onChange={(e) => setInterestInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTags(interestInput, interests, setInterests);
                      setInterestInput("");
                    }
                  }}
                  placeholder="Type an interest & press Enter"
                  className="flex-1 min-w-0 rounded-xl border border-[#E2DAF5] bg-[#FAF8FF]/60 px-4 py-2.5 text-sm text-[#18132A] placeholder:text-slate-400 focus:border-[#5B21B6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5B21B6]/20 transition"
                />
                <button
                  type="button"
                  onClick={() => {
                    addTags(interestInput, interests, setInterests);
                    setInterestInput("");
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#F3EEFF] px-4 py-2.5 text-xs font-semibold text-[#4C1D95] hover:bg-[#E7DDFC] transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {interests.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {interests.map((interest, idx) => (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => removeTag(idx, interests, setInterests)}
                      aria-label={`Remove interest ${interest}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#EFE8FF] px-3 py-1.5 text-xs font-semibold text-[#4C1D95] hover:bg-[#E2D6FC] transition-colors whitespace-nowrap"
                    >
                      <span>{interest}</span>
                      <X className="h-3 w-3 opacity-70" />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span className="text-xs text-slate-400">Suggestions:</span>
                {QUICK_INTERESTS.filter(
                  (q) =>
                    !interests.some((i) => i.toLowerCase() === q.toLowerCase())
                )
                  .slice(0, 5)
                  .map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => addTags(q, interests, setInterests)}
                      className="rounded-lg border border-[#E8E1F8] bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-[#5B21B6] hover:text-[#4C1D95] transition-colors whitespace-nowrap"
                    >
                      + {q}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Career Goals */}
          <div>
            <label
              htmlFor="career-goals"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Career Goals
            </label>
            <textarea
              id="career-goals"
              rows={3}
              value={careerGoals}
              onChange={(e) => setCareerGoals(e.target.value)}
              placeholder="What kind of work environment, impact, or role are you hoping to build toward?"
              className="w-full rounded-xl border border-[#E2DAF5] bg-[#FAF8FF]/60 px-4 py-3 text-sm text-[#18132A] placeholder:text-slate-400 focus:border-[#5B21B6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#5B21B6]/20 transition"
            />
          </div>

          {validationError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {validationError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-[#EFEAF9]">
            <p className="text-xs text-slate-500">
              Analyzed live via Gemini AI to produce personalized career paths.
            </p>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5B21B6] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4C1D95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B21B6]/50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing Profile...
                </>
              ) : (
                <>
                  <span>Find 3 Career Paths</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Loading Skeleton */}
      {isLoading && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[#E8E1F8] bg-[#FAF8FF] p-5 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[#5B21B6] shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#18132A]">
                CareerLens AI is evaluating your education, skills, and goals...
              </p>
              <p className="text-xs text-slate-600">
                Matching your background against tailored career trajectories.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-96 rounded-2xl border border-[#E8E1F8] bg-white p-6 animate-pulse space-y-4"
              >
                <div className="h-4 w-28 rounded bg-[#F3EEFF]" />
                <div className="h-6 w-3/4 rounded bg-[#F3EEFF]" />
                <div className="h-20 w-full rounded bg-[#FAF8FF]" />
                <div className="h-28 w-full rounded bg-[#FAF8FF]" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommended Careers Output */}
      {!isLoading && careerResults && (
        <section className="space-y-6 animate-enter">
          <div className="rounded-2xl border border-[#E8E1F8] bg-[#FAF8FF] p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#5B21B6] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-[#18132A]">
                  Profile Synthesis
                </h3>
                <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                  {careerResults.profileSummary}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h3 className="text-xl font-bold text-[#18132A]">
                3 Recommended Career Paths
              </h3>
              <p className="text-sm text-slate-500">
                Inspect your skill gap or generate a step-by-step learning
                roadmap for any match.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {careerResults.careers.map((career, index) => (
              <article
                key={career.id || career.title}
                className="flex flex-col justify-between rounded-2xl border border-[#E8E1F8] bg-white p-6 hover:border-[#C5B3F0] transition-colors duration-150"
              >
                <div className="space-y-4">
                  {/* Unboxed Typographic Metadata Header */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono tabular-nums font-semibold text-slate-500">
                      0{index + 1} · Career Match
                    </span>
                    <span className="font-mono tabular-nums font-bold text-[#5B21B6]">
                      {career.matchScore}% Fit
                    </span>
                  </div>

                  <div>
                    <h4 className="text-lg font-extrabold text-[#18132A]">
                      {career.title}
                    </h4>
                    <p className="mt-1 text-xs font-semibold text-[#5B21B6]">
                      {career.tagline}
                    </p>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    {career.explanation}
                  </p>

                  {/* Hairline-separated section instead of nested cards */}
                  <div className="pt-4 border-t border-[#EFEAF9]">
                    <p className="text-xs font-bold text-[#18132A] mb-1">
                      Why It Fits Your Profile
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {career.whyItFitsProfile}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[#EFEAF9]">
                    <p className="text-xs font-bold text-[#18132A] mb-2">
                      Day-to-Day Responsibilities
                    </p>
                    <ul className="space-y-1.5">
                      {career.dayToDay.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#5B21B6] shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-4 border-t border-[#EFEAF9]">
                    <p className="text-xs font-bold text-[#18132A] mb-1.5">
                      Core Skills
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {career.coreSkills.join(" · ")}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[#EFEAF9] flex items-start gap-2 text-xs text-slate-600">
                    <TrendingUp className="h-4 w-4 text-[#5B21B6] shrink-0 mt-0.5" />
                    <span>{career.growthOutlook}</span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-[#EFEAF9] flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => onSelectForSkillGap(career)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#5B21B6] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#4C1D95] transition-colors whitespace-nowrap"
                  >
                    <span>Analyze Skill Gap</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectForRoadmap(career)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#DDD3F6] bg-white px-4 py-2.5 text-xs font-semibold text-[#4C1D95] hover:bg-[#FAF8FF] transition-colors whitespace-nowrap"
                  >
                    <Map className="h-3.5 w-3.5" />
                    <span>Build Learning Roadmap</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
