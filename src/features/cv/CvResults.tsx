import React from "react";
import { AlertCircle, CheckCircle2, Info, ListChecks, RotateCcw, ScanText, Sparkles, Target, Type } from "lucide-react";
import type { CvAnalysis, Priority } from "../../types/cv";

const CATEGORY_LABELS: Array<[keyof CvAnalysis["categoryScores"], string]> = [
  ["contentQuality", "Content quality"],
  ["completeness", "Completeness"],
  ["careerRelevance", "Career relevance"],
  ["professionalPresentation", "Professional presentation"],
];

/** Plain-language band for a 0–100 score. */
export function scoreBand(score: number): string {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Needs work";
}

const PRIORITY_ORDER: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
const PRIORITY_STYLE: Record<Priority, string> = {
  High: "bg-primary text-white",
  Medium: "bg-lavender-soft text-primary-deep",
  Low: "border border-line bg-canvas text-ink-muted",
};

function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36 shrink-0" role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-lavender-soft)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-primary)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="font-display text-4xl font-extrabold text-ink">{score}</span>
        <span className="text-xs font-semibold text-ink-muted">out of 100</span>
      </div>
    </div>
  );
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-lavender-soft" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <div className="cl-progress-fill h-full rounded-pill bg-primary" style={{ width: `${value}%` }} />
    </div>
  );
}

