// Gemini response schemas shared by the Vercel functions (api/*.ts) and the
// local Express server (server.ts). Moved verbatim from server.ts so both
// entry points request the same structured output.
import { Type, type Schema } from "@google/genai";

export const careerFinderSchema: Schema = {
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

export const skillGapSchema: Schema = {
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

export const roadmapSchema: Schema = {
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
