// Prompt builders and system instructions shared by the Vercel functions
// (api/*.ts) and the local Express server (server.ts). Wording moved verbatim
// from server.ts, which is the standard for production.
import type {
  CareerRecommendation,
  SkillGapAnalysis,
  StudentProfile,
} from "../types/career.ts";

export const SYSTEM_INSTRUCTIONS = {
  careers:
    "You are CareerLens AI, an expert academic and career advisor helping students discover practical, fulfilling career paths. Always provide accurate, encouraging, and concrete guidance.",
  skillGap:
    "You are CareerLens AI, a rigorous yet supportive career skills assessor. Give concrete, structured, beginner-friendly skill gap feedback.",
  roadmap:
    "You are CareerLens AI, a practical curriculum designer and mentor for students. Create clear, structured, actionable learning roadmaps.",
} as const;

export function buildCareersPrompt(profile: StudentProfile): string {
  return `Analyze this student's background and recommend exactly 3 realistic, high-potential career paths tailored specifically to them. Avoid generic filler—explicitly connect their field of study, current skills, interests, and stated goals.

Student Profile:
- Name: ${profile.name}
- Education Level: ${profile.educationLevel}
- Field of Study: ${profile.fieldOfStudy}
- Current Skills: ${profile.skills.join(", ")}
- Interests: ${profile.interests.join(", ")}
- Career Goals: ${profile.careerGoals}

Ensure the 3 career paths offer meaningful variety (for example, a direct fit, an interdisciplinary fit, and a high-growth specialization) while remaining genuinely achievable for someone at their stage.`;
}

export function buildSkillGapPrompt(
  profile: StudentProfile,
  career: CareerRecommendation
): string {
  return `Perform a practical, honest Skill Gap Analysis for ${profile.name}, who wants to pursue the career: "${career.title}".

Student Context:
- Education Level: ${profile.educationLevel}
- Field of Study: ${profile.fieldOfStudy}
- Current Skills: ${profile.skills.join(", ")}
- Interests: ${profile.interests.join(", ")}
- Career Goals: ${profile.careerGoals}

Target Career Context:
- Career Title: ${career.title}
- Summary: ${career.tagline}
- Core Skills Typically Expected: ${career.coreSkills.join(", ")}

Identify:
1. Essential or transferable skills they ALREADY have from their skills or field of study (be encouraging yet accurate; do not invent skills they did not mention).
2. Key skills they are MISSING for an entry-level or junior path into ${career.title}.
3. A clear prioritized learning sequence explaining what to focus on first and why.`;
}

export function buildRoadmapPrompt(
  profile: StudentProfile,
  career: CareerRecommendation,
  skillGap: SkillGapAnalysis | null
): string {
  const gapContext = skillGap
    ? `
Skill Gap Context (Already Assessed):
- Readiness Score: ${skillGap.readinessScore}%
- Existing Strengths: ${skillGap.skillsYouHave.map((s) => s.skill).join(", ") || "Foundational academic background"}
- Missing Skills to Cover: ${skillGap.missingSkills.map((m) => `${m.skill} (${m.importance})`).join(", ")}
- Top Priorities: ${skillGap.priorities.map((p) => `${p.rank}. ${p.skill}`).join(", ")}`
    : `
Target Core Skills: ${career.coreSkills.join(", ")}`;

  return `Create a practical, beginner-friendly 4-stage Personalized Learning Roadmap for ${profile.name} to break into "${career.title}".

Student Profile:
- Education Level: ${profile.educationLevel}
- Field of Study: ${profile.fieldOfStudy}
- Existing Skills: ${profile.skills.join(", ")}
- Interests: ${profile.interests.join(", ")}
- Career Goals: ${profile.careerGoals}
${gapContext}

Requirements:
- Build progressively from Stage 1 (Foundations tailored to what they still need) to Stage 4 (Portfolio & Job Readiness).
- Suggest widely respected, beginner-friendly resources (use real, searchable titles/platforms like freeCodeCamp, Coursera, Official Docs, Kaggle, Roadmap.sh, MIT OpenCourseWare, etc., without inventing fake URLs).
- Include concrete, motivating hands-on projects in every stage that connect to ${profile.interests.join(" & ")} where natural.`;
}
