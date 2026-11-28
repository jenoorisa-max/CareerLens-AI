import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Compass,
  GraduationCap,
  ListChecks,
  Map,
  Menu,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type { ActiveTab } from "../types/career";

interface LandingPageProps {
  /** Opens the existing application (Dashboard). */
  onGetStarted: () => void;
  /** Opens the existing application on a specific feature. */
  onOpenFeature: (tab: ActiveTab) => void;
}

const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "About", href: "#about" },
] as const;

const FEATURES: Array<{
  tab: ActiveTab;
  icon: typeof Compass;
  title: string;
  description: string;
  points: string[];
  cta: string;
}> = [
  {
    tab: "finder",
    icon: Compass,
    title: "AI Career Finder",
    description:
      "Share your education, skills, interests and goals. CareerLens AI recommends three career paths that fit your profile and explains why each one suits you.",
    points: ["Three tailored career matches", "Day-to-day work and core skills", "Growth outlook for each path"],
    cta: "Find my career paths",
  },
  {
    tab: "skill-gap",
    icon: BarChart3,
    title: "Skill Gap Analyzer",
    description:
      "Choose a recommended career to see which of your skills already transfer, which skills are missing, and what to learn first.",
    points: ["Readiness overview for the role", "Missing skills ranked by importance", "A prioritised learning sequence"],
    cta: "Analyze my skills",
  },
  {
    tab: "roadmap",
    icon: Map,
    title: "Personalized Learning Roadmap",
    description:
      "Turn your skill gaps into a four-stage plan with topics, tools, beginner-friendly resources and a hands-on project in every stage.",
    points: ["Four progressive learning stages", "A hands-on project in every stage", "Track your progress stage by stage"],
    cta: "Build my roadmap",
  },
];

const STEPS = [
  {
    title: "Discover career opportunities",
    text: "Complete a short profile about your studies, skills, interests and goals, and receive three career paths matched to your background.",
  },
  {
    title: "Identify your skill gaps",
    text: "Compare your current skills with what a chosen career needs, and see clearly what to prioritise next.",
  },
  {
    title: "Follow your learning roadmap",
    text: "Work through a staged plan with resources and projects, and mark each stage complete as you progress.",
  },
];

const VALUES = [
  {
    icon: Target,
    title: "Built around you",
    text: "Recommendations are generated from your own education, skills, interests and goals rather than a generic list of jobs.",
  },
  {
    icon: ListChecks,
    title: "Clear next steps",
    text: "Every analysis ends in concrete actions: priorities to focus on, learning stages to follow and projects to build.",
  },
  {
    icon: GraduationCap,
    title: "Beginner-friendly",
    text: "Roadmaps start from your current level and point to widely known learning platforms and practical projects.",
  },
  {
    icon: ShieldCheck,
    title: "No sign-up required",
    text: "Start straight away. Your assessment is kept in your current browser tab and is not saved to an account or database.",
  },
];

function Brand({ onClick }: { onClick?: () => void }) {
  const content = (
    <>
      <span className="cl-icon-tile-solid flex h-9 w-9 shrink-0 items-center justify-center rounded-control">
        <Compass className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="font-display text-lg font-extrabold tracking-tight text-ink whitespace-nowrap">
        CareerLens <span className="text-primary">AI</span>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex min-h-11 items-center gap-2.5 rounded-control" aria-label="CareerLens AI home">
      {content}
    </button>
  ) : (
    <span className="flex items-center gap-2.5">{content}</span>
  );
}

