import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Type, type Schema } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { formatGeminiError, generateStructuredJSON } from "./src/server/gemini.ts";
import type {
  CareerFinderResponse,
  CareerRecommendation,
  LearningRoadmapData,
  SkillGapAnalysis,
  StudentProfile,
} from "./src/types/career.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const careerFinderSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    profileSummary: {
      type: Type.STRING,
      description:
        "A warm, insightful 2-3 sentence synthesis of the student's strengths and direction.",
    },
    careers: {
      type: Type.ARRAY,
      description: "Exactly 3 distinct, well-matched career paths.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "URL-safe slug identifier" },
          title: { type: Type.STRING, description: "Clear, standard job/career title" },
          matchScore: {
            type: Type.INTEGER,
            description: "Match percentage between 75 and 99",
          },
          tagline: {
            type: Type.STRING,
            description: "Short 6-10 word summary of the career",
          },
          explanation: {
            type: Type.STRING,
            description: "Clear 2-3 sentence explanation of what this career entails",
          },
          whyItFitsProfile: {
            type: Type.STRING,
            description:
              "Specific explanation connecting the student's education, skills, interests, and goals to this role",
          },
          dayToDay: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "3 concise bullet points describing typical day-to-day work",
          },
          coreSkills: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "5 essential skills required for this career",
          },
          growthOutlook: {
            type: Type.STRING,
            description: "Concise market demand and growth outlook note",
          },
        },
        required: [
          "id",
          "title",
          "matchScore",
          "tagline",
          "explanation",
          "whyItFitsProfile",
          "dayToDay",
          "coreSkills",
          "growthOutlook",
        ],
      },
    },
  },
  required: ["profileSummary", "careers"],
};

const skillGapSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    careerTitle: { type: Type.STRING },
    readinessScore: {
      type: Type.INTEGER,
      description: "Estimated current readiness percentage from 10 to 95",
    },
    readinessSummary: {
      type: Type.STRING,
      description:
        "2-3 sentences evaluating how well-prepared the student currently is and their biggest opportunity.",
    },
    skillsYouHave: {
      type: Type.ARRAY,
      description:
        "Relevant skills the student already possesses (directly or transferably).",
      items: {
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          howItTransfers: {
            type: Type.STRING,
            description: "How this existing skill helps in the target career",
          },
        },
        required: ["skill", "howItTransfers"],
      },
    },
    missingSkills: {
      type: Type.ARRAY,
      description: "5-7 key skills or competencies the student needs to acquire.",
      items: {
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          importance: {
            type: Type.STRING,
            enum: ["Essential", "Important", "Helpful"],
          },
          whyItMatters: {
            type: Type.STRING,
            description: "Concrete explanation of why this skill is needed in the role",
          },
        },
        required: ["skill", "importance", "whyItMatters"],
      },
    },
    priorities: {
      type: Type.ARRAY,
      description: "Ordered top 4-5 skills to learn first, ranked 1..N.",
      items: {
        type: Type.OBJECT,
        properties: {
          rank: { type: Type.INTEGER },
          skill: { type: Type.STRING },
          timeframe: {
            type: Type.STRING,
            description: "Realistic beginner estimate, e.g., '2-3 weeks'",
          },
          reason: {
            type: Type.STRING,
            description: "Why this skill should be prioritized at this rank",
          },
          actionTip: {
            type: Type.STRING,
            description: "One practical first step the student can take this week",
          },
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

const roadmapSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    careerTitle: { type: Type.STRING },
    totalDuration: {
      type: Type.STRING,
      description: "Estimated total timeline, e.g., '14–16 Weeks (Part-time)'",
    },
    overview: {
      type: Type.STRING,
      description: "Encouraging 2-3 sentence overview tailored to the student's starting point.",
    },
    stages: {
      type: Type.ARRAY,
      description: "4 progressive, beginner-friendly learning stages.",
      items: {
        type: Type.OBJECT,
        properties: {
          stageNumber: { type: Type.INTEGER },
          title: { type: Type.STRING },
          duration: { type: Type.STRING, description: "e.g., 'Weeks 1–3'" },
          goal: { type: Type.STRING, description: "Clear outcome of completing this stage" },
          topics: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "4-5 specific topics to study",
          },
          tools: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "3-5 practical tools, frameworks, or platforms used in this stage",
          },
          resources: {
            type: Type.ARRAY,
            description:
              "3 beginner-friendly learning resources (real, well-known resources without fabricated URLs)",
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
            description: "One hands-on beginner-friendly project for this stage",
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              deliverables: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3 concrete deliverables for the project",
              },
            },
            required: ["title", "description", "deliverables"],
          },
        },
        required: [
          "stageNumber",
          "title",
          "duration",
          "goal",
          "topics",
          "tools",
          "resources",
          "project",
        ],
      },
    },
    careerLaunchTip: {
      type: Type.STRING,
      description:
        "Practical closing advice on internships, networking, or portfolio presentation for this role.",
    },
  },
  required: ["careerTitle", "totalDuration", "overview", "stages", "careerLaunchTip"],
};

