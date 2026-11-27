import {
  ApiError,
  GoogleGenAI,
  type GenerateContentResponse,
  type Schema,
} from "@google/genai";

const DEFAULT_MODEL = "gemini-3.1-flash-lite";

// ---------------------------------------------------------------------------
// Timing and retry policy (all durations in milliseconds)
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;
/** Upper limit for a single Gemini attempt. */
const MAX_ATTEMPT_TIMEOUT_MS = 30_000;
/** Hard limit for the whole call: every attempt, plus the delays between them. */
const TOTAL_BUDGET_MS = 75_000;
/** Delay before attempt 2 and attempt 3 (timeouts, network, empty, JSON, shape). */
const RETRY_DELAYS_MS = [500, 1_000];
/**
 * Server overload (HTTP 500/502/503/504) gets a longer, randomised backoff so
 * the retries are spread out instead of hitting a busy model back-to-back.
 * Delay = baseMs + random jitter in [0, maxJitterMs).
 */
const OVERLOAD_RETRY_DELAYS_MS = [
  { baseMs: 2_000, maxJitterMs: 1_000 }, // before attempt 2: 2–3s
  { baseMs: 5_000, maxJitterMs: 2_000 }, // before attempt 3: 5–7s
];
/** A retry is only started if at least this much of the budget is left for it. */
const MIN_ATTEMPT_TIME_MS = 5_000;
/**
 * Reserved at the end of the budget for timer jitter and response handling,
 * so the whole call always finishes strictly inside TOTAL_BUDGET_MS.
 */
const BUDGET_SAFETY_MARGIN_MS = 250;
/** Invalid structured output (wrong response shape) is retried at most once. */
const MAX_INVALID_SHAPE_RETRIES = 1;
const RETRYABLE_HTTP_STATUSES = new Set([500, 502, 503, 504]);
const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);
const LOG_DETAIL_MAX_CHARS = 300;

// ---------------------------------------------------------------------------
// Internal failure type. `detail` is for server logs only and is never sent
// to users; formatGeminiError() maps every failure to a fixed safe message.
// ---------------------------------------------------------------------------

type FailureKind =
  | "config"
  | "http"
  | "timeout"
  | "network"
  | "empty"
  | "blocked"
  | "malformed_json"
  | "invalid_shape"
  | "unknown";

class GeminiFailure extends Error {
  readonly kind: FailureKind;
  readonly status: number | undefined;
  readonly detail: string;

  constructor(kind: FailureKind, detail: string, status?: number) {
    super(`Gemini request failed (${kind})`);
    this.name = "GeminiFailure";
    this.kind = kind;
    this.detail = detail;
    this.status = status;
  }
}

function getGeminiClient(): { ai: GoogleGenAI; model: string; apiKey: string } {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new GeminiFailure("config", "GEMINI_API_KEY is not configured");
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  return { ai, model, apiKey };
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

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(error: unknown): string | undefined {
  const own = (error as { code?: unknown } | null)?.code;
  if (typeof own === "string") return own;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof cause === "string" ? cause : undefined;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = errorCode(error);
    return `${error.name}: ${error.message}${code ? ` (${code})` : ""}`;
  }
  return String(error);
}

function isApiKeyMessage(message: string): boolean {
  return /api_key_invalid|api key not valid/i.test(message);
}

/** Converts anything thrown during a Gemini call into a classified failure. */
function toFailure(error: unknown): GeminiFailure {
  if (error instanceof GeminiFailure) return error;

  // Prefer the numeric HTTP status the SDK attaches to API errors (ApiError),
  // falling back to a numeric `status` on any other error object.
  const status =
    error instanceof ApiError ? error.status : (error as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 600) {
    return new GeminiFailure("http", describeError(error), status);
  }

  const code = errorCode(error);
  if (
    (error instanceof TypeError && error.message === "fetch failed") ||
    (code !== undefined && NETWORK_ERROR_CODES.has(code))
  ) {
    return new GeminiFailure("network", describeError(error));
  }

  return new GeminiFailure("unknown", describeError(error));
}

