import React, { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Compass,
  FileText,
  LayoutDashboard,
  Map,
  Menu,
  RotateCcw,
  X,
} from "lucide-react";
import type {
  ActiveTab,
  CareerRecommendation,
  StudentProfile,
} from "../types/career";

interface SidebarNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  /** Returns to the Landing Page (brand link). */
  onGoHome?: () => void;
  /** Current page title, shown in the mobile header. */
  pageTitle: string;
  profile: StudentProfile | null;
  hasCareers: boolean;
  selectedCareer: CareerRecommendation | null;
  hasSkillGap: boolean;
  hasRoadmap: boolean;
  onReset: () => void;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  subtitle: string;
  icon: typeof Compass;
  /** Status text from real data (never invented). */
  status?: string;
  completed?: boolean;
}

function Brand({
  onGoHome,
  compact = false,
  iconOnlyWhenNarrow = false,
}: {
  onGoHome?: () => void;
  compact?: boolean;
  /** Mobile header: below 380px show only the icon so the page title fits. */
  iconOnlyWhenNarrow?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onGoHome}
      aria-label="CareerLens AI home"
      className="flex min-h-11 min-w-11 shrink-0 items-center gap-2.5 rounded-control text-left"
    >
      <span className={`cl-icon-tile-solid flex shrink-0 items-center justify-center rounded-control ${compact ? "h-8 w-8" : "h-9 w-9"}`}>
        <Compass className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className={`block min-w-0 ${iconOnlyWhenNarrow ? "max-[379px]:hidden" : ""}`}>
        <span className="block whitespace-nowrap font-display text-[17px] font-extrabold tracking-tight text-ink">
          CareerLens <span className="text-primary">AI</span>
        </span>
        {!compact && (
          <span className="block truncate text-[11px] font-medium text-ink-muted">
            Discover Your Career. Build Your Future.
          </span>
        )}
      </span>
    </button>
  );
}

export default function SidebarNav({
  activeTab,
  onSelectTab,
  onGoHome,
  pageTitle,
  profile,
  hasCareers,
  selectedCareer,
  hasSkillGap,
  hasRoadmap,
  onReset,
}: SidebarNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", subtitle: "Overview & next steps", icon: LayoutDashboard },
    {
      id: "finder",
      label: "Career Finder",
      subtitle: "Profile & 3 AI matches",
      icon: Compass,
      status: hasCareers ? "3 Matches" : "Start",
      completed: hasCareers,
    },
    {
      id: "skill-gap",
      label: "Skill Gap Analyzer",
      subtitle: "Strengths & priorities",
      icon: BarChart3,
      status: hasSkillGap ? "Ready" : "Step 2",
      completed: hasSkillGap,
    },
    {
      id: "roadmap",
      label: "Learning Roadmap",
      subtitle: "Stages, tools & projects",
      icon: Map,
      status: hasRoadmap ? "Ready" : "Step 3",
      completed: hasRoadmap,
    },
    { id: "cv", label: "CV Analyzer", subtitle: "Score & improve your CV", icon: FileText },
  ];

  // Mobile drawer (modal): focus moves into it on open and stays inside it
  // (Tab / Shift+Tab wrap); Escape closes it and returns focus to the menu
  // button; the page behind does not scroll while it is open.
  useEffect(() => {
    if (!drawerOpen) return;
    drawerRef.current?.querySelector<HTMLElement>("nav button")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (e.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = drawerRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  const select = (tab: ActiveTab) => {
    setDrawerOpen(false);
    onSelectTab(tab);
  };

  const navList = (
    <nav className="space-y-1" aria-label="Dashboard navigation">
      {navItems.map((item) => {
        const isActive = activeTab === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => select(item.id)}
            aria-current={isActive ? "page" : undefined}
            className={`cl-press group flex w-full items-center justify-between gap-2 rounded-control px-3 py-2.5 text-left ${
              isActive ? "cl-nav-active text-primary-deep" : "text-ink-muted hover:bg-canvas hover:text-ink"
            }`}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors ${
                  isActive ? "cl-icon-tile-solid" : "border border-line bg-surface text-primary group-hover:border-lavender"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-sm font-semibold ${isActive ? "text-primary-deep" : "text-ink"}`}>
                  {item.label}
                </span>
                <span className="block truncate text-xs text-ink-muted">{item.subtitle}</span>
              </span>
            </span>
            {/* Status from real data: a check icon when done (text kept for screen
                readers), so the full label fits in the sidebar. */}
            {item.status && (
              <span className="shrink-0" title={item.status}>
                {item.completed && <CheckCircle2 className="cl-pop h-4 w-4 text-primary" aria-hidden="true" />}
                <span className="sr-only">({item.status})</span>
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-3">
      {profile ? (
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-lavender-soft font-display text-sm font-bold text-primary-strong"
              aria-hidden="true"
            >
              {profile.name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{profile.name}</p>
              <p className="truncate text-xs text-ink-muted">
                {profile.educationLevel} · {profile.fieldOfStudy}
              </p>
            </div>
          </div>
          {selectedCareer && (
            <div className="mt-3 border-t border-line pt-3">
              <span className="block text-[11px] font-medium text-ink-muted">Selected path</span>
              <p className="truncate text-xs font-semibold text-primary-strong">{selectedCareer.title}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-ink-muted">
          Complete your student profile to unlock 3 AI career matches, skill gap insights, and a custom roadmap.
        </div>
      )}

      {hasCareers && (
        <button
          type="button"
          onClick={() => {
            setDrawerOpen(false);
            onReset();
          }}
          className="cl-btn cl-btn-secondary w-full text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          New Assessment
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="cl-sidebar-bg z-20 hidden border-r border-line lg:fixed lg:inset-y-0 lg:flex lg:w-[272px] lg:flex-col">
        <div className="flex h-full flex-col px-4 py-5">
          <div className="border-b border-line px-1 pb-5">
            <Brand onGoHome={onGoHome} />
          </div>
          <p className="px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Workspace</p>
          <div className="flex-1 overflow-y-auto">{navList}</div>
          <div className="border-t border-line pt-4">{footer}</div>
        </div>
      </aside>

      {/* Mobile / tablet header */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="app-mobile-drawer"
            aria-label="Open navigation"
            className="cl-btn cl-btn-ghost -ml-1.5 h-11 w-11 shrink-0 p-0"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Brand onGoHome={onGoHome} compact iconOnlyWhenNarrow />
          <span className="ml-auto truncate text-sm font-semibold text-ink-muted">{pageTitle}</span>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full bg-ink/40 animate-enter"
          />
          <div
            id="app-mobile-drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-surface shadow-raised cl-drawer-in"
          >
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <Brand onGoHome={() => { setDrawerOpen(false); onGoHome?.(); }} compact />
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  menuButtonRef.current?.focus();
                }}
                aria-label="Close navigation"
                className="cl-btn cl-btn-ghost -mr-1.5 h-11 w-11 p-0"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">{navList}</div>
            <div className="border-t border-line p-4">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}