function validateProfile(body: Partial<StudentProfile>): string | null {
  if (!body.name?.trim()) return "Please enter your name.";
  if (!body.educationLevel?.trim()) return "Please select your education level.";
  if (!body.fieldOfStudy?.trim()) return "Please enter your field of study.";
  if (!Array.isArray(body.skills) || body.skills.length === 0) {
    return "Please add at least one current skill.";
  }
  if (!Array.isArray(body.interests) || body.interests.length === 0) {
    return "Please add at least one interest.";
  }
  if (!body.careerGoals?.trim()) return "Please describe your career goals.";
  return null;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/careers", async (req, res) => {
    try {
      const body = (req.body ?? {}) as Partial<StudentProfile>;
      const validationError = validateProfile(body);

      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const profile: StudentProfile = {
        name: body.name!.trim(),
        educationLevel: body.educationLevel!.trim(),
        fieldOfStudy: body.fieldOfStudy!.trim(),
        skills: body.skills!.map((s) => String(s).trim()).filter(Boolean),
        interests: body.interests!.map((i) => String(i).trim()).filter(Boolean),
        careerGoals: body.careerGoals!.trim(),
      };

      const prompt = `Analyze this student's background and recommend exactly 3 realistic, high-potential career paths tailored specifically to them. Avoid generic filler—explicitly connect their field of study, current skills, interests, and stated goals.

Student Profile:
- Name: ${profile.name}
- Education Level: ${profile.educationLevel}
- Field of Study: ${profile.fieldOfStudy}
- Current Skills: ${profile.skills.join(", ")}
- Interests: ${profile.interests.join(", ")}
- Career Goals: ${profile.careerGoals}

Ensure the 3 career paths offer meaningful variety (for example, a direct fit, an interdisciplinary fit, and a high-growth specialization) while remaining genuinely achievable for someone at their stage.`;

      const data = await generateStructuredJSON<CareerFinderResponse>({
        systemInstruction:
          "You are CareerLens AI, an expert academic and career advisor helping students discover practical, fulfilling career paths. Always provide accurate, encouraging, and concrete guidance.",
        prompt,
        responseSchema: careerFinderSchema,
      });

      if (!data.careers || data.careers.length === 0) {
        return res.status(502).json({
          error: "Unable to generate career recommendations. Please try again.",
        });
      }

      return res.json({
        data: { ...data, careers: data.careers.slice(0, 3) },
      });
    } catch (error) {
      const { message, status } = formatGeminiError(error);
      return res.status(status).json({ error: message });
    }
  });

  app.post("/api/skill-gap", async (req, res) => {
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

      const prompt = `Perform a practical, honest Skill Gap Analysis for ${profile.name}, who wants to pursue the career: "${career.title}".

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

      const data = await generateStructuredJSON<SkillGapAnalysis>({
        systemInstruction:
          "You are CareerLens AI, a rigorous yet supportive career skills assessor. Give concrete, structured, beginner-friendly skill gap feedback.",
        prompt,
        responseSchema: skillGapSchema,
      });

      return res.json({ data });
    } catch (error) {
      const { message, status } = formatGeminiError(error);
      return res.status(status).json({ error: message });
    }
  });

  app.post("/api/roadmap", async (req, res) => {
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
Skill Gap Context (Already Assessed):
- Readiness Score: ${skillGap.readinessScore}%
- Existing Strengths: ${skillGap.skillsYouHave.map((s) => s.skill).join(", ") || "Foundational academic background"}
- Missing Skills to Cover: ${skillGap.missingSkills.map((m) => `${m.skill} (${m.importance})`).join(", ")}
- Top Priorities: ${skillGap.priorities.map((p) => `${p.rank}. ${p.skill}`).join(", ")}`
        : `
Target Core Skills: ${career.coreSkills.join(", ")}`;

      const prompt = `Create a practical, beginner-friendly 4-stage Personalized Learning Roadmap for ${profile.name} to break into "${career.title}".

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

      const data = await generateStructuredJSON<LearningRoadmapData>({
        systemInstruction:
          "You are CareerLens AI, a practical curriculum designer and mentor for students. Create clear, structured, actionable learning roadmaps.",
        prompt,
        responseSchema: roadmapSchema,
      });

      return res.json({ data });
    } catch (error) {
      const { message, status } = formatGeminiError(error);
      return res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*path}", (_req, res) => {
      const indexFile = path.join(distDir, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Application build not found.");
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`CareerLens AI server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
