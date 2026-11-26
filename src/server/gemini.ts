import { GoogleGenAI, type Schema } from "@google/genai";

const DEFAULT_MODEL = "gemini-4-hydrogen";

function getGeminiClient(): { ai: GoogleGenAI; model: string } {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets and restart."
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  return { ai, model };
}

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

function isTransientError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    msg.includes("503") ||
    msg.includes("unavailable") ||
    msg.includes("timeout") ||
    msg.includes("econnreset")
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateStructuredJSON<T>(params: {
  systemInstruction: string;
  prompt: string;
  responseSchema: Schema;
}): Promise<T> {
  const { ai, model } = getGeminiClient();
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.prompt,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: params.responseSchema,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned an empty response. Please try again.");
      }

      return JSON.parse(stripJsonCodeFences(text)) as T;
    } catch (error) {
      lastError = error;
      if (attempt < 2 && isTransientError(error)) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
      break;
    }
  }

  if (lastError instanceof SyntaxError) {
    throw new Error("Unable to parse structured AI output. Please try again.");
  }
  throw lastError;
}

export function formatGeminiError(error: unknown): {
  message: string;
  status: number;
} {
  const rawMessage =
    error instanceof Error ? error.message : "An unexpected AI error occurred.";

  if (rawMessage.includes("GEMINI_API_KEY is not configured")) {
    return { message: rawMessage, status: 500 };
  }

  const lower = rawMessage.toLowerCase();
  if (
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("permission_denied")
  ) {
    return {
      message:
        "Gemini API key was rejected. Please verify your GEMINI_API_KEY in Settings > Secrets.",
      status: 401,
    };
  }

  if (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit")
  ) {
    return {
      message:
        "Gemini API rate limit or quota reached. Please wait a moment and try again.",
      status: 429,
    };
  }

  if (lower.includes("not_found") || lower.includes("404")) {
    return {
      message:
        "The configured Gemini model could not be found. Please check the model setting.",
      status: 502,
    };
  }

  return {
    message: rawMessage,
    status: 500,
  };
}
