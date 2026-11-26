import { Type, type Schema } from "@google/genai";
import { generateStructuredJSON, formatGeminiError } from "../src/server/gemini.ts";
import type { StudentProfile, CareerRecommendation, SkillGapAnalysis } from "../src/types/career";

const skillGapSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    careerTitle: { type: Type.STRING },
    readinessScore: { type: Type.INTEGER },
    readinessSummary: { type: Type.STRING },
    skillsYouHave: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          howItTransfers: { type: Type.STRING },
        },
        required: ["skill", "howItTransfers"],
      },
    },
    missingSkills: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          importance: {
            type: Type.STRING,
            enum: ["Essential", "Important", "Helpful"],
          },
          whyItMatters: { type: Type.STRING },
        },
        required: ["skill", "importance", "whyItMatters"],
      },
    },
    priorities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rank: { type: Type.INTEGER },
          skill: { type: Type.STRING },
          timeframe: { type: Type.STRING },
          reason: { type: Type.STRING },
          actionTip: { type: Type.STRING },
        },
        required: ["rank", "skill", "timeframe", "reason", "actionTip"],
      },
    },
  },
  required: [
    "careerTitle",
    "readinessScore",
    "readinessSummary",
    "skillsYouHave",
    "missingSkills",
    "priorities",
  ],
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const { profile, career } = (req.body ?? {}) as {
      profile?: StudentProfile;
      career?: CareerRecommendation;
    };

    if (!profile || !career?.title) {
      return res.status(400).json({
        error: "Student profile and a selected career are required.",
      });
    }

    const prompt = `Perform a practical, honest Skill Gap Analysis for ${profile.name}, who wants to pursue "${career.title}".

Student Context:
- Education Level: ${profile.educationLevel}
- Field of Study: ${profile.fieldOfStudy}
- Current Skills: ${profile.skills.join(", ")}
- Interests: ${profile.interests.join(", ")}
- Career Goals: ${profile.careerGoals}

Target Career:
- Title: ${career.title}
- Summary: ${career.tagline}
- Core Skills: ${career.coreSkills.join(", ")}

Identify:
1. Relevant skills they already possess. Do not invent skills.
2. 5-7 key missing skills.
3. Top 4-5 priorities in a practical learning sequence.`;

    const data = await generateStructuredJSON<SkillGapAnalysis>({
      systemInstruction:
        "You are CareerLens AI, a rigorous yet supportive career skills assessor. Give concrete, structured, beginner-friendly feedback.",
      prompt,
      responseSchema: skillGapSchema,
    });

    return res.status(200).json({ data });
  } catch (error) {
    const result = formatGeminiError(error);
    return res.status(result.status).json({ error: result.message });
  }
}
