import { Type, type Schema } from "@google/genai";
import { generateStructuredJSON, formatGeminiError } from "../src/server/gemini.ts";
import type {
  StudentProfile,
  CareerRecommendation,
  SkillGapAnalysis,
  LearningRoadmapData,
} from "../src/types/career";

const roadmapSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    careerTitle: { type: Type.STRING },
    totalDuration: { type: Type.STRING },
    overview: { type: Type.STRING },
    stages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stageNumber: { type: Type.INTEGER },
          title: { type: Type.STRING },
          duration: { type: Type.STRING },
          goal: { type: Type.STRING },
          topics: { type: Type.ARRAY, items: { type: Type.STRING } },
          tools: { type: Type.ARRAY, items: { type: Type.STRING } },
          resources: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                type: {
                  type: Type.STRING,
                  enum: ["Course", "Documentation", "Book", "Video", "Practice", "Community"],
                },
                description: { type: Type.STRING },
              },
              required: ["title", "type", "description"],
            },
          },
          project: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              deliverables: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["title", "description", "deliverables"],
          },
        },
        required: [
          "stageNumber", "title", "duration", "goal",
          "topics", "tools", "resources", "project",
        ],
      },
    },
    careerLaunchTip: { type: Type.STRING },
  },
  required: [
    "careerTitle", "totalDuration", "overview", "stages", "careerLaunchTip",
  ],
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { profile, career, skillGap } = (req.body ?? {}) as {
      profile?: StudentProfile;
      career?: CareerRecommendation;
      skillGap?: SkillGapAnalysis | null;
    };

    if (!profile || !career?.title) {
      return res.status(400).json({
        error: "Student profile and a selected career are required.",
      });
    }

    const gapContext = skillGap
      ? `
Skill Gap Context:
- Readiness Score: ${skillGap.readinessScore}%
- Existing Strengths: ${skillGap.skillsYouHave.map((s) => s.skill).join(", ")}
- Missing Skills: ${skillGap.missingSkills.map((s) => `${s.skill} (${s.importance})`).join(", ")}
- Top Priorities: ${skillGap.priorities.map((p) => `${p.rank}. ${p.skill}`).join(", ")}`
      : `Target Core Skills: ${career.coreSkills.join(", ")}`;

    const prompt = `Create a practical, beginner-friendly 4-stage Personalized Learning Roadmap for ${profile.name} to enter "${career.title}".

Student Profile:
- Education: ${profile.educationLevel}
- Field: ${profile.fieldOfStudy}
- Skills: ${profile.skills.join(", ")}
- Interests: ${profile.interests.join(", ")}
- Goals: ${profile.careerGoals}

${gapContext}

Requirements:
- Progress from Stage 1 (Foundations) to Stage 4 (Portfolio & Job Readiness).
- Include 4 progressive learning stages.
- Suggest real, beginner-friendly resources such as freeCodeCamp, Coursera, official documentation, Kaggle and MIT OpenCourseWare.
- Include practical tools and one hands-on project in every stage.
- Make the roadmap actionable and tailored to the student's starting point.`;

    const data = await generateStructuredJSON<LearningRoadmapData>({
      systemInstruction:
        "You are CareerLens AI, a practical curriculum designer and mentor. Create clear, structured and actionable learning roadmaps.",
      prompt,
      responseSchema: roadmapSchema,
    });

    return res.status(200).json({ data });
  } catch (error) {
    const result = formatGeminiError(error);
    return res.status(result.status).json({ error: result.message });
  }
}