function isRetryable(failure: GeminiFailure): boolean {
  switch (failure.kind) {
    case "http":
      return failure.status !== undefined && RETRYABLE_HTTP_STATUSES.has(failure.status);
    case "timeout":
    case "network":
    case "empty":
    case "malformed_json":
    case "invalid_shape":
      return true;
    default:
      return false; // config, blocked, unknown
  }
}

/** Delay before the next attempt, in ms. `attempt` is the attempt that just failed. */
function retryDelayMs(failure: GeminiFailure, attempt: number): number {
  const isOverload =
    failure.kind === "http" &&
    failure.status !== undefined &&
    RETRYABLE_HTTP_STATUSES.has(failure.status);

  if (isOverload) {
    const step =
      OVERLOAD_RETRY_DELAYS_MS[attempt - 1] ??
      OVERLOAD_RETRY_DELAYS_MS[OVERLOAD_RETRY_DELAYS_MS.length - 1];
    return step.baseMs + Math.floor(Math.random() * step.maxJitterMs);
  }
  return RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

function redactSecrets(text: string, apiKey: string | undefined): string {
  let safe = text;
  if (apiKey) safe = safe.split(apiKey).join("[REDACTED]");
  return safe.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]");
}

/**
 * One concise line per failure. Never includes prompts, API keys or student
 * data: `detail` only ever holds error metadata, and JSON/shape failures only
 * describe sizes, reasons and field paths, never the content.
 */
function logFailure(
  failure: GeminiFailure,
  attempt: string,
  model: string,
  retrying: boolean,
  apiKey?: string
): void {
  const entry = {
    type: failure.kind,
    status: failure.status ?? null,
    attempt,
    model,
    retrying,
    detail: redactSecrets(failure.detail, apiKey).slice(0, LOG_DETAIL_MAX_CHARS),
  };
  console.error(`[gemini] request failed ${JSON.stringify(entry)}`);
}

