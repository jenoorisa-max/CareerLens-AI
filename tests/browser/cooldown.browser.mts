// Drives headless Edge via the Chrome DevTools Protocol (built-in WebSocket, no deps)
// to check the D3 cooldown in a real browser.
const APP = "http://localhost:3123/#/app"; // application view (Landing Page is at "/")
const targets = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const page = targets.find((t: any) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map<number, (m: any) => void>(); const apiRequests: string[] = []; const consoleErrors: string[] = [];
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/")) apiRequests.push(`${m.params.request.method} ${new URL(m.params.request.url).pathname}`);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((a: any) => a.value ?? a.description).join(" "));
};
const send = (method: string, params: object = {}) => new Promise<any>((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (expr: string) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(expr: string, timeoutMs: number, label: string) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const v = await js(expr); if (v) return v; await sleep(200); }
  throw new Error(`timeout waiting for: ${label}`);
}
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${d !== undefined ? "  [" + JSON.stringify(d) + "]" : ""}`); };
const btn = (text: string) => `[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)}))`;
const btnInfo = (sel: string) => js(`(() => { const b = ${sel}; return b ? { text: b.textContent.trim(), disabled: b.disabled } : null })()`);

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
// Track the app's 500ms countdown intervals to verify cleanup.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
  const live = new Set(); const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { const id = si(fn, ms, ...a); if (ms === 500) live.add(id); return id; };
  window.clearInterval = (id) => { live.delete(id); return ci(id); };
  window.__liveCountdownIntervals = () => live.size; })();` });
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

try {
  await send("Page.navigate", { url: APP });
  await waitFor(`!!${btn("Try Sample Profile")}`, 60000, "app loaded");
  check("app loaded in real browser (Edge headless)", true);
  check("no countdown timer running without a cooldown", (await js("window.__liveCountdownIntervals()")) === 0, await js("window.__liveCountdownIntervals()"));

  await js(`${btn("Try Sample Profile")}.click()`); await sleep(300);
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`!!${btn("Analyze Skill Gap")}`, 30000, "careers rendered");
  check("career search succeeded (mock 200) and results rendered", true);

  await js(`${btn("Analyze Skill Gap")}.click()`);
  console.log("      (server retries the 503 with backoff ~7-10s...)");
  const t503 = Date.now();
  await waitFor(`/Try again in \\d+s/.test(${btn("Try again in")}?.textContent ?? '')`, 40000, "cooldown on Re-analyze");
  const ra1 = await btnInfo(btn("Try again in"));
  check("after 503: Re-analyze shows 'Try again in Ns' and is disabled", /Try again in 1[45]s/.test(ra1.text) && ra1.disabled, ra1);
  const notice = await js(`document.body.innerText.includes("The AI service is busy. You can try again in")`);
  check("inline notice shows the cooldown countdown", notice);
  check("exactly one countdown timer running", (await js("window.__liveCountdownIntervals()")) === 1, await js("window.__liveCountdownIntervals()"));
  const stored = Number(await js(`sessionStorage.getItem("careerlens:cooldownUntil")`));
  const remaining = stored - (await js("Date.now()"));
  check("cooldown end time saved in sessionStorage (~15s ahead)", remaining > 12000 && remaining <= 15000, remaining);

  const reqsBefore = apiRequests.length;
  await js(`[...document.querySelectorAll('nav button, header button')].find(b => b.textContent.includes('Roadmap'))?.click()`); await sleep(1500);
  await js(`[...document.querySelectorAll('nav button, header button')].find(b => b.textContent.includes('Skill Gap'))?.click()`); await sleep(300);
  check("tab switching during cooldown sends no /api request", apiRequests.length === reqsBefore, apiRequests.slice(reqsBefore));
  const ra2 = await btnInfo(btn("Try again in"));
  check("countdown decreases over time", ra2 && Number(ra2.text.match(/\d+/)?.[0]) < Number(ra1.text.match(/\d+/)?.[0]), [ra1.text, ra2?.text]);

  // Refresh persistence
  // (D4 restores the Skill Gap tab after a refresh, so the restored Re-analyze button is checked.)
  const reqsBeforeReload = apiRequests.length;
  await send("Page.reload", { ignoreCache: false });
  await waitFor(`document.readyState === 'complete' && !!${btn("Try again in")}`, 30000, "reloaded with countdown");
  await sleep(800);
  const sub1 = await btnInfo(btn("Try again in"));
  check("after REFRESH: session restored and cooldown persists (Re-analyze shows countdown, disabled)", /Try again in \d+s/.test(sub1.text) && sub1.disabled, sub1);
  check("after REFRESH: resuming the interrupted skill gap sent NO request during cooldown", apiRequests.length === reqsBeforeReload, apiRequests.slice(reqsBeforeReload));
  const reqsAfterReload = apiRequests.length;
  await js(`${btn("Try again in")}.click()`); await sleep(500);
  check("clicking the disabled button during cooldown sends nothing", apiRequests.length === reqsAfterReload, apiRequests.slice(reqsAfterReload));
  check("one countdown timer running after refresh", (await js("window.__liveCountdownIntervals()")) === 1, await js("window.__liveCountdownIntervals()"));

  // Expiry + cleanup
  await waitFor(`(() => { const b = ${btn("Re-analyze")}; return b && !b.disabled; })()`, 20000, "cooldown expiry");
  const lateBy = (await js("Date.now()")) - stored; // vs. the saved cooldown end time
  check(`button re-enabled with its normal label right when the cooldown ended (${lateBy}ms after the saved end time)`, lateBy >= 0 && lateBy <= 1200, lateBy);
  await sleep(1500);
  check("countdown timer cleared after expiry (0 running)", (await js("window.__liveCountdownIntervals()")) === 0, await js("window.__liveCountdownIntervals()"));
  check("no /api requests fired automatically when the cooldown ended", apiRequests.length === reqsAfterReload, apiRequests.slice(reqsAfterReload));
  check("no console errors in the browser", consoleErrors.length === 0, consoleErrors.slice(0, 3));
} catch (e) {
  fail++; console.log("FAIL  " + (e as Error).message);
}
console.log(`\napi requests seen: ${JSON.stringify(apiRequests)}`);
console.log(`${pass} passed, ${fail} failed`);
ws.close();
process.exit(fail ? 1 : 0);
