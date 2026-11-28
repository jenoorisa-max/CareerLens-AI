// Real-browser check of the Career Finder error state (run with
// MOCK_CAREERS_STATUS=400: Gemini rejects the career search, no retries, no cooldown).
const APP = "http://localhost:3123/#/app";
const page = (await (await fetch("http://127.0.0.1:9333/json/list")).json()).find((t: any) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map<number, (m: any) => void>(); const api: string[] = []; const errors: string[] = [];
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/")) api.push(new URL(m.params.request.url).pathname);
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.text ?? "exception");
};
const send = (method: string, params: object = {}) => new Promise<any>((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (e: string) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(e: string, ms: number, label: string) { const t = Date.now(); while (Date.now() - t < ms) { if (await js(e)) return; await sleep(150); } throw new Error("timeout: " + label); }
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d !== undefined ? "  [" + JSON.stringify(d) + "]" : ""}`); };
const btn = (t: string) => `[...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.trim().includes(${JSON.stringify(t)}))`;

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
try {
  await send("Page.navigate", { url: APP });
  await waitFor(`!!document.querySelector('#student-name')`, 60000, "app");
  await js(`sessionStorage.clear(); window.__beforeReload = true`); await send("Page.reload");
  // wait for the NEW page (the old one is marked), so no check runs mid-navigation
  await waitFor(`!window.__beforeReload && document.readyState === 'complete' && !!document.querySelector('#student-name')`, 30000, "reload");
  await js(`${btn("Try Sample Profile")}.click()`); await sleep(200);
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`document.body.innerText.includes("We couldn't generate career paths")`, 30000, "error notice");
  check("error state: notice (role=alert) with a safe message, no raw error text",
    (await js(`[...document.querySelectorAll('[role=alert]')].some(a => a.innerText.includes("We couldn't generate career paths"))`)) &&
    !(await js(`/Mock failure|INVALID_ARGUMENT|stack/i.test(document.body.innerText)`)));
  check("no previous-assessment text when there was no earlier assessment", !(await js(`document.body.innerText.includes('previous assessment')`)));
  check("form keeps the student's details", (await js(`document.querySelector('#student-name').value`)) === "Amina Tariq");
  check("no results shown", !(await js(`document.body.innerText.includes('Profile Synthesis')`)));
  const tryAgain = await js(`!!${btn("Try again")}`);
  check("'Try again' offered for a retryable server error", tryAgain);
  const before = api.length;
  if (tryAgain) await js(`${btn("Try again")}.click()`);
  await sleep(1500);
  check("'Try again' resends exactly one career request", api.length === before + 1 && api[api.length - 1] === "/api/careers", api);
  check("no uncaught exceptions", errors.length === 0, errors);
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