async function requestWithTimeout(
  ai: GoogleGenAI,
  model: string,
  params: { systemInstruction: string; prompt: string; responseSchema: Schema },
  timeoutMs: number
): Promise<GenerateContentResponse> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const request = ai.models.generateContent({
    model,
    contents: params.prompt,
    config: {
      systemInstruction: params.systemInstruction,
      responseMimeType: "application/json",
      responseSchema: params.responseSchema,
      abortSignal: controller.signal,
    },
  });
  // If the timeout wins the race, the aborted request rejects later; that
  // rejection is expected and must not become an unhandled rejection.
  request.catch(() => undefined);

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GeminiFailure("timeout", `no response within ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function parseResponse(response: GenerateContentResponse): unknown {
  const finishReason = response.candidates?.[0]?.finishReason ?? "none";
  const text = response.text;

  if (!text || !text.trim()) {
    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      throw new GeminiFailure("blocked", `prompt blocked (blockReason=${blockReason})`);
    }
    throw new GeminiFailure("empty", `empty response (finishReason=${finishReason})`);
  }

  try {
    return JSON.parse(stripJsonCodeFences(text));
  } catch {
    // Do not log the parser message: it quotes the model output, which can
    // contain student details.
    throw new GeminiFailure(
      "malformed_json",
      `response was not valid JSON (${text.length} chars, finishReason=${finishReason})`
    );
  }
}

export async function generateStructuredJSON<T>(params: {
  systemInstruction: string;
  prompt: string;
  responseSchema: Schema;
  /**
   * Optional response-shape check. Return null when the data is usable, or a
   * short field path describing the first problem (logged, never shown to users).
   */
  validate?: (data: unknown) => string | null;
}): Promise<T> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  let client: ReturnType<typeof getGeminiClient>;
  try {
    client = getGeminiClient();
  } catch (error) {
    const failure = toFailure(error);
    logFailure(failure, "setup", process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL, false);
    throw failure;
  }
  const { ai, model, apiKey } = client;

  let invalidShapeRetries = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now() - BUDGET_SAFETY_MARGIN_MS;
    const timeoutMs = Math.min(MAX_ATTEMPT_TIMEOUT_MS, remaining);

    try {
      const response = await requestWithTimeout(ai, model, params, timeoutMs);
      const data = parseResponse(response);

      const problem = params.validate ? params.validate(data) : null;
      if (problem) {
        throw new GeminiFailure("invalid_shape", `invalid response shape at ${problem}`);
      }

      return data as T;
    } catch (error) {
      const failure = toFailure(error);
      // Computed (including jitter) before the budget check, so the check
      // accounts for the exact delay that will be slept.
      const delay = retryDelayMs(failure, attempt);

      let retrying = attempt < MAX_ATTEMPTS && isRetryable(failure);
      if (retrying && failure.kind === "invalid_shape") {
        retrying = invalidShapeRetries < MAX_INVALID_SHAPE_RETRIES;
      }
      if (
        retrying &&
        Date.now() + delay + MIN_ATTEMPT_TIME_MS + BUDGET_SAFETY_MARGIN_MS > deadline
      ) {
        retrying = false; // not enough budget left for a meaningful retry
      }

      logFailure(failure, `${attempt}/${MAX_ATTEMPTS}`, model, retrying, apiKey);

      if (!retrying) throw failure;
      if (failure.kind === "invalid_shape") invalidShapeRetries++;
      await sleep(delay);
    }
  }

  // Unreachable: the loop always returns or throws.
  throw new GeminiFailure("unknown", "retry loop exited unexpectedly");
}

// ---------------------------------------------------------------------------
// User-facing errors: fixed, friendly messages only. Raw Gemini, SDK,
// network or internal error text is never returned.
// ---------------------------------------------------------------------------

const USER_MESSAGES = {
  unavailable: "The AI service is temporarily unavailable. Please try again later.",
  busy: "The AI service is busy right now. Please try again in a moment.",
  quota: "Gemini API rate limit or quota reached. Please wait a moment and try again.",
  timeout: "The AI took too long to respond. Please try again.",
  network: "Could not reach the AI service. Please try again in a moment.",
  empty: "The AI could not generate a response this time. Please try again.",
  blocked:
    "The AI could not generate a response for these details. Please review your input and try again.",
  unreadable: "Unable to parse structured AI output. Please try again.",
  generic: "Something went wrong while generating your results. Please try again.",
} as const;

export function formatGeminiError(error: unknown): {
  message: string;
  status: number;
} {
  const failure = toFailure(error);

  switch (failure.kind) {
    case "config":
      return { message: USER_MESSAGES.unavailable, status: 500 };
    case "timeout":
      return { message: USER_MESSAGES.timeout, status: 504 };
    case "network":
      return { message: USER_MESSAGES.network, status: 503 };
    case "empty":
      return { message: USER_MESSAGES.empty, status: 502 };
    case "blocked":
      return { message: USER_MESSAGES.blocked, status: 502 };
    case "malformed_json":
    case "invalid_shape":
      return { message: USER_MESSAGES.unreadable, status: 502 };
    case "http": {
      const status = failure.status ?? 500;
      if (status === 401 || status === 403 || (status === 400 && isApiKeyMessage(failure.detail))) {
        return { message: USER_MESSAGES.unavailable, status: 401 };
      }
      if (status === 429) return { message: USER_MESSAGES.quota, status: 429 };
      if (status === 404) return { message: USER_MESSAGES.unavailable, status: 502 };
      if (RETRYABLE_HTTP_STATUSES.has(status)) return { message: USER_MESSAGES.busy, status: 503 };
      return { message: USER_MESSAGES.generic, status: 502 };
    }
    default:
      return { message: USER_MESSAGES.generic, status: 500 };
  }
}