/** Illustrative preview built from the app's real UI patterns (no real user data). */
function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-5xl" aria-hidden="true">
      <div className="absolute -inset-x-6 -inset-y-4 -z-10 rounded-[2rem] bg-lavender-soft/70 blur-2xl" />
      <div className="cl-card overflow-hidden shadow-raised">
        <div className="flex items-center justify-between border-b border-line bg-canvas px-5 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
          </div>
          <span className="text-[11px] font-medium text-ink-muted">Example preview · Computer Science student</span>
        </div>

        <div className="grid gap-4 p-4 text-left sm:p-6 md:grid-cols-3">
          {/* Career Finder */}
          <div className="rounded-control border border-line bg-surface p-4">
            <span className="cl-badge">
              <Compass className="h-3 w-3" /> Career Finder
            </span>
            <p className="mt-3 font-display text-base font-bold text-ink">Data Analyst</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">Turn data into decisions for real-world problems.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["SQL", "Python", "Statistics"].map((skill) => (
                <span key={skill} className="rounded-pill border border-line bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-ink">
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Skill Gap Analyzer */}
          <div className="rounded-control border border-line bg-surface p-4">
            <span className="cl-badge">
              <BarChart3 className="h-3 w-3" /> Skill Gap
            </span>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li className="flex items-center gap-2 text-ink">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> SQL foundations
              </li>
              <li className="flex items-center gap-2 text-ink">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> Python basics
              </li>
              <li className="flex items-center gap-2 text-ink">
                <Target className="h-4 w-4 shrink-0 text-primary" /> Statistics
              </li>
              <li className="flex items-center gap-2 text-ink">
                <Target className="h-4 w-4 shrink-0 text-primary" /> Data visualization
              </li>
            </ul>
          </div>

          {/* Learning Roadmap */}
          <div className="rounded-control border border-line bg-surface p-4">
            <span className="cl-badge">
              <Map className="h-3 w-3" /> Roadmap
            </span>
            <ol className="mt-3 space-y-2">
              {["Foundations", "Core skills", "Portfolio projects", "Job readiness"].map((stage, i) => (
                <li key={stage} className="flex items-center gap-2.5 text-sm text-ink">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill font-mono text-[11px] font-semibold ${
                      i === 0 ? "bg-primary text-white" : "bg-lavender-soft text-primary-strong"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {stage}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({ onGetStarted, onOpenFeature }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Scroll reveal for sections below the hero (progressive enhancement): only
  // armed when IntersectionObserver exists and the user allows motion; each
  // element is revealed once. Without it, everything is simply visible.
  useEffect(() => {
    const root = pageRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const targets = root.querySelectorAll(".cl-reveal, .cl-reveal-group");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 }
    );
    root.classList.add("cl-reveal-on");
    targets.forEach((target) => observer.observe(target));
    return () => {
      observer.disconnect();
      root.classList.remove("cl-reveal-on");
    };
  }, []);

  // Close the mobile menu with Escape and return focus to the menu button.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const scrollToTop = () => window.scrollTo({ top: 0 });

  return (
    <div ref={pageRef} className="min-h-screen bg-canvas text-ink">
      <button
        type="button"
        className="cl-skip-link"
        onClick={() => document.getElementById("main-content")?.focus()}
      >
        Skip to main content
      </button>
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-line/80 bg-surface/90 backdrop-blur-md">
        <nav className="cl-container flex h-16 items-center justify-between gap-4" aria-label="Main navigation">
          <Brand onClick={scrollToTop} />

          <ul className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-lavender-soft hover:text-ink"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onGetStarted} className="cl-btn cl-btn-primary hidden sm:inline-flex">
              Get Started
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              className="cl-btn cl-btn-ghost -mr-1.5 h-11 w-11 p-0 md:hidden"
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        {menuOpen && (
          <div id="landing-mobile-menu" className="border-t border-line bg-surface md:hidden">
            <ul className="cl-container flex flex-col gap-1 py-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-control px-3 py-3 text-sm font-medium text-ink hover:bg-lavender-soft"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onGetStarted();
                  }}
                  className="cl-btn cl-btn-primary w-full"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            </ul>
          </div>
        )}
      </header>

      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        {/* Hero */}
        <section id="home" className="cl-hero-bg scroll-mt-20 overflow-hidden">
          <div className="cl-container py-[var(--space-section)]">
            <div className="cl-stagger mx-auto max-w-3xl text-center">
              <p className="cl-badge">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                AI career guidance for students
              </p>
              {/* Each sentence of the tagline on its own line (sm and up). */}
              <h1 className="mt-5 text-display font-extrabold text-ink">
                Discover Your Career.{" "}
                <span className="cl-text-gradient block">Build Your Future.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-reading text-lg leading-relaxed text-ink-muted">
                CareerLens AI helps you explore career paths that suit your studies, skills and goals, see exactly
                which skills you still need, and follow a personalized learning roadmap to get there.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <button type="button" onClick={onGetStarted} className="cl-btn cl-btn-primary px-6 py-3 text-base">
                  Get Started
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <a href="#features" className="cl-btn cl-btn-secondary px-6 py-3 text-base">
                  Explore Features
                </a>
              </div>
              <p className="mt-4 text-sm text-ink-muted">Free to use. No account needed.</p>
            </div>
            <div className="cl-enter-late mt-14 sm:mt-16">
              <ProductPreview />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="cl-section-tint scroll-mt-20 border-y border-line/70 py-[var(--space-section)]">
          <div className="cl-container">
            <div className="cl-reveal mx-auto max-w-reading text-center">
              <p className="cl-eyebrow">Features</p>
              <h2 className="mt-2 text-heading font-bold text-ink">Everything you need to plan your next step</h2>
              <p className="mt-3 text-ink-muted">
                Three connected tools take you from exploring careers to a concrete plan for reaching one.
              </p>
            </div>

            <ul className="cl-reveal-group mt-12 grid gap-6 md:grid-cols-3">
              {FEATURES.map(({ tab, icon: Icon, title, description, points, cta }) => (
                <li key={tab} className="cl-card cl-card-interactive cl-accent-top flex flex-col p-6">
                  <span className="cl-icon-tile flex h-11 w-11 items-center justify-center rounded-control">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-subheading font-bold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</p>
                  <ul className="mt-4 space-y-2">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm text-ink">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => onOpenFeature(tab)}
                    className="cl-btn cl-btn-secondary mt-6 w-full"
                    aria-label={`Open ${title}`}
                  >
                    {cta}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 py-[var(--space-section)]">
          <div className="cl-container">
            <div className="cl-reveal mx-auto max-w-reading text-center">
              <p className="cl-eyebrow">How it works</p>
              <h2 className="mt-2 text-heading font-bold text-ink">Three steps from curiosity to a plan</h2>
            </div>
            <div className="relative mt-12">
              {/* Connector between the three steps (decorative, wide screens). */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-[16%] top-11 hidden border-t border-dashed border-lavender md:block"
              />
              <ol className="cl-reveal-group relative grid gap-6 md:grid-cols-3">
                {STEPS.map((step, i) => (
                  <li key={step.title} className="cl-card relative p-6">
                    <span className="cl-icon-tile-solid flex h-10 w-10 items-center justify-center rounded-pill font-mono text-sm font-semibold">
                      {i + 1}
                    </span>
                    <h3 className="mt-4 text-subheading font-bold text-ink">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Why CareerLens AI */}
        <section id="about" className="scroll-mt-20 border-y border-line bg-surface py-[var(--space-section)]">
          <div className="cl-container grid gap-12 lg:grid-cols-[2fr_3fr] lg:gap-16">
            <div className="cl-reveal">
              <p className="cl-eyebrow">Why CareerLens AI</p>
              <h2 className="mt-2 text-heading font-bold text-ink">Career guidance designed for students</h2>
              <p className="mt-4 leading-relaxed text-ink-muted">
                Choosing a career path can feel overwhelming. CareerLens AI turns what you already know about
                yourself into clear options and a practical plan, so you can focus on learning the right things.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                Guidance is generated by Google Gemini. Use it alongside advice from teachers, mentors and career
                counsellors.
              </p>
            </div>
            <ul className="cl-reveal-group grid gap-5 sm:grid-cols-2">
              {VALUES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="cl-card p-5">
                  <span className="cl-icon-tile flex h-10 w-10 items-center justify-center rounded-control">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 font-display text-base font-bold text-ink">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-[var(--space-section)]">
          <div className="cl-container">
            <div className="cl-reveal cl-cta-panel rounded-panel px-6 py-12 text-center sm:px-12 sm:py-16">
              <h2 className="mx-auto max-w-reading text-heading font-bold text-white">
                Start your career discovery journey
              </h2>
              <p className="mx-auto mt-3 max-w-reading text-white/80">
                Tell CareerLens AI about yourself and get personalized career paths, a skill gap analysis and a
                learning roadmap.
              </p>
              <button type="button" onClick={onGetStarted} className="cl-btn cl-btn-primary mt-8 px-6 py-3 text-base">
                Get Started
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="cl-container flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between">
          <div>
            <Brand />
            <p className="mt-3 text-sm text-ink-muted">Discover Your Career. Build Your Future.</p>
          </div>
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="inline-flex min-h-11 items-center text-ink-muted transition-colors hover:text-ink">
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <button type="button" onClick={onGetStarted} className="inline-flex min-h-11 items-center font-semibold text-primary hover:text-primary-strong">
                  Get Started
                </button>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-line">
          <p className="cl-container py-5 text-xs text-ink-muted">
            CareerLens AI · Career guidance powered by Google Gemini.
          </p>
        </div>
      </footer>
    </div>
  );
}
