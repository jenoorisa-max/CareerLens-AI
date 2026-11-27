// Safe JSON POST helper for the browser. It never throws: every outcome is
// returned as a result object, including network failures, client timeouts
// and non-JSON responses such as a platform HTML error page.

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string };

/**
 * The server always answers within its 75s Gemini budget, so this only stops
 * an endless spinner if something between the browser and the server hangs.
 */
export const CLIENT_TIMEOUT_MS = 95_000;

const MESSAGES = {
  network: "Could not reach CareerLens AI. Please check your connection and try again.",
  timeout: "The request took too long. Please try again.",
  tooLarge: "Your details are too long to process. Please shorten them and try again.",
  rateLimited: "Too many requests right now. Please wait a moment and try again.",
  busy: "The AI service is busy right now. Please try again in a moment.",
  gatewayTimeout: "The AI took too long to respond. Please try again.",
  server: "Something went wrong on our side. Please try again.",
} as const;

function messageForStatus(status: number, fallback: string): string {
  if (status === 413) return MESSAGES.tooLarge;
  if (status === 429) return MESSAGES.rateLimited;
  if (status === 502 || status === 503) return MESSAGES.busy;
  if (status === 504) return MESSAGES.gatewayTimeout;
  if (status >= 500) return MESSAGES.server;
  return fallback;
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * POSTs `body` as JSON and expects `{ data }` on success or `{ error }` on
 * failure (the existing CareerLens API format). `fallbackMessage` is used when
 * a failed response carries no usable error text. `status` is 0 when no HTTP
 * response was received (network failure or client timeout).
 */
export async function postJSON<T>(
  url: string,
  body: unknown,
  fallbackMessage: string
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CLIENT_TIMEOUT_MS);

  try {
    let response: Response;
    let text: string;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      text = await response.text();
    } catch {
      return { ok: false, status: 0, message: timedOut ? MESSAGES.timeout : MESSAGES.network };
    }

    const payload = parseJSON(text);
    const record =
      payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as { data?: unknown; error?: unknown })
        : null;

    if (response.ok && record && record.data !== undefined && record.data !== null) {
      return { ok: true, status: response.status, data: record.data as T };
    }

    const serverMessage =
      record && typeof record.error === "string" && record.error.trim()
        ? record.error.trim()
        : null;

    return {
      ok: false,
      status: response.status,
      message: serverMessage ?? messageForStatus(response.status, fallbackMessage),
    };
  } finally {
    clearTimeout(timer);
  }
}
