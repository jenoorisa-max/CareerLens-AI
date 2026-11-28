export type ActiveTab = "dashboard" | "finder" | "skill-gap" | "roadmap";

export interface StudentProfile {
  name: string;
  educationLevel: string;
  fieldOfStudy: string;
  skills: string[];
  interests: string[];
  careerGoals: string;
}

export interface CareerRecommendation {
  id: string;
  title: string;
  matchScore: number;
  tagline: string;
  explanation: string;
  whyItFitsProfile: string;
  dayToDay: string[];
  coreSkills: string[];
  growthOutlook: string;
}

export interface CareerFinderResponse {
  profileSummary: string;
  careers: CareerRecommendation[];
}

export interface ExistingSkillItem {
  skill: string;
  howItTransfers: string;
}

export interface MissingSkillItem {
  skill: string;
  importance: "Essential" | "Important" | "Helpful";
  whyItMatters: string;
}

export interface PriorityStep {
  rank: number;
  skill: string;
  timeframe: string;
  reason: string;
  actionTip: string;
}

export interface SkillGapAnalysis {
  careerTitle: string;
  readinessScore: number;
  readinessSummary: string;
  skillsYouHave: ExistingSkillItem[];
  missingSkills: MissingSkillItem[];
  priorities: PriorityStep[];
}

export interface RoadmapResource {
  title: string;
  type: "Course" | "Documentation" | "Book" | "Video" | "Practice" | "Community";
  description: string;
}

export interface RoadmapProject {
  title: string;
  description: string;
  deliverables: string[];
}

export interface RoadmapStage {
  stageNumber: number;
  title: string;
  duration: string;
  goal: string;
  topics: string[];
  tools: string[];
  resources: RoadmapResource[];
  project: RoadmapProject;
}

export interface LearningRoadmapData {
  careerTitle: string;
  totalDuration: string;
  overview: string;
  stages: RoadmapStage[];
  careerLaunchTip: string;
}