function Section({ id, title, icon: Icon, children, note }: { id: string; title: string; icon: typeof Info; children: React.ReactNode; note?: string }) {
  return (
    <section className="cl-card p-6" aria-labelledby={id}>
      <div className="flex items-start gap-3">
        <span className="cl-icon-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-control">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id={id} className="font-display text-base font-bold text-ink">{title}</h2>
          {note && <p className="text-xs text-ink-muted">{note}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-ink-muted">{children}</p>;

export default function CvResults({ analysis, onStartOver }: { analysis: CvAnalysis; onStartOver: () => void }) {
  const a = analysis;
  const improvements = [...a.improvements].sort((x, y) => PRIORITY_ORDER[x.priority] - PRIORITY_ORDER[y.priority]);

  return (
    <div className="cl-stagger space-y-6">
      {/* Overall */}
      <section className="cl-card cl-card-accent p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <ScoreRing score={a.overallScore} label={`Overall CV score: ${a.overallScore} out of 100 (${scoreBand(a.overallScore)})`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="cv-results-title" className="font-display text-xl font-bold text-ink">Your CV analysis</h2>
              <span className="cl-badge">{scoreBand(a.overallScore)}</span>
              <span className="cl-badge bg-canvas text-ink-muted">Assessed as: {a.candidateStage}</span>
            </div>
            <p className="mt-2 leading-relaxed text-ink">{a.overallSummary}</p>
            <button type="button" onClick={onStartOver} className="cl-btn cl-btn-secondary mt-4">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Analyze another CV
            </button>
          </div>
        </div>
      </section>

      {/* Category scores */}
      <section className="cl-card p-6" aria-labelledby="cv-categories-title">
        <h2 id="cv-categories-title" className="font-display text-base font-bold text-ink">Category scores</h2>
        <ul className="mt-4 grid gap-5 sm:grid-cols-2">
          {CATEGORY_LABELS.map(([key, label]) => {
            const s = a.categoryScores[key];
            return (
              <li key={key}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">{label}</h3>
                  <span className="font-mono text-sm font-bold tabular-nums text-primary-strong">{s.score}/100</span>
                </div>
                <div className="mt-2"><Bar value={s.score} label={`${label}: ${s.score} out of 100`} /></div>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.explanation}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Strengths / weaknesses */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="cv-strengths" title="Strengths" icon={CheckCircle2}>
          {a.strengths.length ? (
            <ul className="space-y-2">{a.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{s}</li>
            ))}</ul>
          ) : <Empty>No specific strengths were listed.</Empty>}
        </Section>
        <Section id="cv-weaknesses" title="Areas to improve" icon={AlertCircle}>
          {a.weaknesses.length ? (
            <ul className="space-y-2">{a.weaknesses.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{s}</li>
            ))}</ul>
          ) : <Empty>No specific weaknesses were listed.</Empty>}
        </Section>
      </div>

      {/* Improvements */}
      <Section id="cv-improvements" title="Suggested improvements" icon={Sparkles} note="Most important first">
        {improvements.length ? (
          <ol className="space-y-3">{improvements.map((m, i) => (
            <li key={i} className="rounded-control border border-line bg-canvas p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-pill px-2 py-0.5 text-[0.6875rem] font-semibold ${PRIORITY_STYLE[m.priority]}`}>{m.priority} priority</span>
                <h3 className="text-sm font-semibold text-ink">{m.action}</h3>
              </div>
              {m.reason && <p className="mt-1 text-sm text-ink-muted">{m.reason}</p>}
            </li>
          ))}</ol>
        ) : <Empty>No improvements were suggested.</Empty>}
      </Section>

      {/* Missing sections */}
      <Section id="cv-missing" title="Missing or incomplete sections" icon={ListChecks}>
        {a.missingSections.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">{a.missingSections.map((m, i) => (
            <li key={i} className="rounded-control border border-line p-3.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{m.section}</h3>
                <span className="shrink-0 rounded-pill bg-lavender-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-primary-deep">{m.importance}</span>
              </div>
              <p className="mt-1 text-sm text-ink-muted">{m.suggestion}</p>
            </li>
          ))}</ul>
        ) : <Empty>No missing sections were found.</Empty>}
      </Section>

      {/* Language */}
      <Section id="cv-language" title="Grammar and spelling" icon={Type}>
        {a.languageIssues.length ? (
          <ul className="space-y-3">{a.languageIssues.map((m, i) => (
            <li key={i} className="rounded-control border border-line p-3.5">
              <span className="rounded-pill bg-canvas px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-muted">{m.type}</span>
              <blockquote className="mt-2 border-l-2 border-lavender pl-3 text-sm italic text-ink">“{m.excerpt}”</blockquote>
              <p className="mt-2 text-sm text-ink-muted"><span className="font-semibold text-ink">Issue: </span>{m.issue}</p>
              <p className="mt-1 text-sm text-ink-muted"><span className="font-semibold text-ink">Suggestion: </span>{m.suggestion}</p>
            </li>
          ))}</ul>
        ) : <Empty>No grammar or spelling issues were found.</Empty>}
      </Section>

      {/* Weak descriptions */}
      <Section id="cv-weak" title="Descriptions to strengthen" icon={Target}>
        {a.weakDescriptions.length ? (
          <ul className="space-y-3">{a.weakDescriptions.map((m, i) => (
            <li key={i} className="rounded-control border border-line p-3.5">
              <blockquote className="border-l-2 border-lavender pl-3 text-sm italic text-ink">“{m.excerpt}”</blockquote>
              <p className="mt-2 text-sm text-ink-muted"><span className="font-semibold text-ink">Why it's weak: </span>{m.problem}</p>
              <p className="mt-1 text-sm text-ink-muted"><span className="font-semibold text-ink">How to improve: </span>{m.suggestion}</p>
            </li>
          ))}</ul>
        ) : <Empty>No weak descriptions were found.</Empty>}
      </Section>

      {/* Formatting */}
      <Section id="cv-formatting" title="Formatting and readability" icon={ScanText}>
        {a.formattingIssues.length ? (
          <ul className="space-y-3">{a.formattingIssues.map((m, i) => (
            <li key={i} className="text-sm"><p className="font-semibold text-ink">{m.issue}</p><p className="text-ink-muted">{m.suggestion}</p></li>
          ))}</ul>
        ) : <Empty>No formatting issues were found.</Empty>}
      </Section>

      {/* ATS + keywords */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="cv-ats" title="ATS compatibility (estimate)" icon={ScanText}
          note="An estimate of how easily applicant tracking systems may read your CV. Not a guarantee — no real ATS was used.">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-ink">Estimated score</span>
            <span className="font-mono text-sm font-bold tabular-nums text-primary-strong">{a.ats.estimatedScore}/100</span>
          </div>
          <div className="mt-2"><Bar value={a.ats.estimatedScore} label={`Estimated ATS compatibility: ${a.ats.estimatedScore} out of 100`} /></div>
          <p className="mt-3 text-sm text-ink-muted">{a.ats.summary}</p>
          {a.ats.parsingRisks.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-bold text-ink">Possible parsing risks</h3>
              <ul className="mt-2 space-y-1.5">{a.ats.parsingRisks.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-muted"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-pill bg-primary" aria-hidden="true" />{r}</li>
              ))}</ul>
            </>
          )}
        </Section>
        <Section id="cv-keywords" title="Career keywords" icon={Target}>
          <h3 className="text-xs font-bold text-ink">Already in your CV</h3>
          {a.keywords.present.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">{a.keywords.present.map((k, i) => (
              <li key={i} className="rounded-pill bg-lavender-soft px-2.5 py-0.5 text-xs font-medium text-primary-deep">{k}</li>
            ))}</ul>
          ) : <Empty>None identified.</Empty>}
          <h3 className="mt-4 text-xs font-bold text-ink">Worth considering</h3>
          <p className="text-xs text-ink-muted">Only add these if you genuinely have the skill or experience.</p>
          {a.keywords.missing.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">{a.keywords.missing.map((k, i) => (
              <li key={i} className="rounded-pill border border-line bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink">{k}</li>
            ))}</ul>
          ) : <Empty>None suggested.</Empty>}
        </Section>
      </div>

      {/* Job match: only when a job description was provided */}
      {a.jobMatch && (
        <Section id="cv-job-match" title="Match with the job description" icon={Target}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-ink">Estimated match</span>
            <span className="font-mono text-sm font-bold tabular-nums text-primary-strong">{a.jobMatch.matchScore}/100</span>
          </div>
          <div className="mt-2"><Bar value={a.jobMatch.matchScore} label={`Estimated job match: ${a.jobMatch.matchScore} out of 100`} /></div>
          <p className="mt-3 text-sm text-ink-muted">{a.jobMatch.summary}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-bold text-ink">Requirements your CV shows</h3>
              {a.jobMatch.matchedRequirements.length ? <ul className="mt-2 space-y-1.5">{a.jobMatch.matchedRequirements.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{r}</li>
              ))}</ul> : <Empty>None identified.</Empty>}
            </div>
            <div>
              <h3 className="text-xs font-bold text-ink">Gaps</h3>
              {a.jobMatch.gaps.length ? <ul className="mt-2 space-y-1.5">{a.jobMatch.gaps.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{r}</li>
              ))}</ul> : <Empty>No gaps identified.</Empty>}
            </div>
          </div>
        </Section>
      )}

      <p className="flex items-start gap-2 text-xs text-ink-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        This feedback is generated by AI and can be wrong. Review each suggestion and only include information that is true.
      </p>
    </div>
  );
}
