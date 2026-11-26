import React from "react";
import {
  Compass,
  BarChart3,
  Map,
  RotateCcw,
  CheckCircle2,
  User,
} from "lucide-react";
import type {
  ActiveTab,
  CareerRecommendation,
  StudentProfile,
} from "../types/career";

interface SidebarNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  profile: StudentProfile | null;
  hasCareers: boolean;
  selectedCareer: CareerRecommendation | null;
  hasSkillGap: boolean;
  hasRoadmap: boolean;
  onReset: () => void;
}

export default function SidebarNav({
  activeTab,
  onSelectTab,
  profile,
  hasCareers,
  selectedCareer,
  hasSkillGap,
  hasRoadmap,
  onReset,
}: SidebarNavProps) {
  const navItems: Array<{
    id: ActiveTab;
    step: string;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
    status: string;
    completed: boolean;
  }> = [
    {
      id: "finder",
      step: "01",
      label: "Career Finder",
      subtitle: "Profile & 3 AI matches",
      icon: <Compass className="h-4 w-4" />,
      status: hasCareers ? "3 Matches" : "Start",
      completed: hasCareers,
    },
    {
      id: "skill-gap",
      step: "02",
      label: "Skill Gap Analyzer",
      subtitle: "Strengths & priorities",
      icon: <BarChart3 className="h-4 w-4" />,
      status: hasSkillGap ? "Ready" : "Step 2",
      completed: hasSkillGap,
    },
    {
      id: "roadmap",
      step: "03",
      label: "Learning Roadmap",
      subtitle: "Stages, tools & projects",
      icon: <Map className="h-4 w-4" />,
      status: hasRoadmap ? "Ready" : "Step 3",
      completed: hasRoadmap,
    },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[272px] lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#E8E1F8] bg-[#FAF8FF] z-20">
        <div className="flex flex-col h-full px-5 py-6">
          {/* Brand Wordmark */}
          <div className="pb-5 border-b border-[#E8E1F8]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4C1D95] text-white">
                <Compass className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span className="block text-[17px] font-extrabold tracking-tight text-[#18132A] whitespace-nowrap">
                  CareerLens <span className="text-[#5B21B6]">AI</span>
                </span>
                <span className="block text-[11px] font-medium text-slate-500 truncate">
                  Discover Your Career. Build Your Future.
                </span>
              </div>
            </div>
          </div>

          {/* Workflow Navigation */}
          <nav className="mt-6 flex-1 space-y-1.5" aria-label="Dashboard navigation">
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400">
              Workflow
            </p>
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B21B6] ${
                    isActive
                      ? "bg-[#EFE8FF] text-[#4C1D95]"
                      : "text-slate-600 hover:bg-[#F3EEFF]/80 hover:text-[#4C1D95]"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isActive
                          ? "bg-[#5B21B6] text-white"
                          : "bg-white border border-[#E8E1F8] text-[#5B21B6]"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate whitespace-nowrap">
                        {item.label}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`ml-2 inline-flex items-center gap-1 text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0 ${
                      item.completed ? "font-semibold text-[#5B21B6]" : "text-slate-400"
                    }`}
                  >
                    {item.completed && <CheckCircle2 className="h-3 w-3" />}
                    {item.status}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Active Student Context */}
          <div className="mt-auto pt-5 border-t border-[#E8E1F8] space-y-3">
            {profile ? (
              <div className="rounded-xl bg-white border border-[#E8E1F8] p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#5B21B6]">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span>Active Student</span>
                </div>
                <div className="text-sm font-bold text-[#18132A] truncate">
                  {profile.name}
                </div>
                <div className="text-xs text-slate-600 truncate">
                  {profile.educationLevel} · {profile.fieldOfStudy}
                </div>
                {selectedCareer && (
                  <div className="pt-2.5 border-t border-[#EFEAF9]">
                    <span className="block text-[11px] font-medium text-slate-400">
                      Selected Path
                    </span>
                    <p className="text-xs font-semibold text-[#4C1D95] truncate">
                      {selectedCareer.title}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-white border border-[#E8E1F8] p-4 text-xs text-slate-600 leading-relaxed">
                Complete your student profile to unlock 3 AI career matches, skill gap insights, and a custom roadmap.
              </div>
            )}

            {hasCareers && (
              <button
                type="button"
                onClick={onReset}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#DDD3F6] bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-[#F3EEFF] hover:text-[#4C1D95] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B21B6]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Assessment
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Compact Header + Segmented Switcher (capped well under 15% height) */}
      <header className="lg:hidden sticky top-0 z-30 border-b border-[#E8E1F8] bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 h-13">
          <span className="text-base font-extrabold tracking-tight text-[#18132A] whitespace-nowrap shrink-0">
            CareerLens <span className="text-[#5B21B6]">AI</span>
          </span>

          {hasCareers && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E1F8] bg-[#FAF8FF] px-3 py-1.5 text-xs font-semibold text-[#4C1D95] whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 px-3 pb-2.5">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-[#5B21B6] text-white"
                    : "bg-[#FAF8FF] text-slate-600 hover:text-[#4C1D95]"
                }`}
              >
                {item.icon}
                <span className="truncate">
                  {item.id === "finder"
                    ? "Finder"
                    : item.id === "skill-gap"
                    ? "Skill Gap"
                    : "Roadmap"}
                </span>
              </button>
            );
          })}
        </div>
      </header>
    </>
  );
}
