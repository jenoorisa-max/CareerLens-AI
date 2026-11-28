// Optional inline file input for generateStructuredJSON (CV Analyzer, Stage 2).
// Offline: the global fetch used by the Gemini SDK is replaced by a mock that
// records every request, so no request ever leaves this machine.
const FAKE_KEY = "AIzaSyFAKE_PARTS_KEY_0123456789abcdefgh";
process.env.GEMINI_API_KEY = FAKE_KEY;
delete process.env.GEMINI_MODEL;

const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const { generateStructuredJSON, formatGeminiError, GEMINI_INLINE_MIME_TYPES } = await import(`${root}/src/server/gemini.ts`);
const { Type } = await import(`${root}/node_modules/@google/genai/dist/node/index.mjs`);

let pass = 0, fail = 0;
// Key-order-independent JSON (the SDK serialises "role" after "parts").
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)?.slice(0, 400)}`); };

// ------------------------------------------------------------- fetch mock
type Step = { status: number; body: unknown };
let requests: { url: string; body: any; raw: string }[] = [];
let plan: Step[] = [];
globalThis.fetch = (async (url: unknown, init: { body?: string } = {}) => {
  requests.push({ url: String(url), body: JSON.parse(String(init.body)), raw: String(init.body) });
  const step = plan[Math.min(requests.length - 1, plan.length - 1)];
  return new Response(JSON.stringify(step.body), { status: step.status, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const ok = (obj: unknown): Step => ({ status: 200, body: { candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP" }] } });
const malformed: Step = { status: 200, body: { candidates: [{ content: { role: "model", parts: [{ text: "{not json" }] }, finishReason: "STOP" }] } };
const httpError = (status: number, message = "mock error"): Step => ({ status, body: { error: { code: status, message, status: "MOCK" } } });

const logs: string[] = [];
const origError = console.error;
console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };

const schema = { type: Type.OBJECT, properties: { a: { type: Type.STRING } }, required: ["a"] };
const base = { systemInstruction: "You are a test assistant.", prompt: "Read the attached CV.", responseSchema: schema };
async function call(extra: object, steps: Step[]) {
  requests = []; plan = steps; logs.length = 0;
  try { return { data: await generateStructuredJSON({ ...base, ...extra }) }; }
  catch (error) { return { error }; }
}

// Small, valid base64 payloads (content is irrelevant to the mock).
const PDF = Buffer.from("%PDF-1.4\n% test\n").toString("base64");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]).toString("base64");

console.log("--- text-only requests are unchanged");
const textOnly = await call({}, [ok({ a: "x" })]);
const textBody = requests[0].body;
check("text-only call returns the data", (textOnly as any).data?.a === "x", textOnly);
check("text-only contents: one user turn with only the prompt text (the SDK's form of the plain string)",
  canon(textBody.contents) === canon([{ role: "user", parts: [{ text: base.prompt }] }]), textBody.contents);
check("text-only request has no inline data anywhere", !requests[0].raw.includes("inlineData"));
check("model is still gemini-3.1-flash-lite", requests[0].url.includes("/models/gemini-3.1-flash-lite:generateContent"), requests[0].url);
check("structured-output config unchanged (JSON mime type, schema, system instruction)",
  textBody.generationConfig?.responseMimeType === "application/json" && !!textBody.generationConfig?.responseSchema &&
  canon(textBody.systemInstruction) === canon({ role: "user", parts: [{ text: base.systemInstruction }] }), textBody);
const emptyParts = await call({ parts: [] }, [ok({ a: "x" })]);
check("parts: [] sends a byte-identical request to text-only", requests[0].raw === JSON.stringify(textBody), requests[0].raw);
check("parts: [] returns the same data", (emptyParts as any).data?.a === "x");

console.log("--- PDF and image parts use the SDK's inlineData structure");
const withParts = await call({ parts: [{ mimeType: "application/pdf", data: PDF }, { mimeType: "image/png", data: PNG }, { mimeType: "image/jpeg", data: JPG }] }, [ok({ a: "y" })]);
const pb = requests[0].body;
const withPartsUrl = requests[0].url;
check("call with parts returns the data", (withParts as any).data?.a === "y", withParts);
check("one user turn: files first (in order), then the prompt text",
  canon(pb.contents) === canon([{ role: "user", parts: [
    { inlineData: { mimeType: "application/pdf", data: PDF } },
    { inlineData: { mimeType: "image/png", data: PNG } },
    { inlineData: { mimeType: "image/jpeg", data: JPG } },
    { text: base.prompt },
  ] }]), pb.contents);
check("file data passed through unchanged (base64, no data: prefix)", pb.contents[0].parts[0].inlineData.data === PDF && !requests[0].raw.includes("data:application"));
const textUrl = (await call({}, [ok({ a: "x" })]), requests[0].url);
check("everything except contents is identical to the text-only request (same URL/model, config, system instruction)",
  withPartsUrl === textUrl && JSON.stringify({ ...pb, contents: null }) === JSON.stringify({ ...textBody, contents: null }), { withPartsUrl, textUrl });
check("accepted types are exactly PDF, PNG and JPEG", JSON.stringify(GEMINI_INLINE_MIME_TYPES) === JSON.stringify(["application/pdf", "image/png", "image/jpeg"]));

console.log("--- invalid parts are rejected before any request, without leaking data");
const bad: Array<[string, unknown]> = [
  ["DOCX mime type", { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: PDF }],
  ["GIF mime type", { mimeType: "image/gif", data: PNG }],
  ["empty data", { mimeType: "image/png", data: "" }],
  ["data: URL prefix", { mimeType: "application/pdf", data: `data:application/pdf;base64,${PDF}` }],
  ["non-base64 characters", { mimeType: "image/jpeg", data: "not base64!!" }],
  ["missing data", { mimeType: "image/jpeg" }],
];
for (const [label, part] of bad) {
  const r = await call({ parts: [part] }, [ok({ a: "never" })]);
  const f = formatGeminiError((r as any).error);
  check(`${label}: rejected with no Gemini request and a safe generic message`,
    !!(r as any).error && requests.length === 0 && f.status >= 500 && !/base64|mime|part/i.test(f.message), { requests: requests.length, f });
}
const secretData = "QUJD".repeat(300); // 1,200 base64 chars
await call({ parts: [{ mimeType: "image/gif", data: secretData }] }, [ok({ a: "never" })]);
check("rejection log names the problem, never the file data", logs.length === 1 && logs[0].includes("unsupported mimeType") && !logs[0].includes("QUJDQUJD"), logs);

console.log("--- retry, backoff and error handling are unchanged with parts");
const parts = [{ mimeType: "image/png", data: PNG }];
const retried = await call({ parts }, [malformed, ok({ a: "z" })]);
check("malformed JSON is retried once and then succeeds (2 requests)", (retried as any).data?.a === "z" && requests.length === 2, requests.length);
check("the retry re-sends the same files", requests.length === 2 && requests[0].raw === requests[1].raw);
const validated = await call({ parts, validate: (d: any) => (typeof d?.a === "string" ? null : "a") }, [ok({ b: 1 }), ok({ a: "v" })]);
check("invalid response shape is retried once with parts", (validated as any).data?.a === "v" && requests.length === 2, requests.length);
const nonRetry = await call({ parts }, [httpError(400)]);
const f400 = formatGeminiError((nonRetry as any).error);
const partsRequests400 = requests.length;
const textNonRetry = await call({}, [httpError(400)]);
check("HTTP 400 with parts is not retried (1 request) and maps to exactly the same safe message/status as text-only",
  partsRequests400 === 1 && requests.length === 1 && JSON.stringify(formatGeminiError((textNonRetry as any).error)) === JSON.stringify(f400), { partsRequests400, f400 });
const authErr = await call({ parts }, [httpError(400, "API key not valid. Please pass a valid API key.")]);
check("an invalid-key error with parts still maps to the same message as text-only",
  JSON.stringify(formatGeminiError((authErr as any).error)) === JSON.stringify(formatGeminiError((await call({}, [httpError(400, "API key not valid. Please pass a valid API key.")]) as any).error)));
if (!process.argv.includes("--fast")) {
  const t0 = Date.now();
  const overloaded = await call({ parts }, [httpError(503), ok({ a: "after-overload" })]);
  const waited = Date.now() - t0;
  check("503 with parts uses the overload backoff (>= 2s) and then succeeds", (overloaded as any).data?.a === "after-overload" && requests.length === 2 && waited >= 2000, { waited, n: requests.length });
}

console.log("--- logs never contain the API key or file data");
const echo = "A".repeat(400) + "==";
await call({ parts }, [httpError(400, `bad payload ${echo} key=${FAKE_KEY}`)]);
const line = logs.join("\n");
check("failure log present", line.includes("[gemini] request failed"), logs);
check("API key redacted in logs", !line.includes(FAKE_KEY) && line.includes("[REDACTED]"), line);
check("long base64 run (file data) redacted in logs", !line.includes("A".repeat(200)) && line.includes("[DATA]"), line);
check("logs never contain the PNG data sent", !logs.some((l) => l.includes(PNG)));

console.error = origError;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
