import { Type, type Schema } from "@google/genai";
import { generateStructuredJSON, formatGeminiError } from "../src/server/gemini";
import type { StudentProfile, CareerFinderResponse } from "../src/types/career";

const careerFinderSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    profileSummary: { type: Type.STRING },
    careers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          matchScore: { type: Type.INTEGER },
          tagline: { type: Type.STRING },
          explanation: { type: Type.STRING },
          whyItFitsProfile: { type: Type.STRING },
          dayToDay: { type: Type.ARRAY, items: { type: Type.STRING } },
          coreSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
          growthOutlook: { type: Type.STRING },
        },
        required: [
          "id", "title", "matchScore", "tagline", "explanation",
          "whyItFitsProfile", "dayToDay", "coreSkills", "growthOutlook",
        ],
      },
    },
  },
  required: ["profileSummary", "careers"],
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = (req.body ?? {}) as Partial<StudentProfile>;

    if (!body.name?.trim()) return res.status(400).json({ error: "Please enter your name." });
    if (!body.educationLevel?.trim()) return res.status(400).json({ error: "Please select your education level." });
    if (!body.fieldOfStudy?.trim()) return res.status(400).json({ error: "Please enter your field of study." });
    if (!Array.isArray(body.skills) || !body.skills.length) return res.status(400).json({ error: "Please add at least one current skill." });
    if (!Array.isArray(body.interests) || !body.interests.length) return res.status(400).json({ error: "Please add at least one interest." });
    if (!body.careerGoals?.trim()) return res.status(400).json({ error: "Please describe your career goals." });

    const profile: StudentProfile = {
      name: body.name.trim(),
      educationLevel: body.educationLevel.trim(),
      fieldOfStudy: body.fieldOfStudy.trim(),
      skills: body.skills.map(String),
      interests: body.interests.map(String),
      careerGoals: body.careerGoals.trim(),
    };

    const prompt = `Recommend exactly 3 realistic career paths tailored to this student.

Name: ${profile.name}
Education: ${profile.educationLevel}
Field: ${profile.fieldOfStudy}
Skills: ${profile.skills.join(", ")}
Interests: ${profile.interests.join(", ")}
Goals: ${profile.careerGoals}

Give meaningful variety and explain how each career fits the student's background.`;

    const data = await generateStructuredJSON<CareerFinderResponse>({
      systemInstruction: "You are CareerLens AI, an expert academic and career advisor. Give accurate, encouraging and practical guidance.",
      prompt,
      responseSchema: careerFinderSchema,
    });

    if (!data.careers?.length) {
      return res.status(502).json({ error: "Unable to generate career recommendations. Please try again." });
    }

    return res.status(200).json({
      data: { ...data, careers: data.careers.slice(0, 3) },
    });
  } catch (error) {
    const result = formatGeminiError(error);
    return res.status(result.status).json({ error: result.message });
  }
}
