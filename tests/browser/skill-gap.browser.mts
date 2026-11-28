// Real-browser check of the redesigned Skill Gap Analyzer (run with
// MOCK_SKILLGAP=ok and MOCK_DELAY_MS so the loading state is observable).
// Gemini is mocked by mock-server.mts; every AI request is counted.
const APP = "http://localhost:3123/#/app";
const page = (await (await fetch("http://127.0.0.1:9333/json/list")).json()).find((t: any) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map<number, (m: any) => void>(); const api: string[] = []; const errors: string[] = [];
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/")) api.push(new URL(m.params.request.url).pathname);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(" "));
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.text ?? "exception");
};
const send = (method: string, params: object = {}) => new Promise<any>((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (e: string) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(e: string, ms: number, label: string) { const t = Date.now(); while (Date.now() - t < ms) { if (await js(e)) return; await sleep(100); } throw new Error("timeout: " + label); }
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d !== undefined ? "  [" + JSON.stringify(d) + "]" : ""}`); };
const viewport = (w: number, h: number, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
const btn = (t: string) => `[...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.trim().includes(${JSON.stringify(t)}))`;
const nav = (t: string) => js(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes(${JSON.stringify(t)})).click()`);
const careerBtn = (t: string) => `[...document.querySelectorAll('[aria-labelledby="skill-gap-career-label"] button')].find(b => b.textContent.trim() === ${JSON.stringify(t)})`;
const text = (t: string) => js(`document.body.innerText.includes(${JSON.stringify(t)})`);
const title = () => js(`document.querySelector('#app-page-title')?.textContent`);
const count = (p: string) => api.filter((x) => x === p).length;
const noOverflow = () => js(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
const results = `document.body.innerText.includes('Skills You Already Have')`;
async function key(k: string, code: string, vk: number) {
  // a carriage-return text makes Enter activate a focused button, as a real keypress does
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, ...(k === "Enter" ? { text: "\r" } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); await sleep(80);
}

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
try {
  await viewport(1280, 900);
  await send("Page.navigate", { url: APP });
  await waitFor(`!!document.querySelector('#student-name')`, 60000, "app");
  await js(`sessionStorage.clear(); window.__beforeReload = true`); await send("Page.reload");
  // wait for the NEW page (the old one is marked), so no check runs mid-navigation
  await waitFor(`!window.__beforeReload && document.readyState === 'complete' && !!document.querySelector('#student-name')`, 30000, "reload");

  console.log("--- empty state");
  await nav("Skill Gap Analyzer"); await sleep(300);
  check("before Career Finder: 'Complete Career Finder First', no request", (await text("Complete Career Finder First")) && api.length === 0, api);
  await js(`${btn("Go to Career Finder")}.click()`); await sleep(300);
  check("'Go to Career Finder' opens the form", (await title()) === "Career Finder" && (await js(`!!document.querySelector('#student-name')`)));

  console.log("--- loading and results");
  await js(`${btn("Try Sample Profile")}.click()`); await sleep(200);
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`!!document.querySelector('[aria-label="Analyze Skill Gap for Mock Career 1"]')`, 30000, "careers");
  await js(`document.querySelector('[aria-label="Analyze Skill Gap for Mock Career 1"]').click()`);
  await waitFor(`document.querySelector('[role=status]')?.innerText.includes('Analyzing your skill gap for Mock Career 1')`, 5000, "loading");
  check("loading: status message, Re-analyze and career buttons disabled",
    (await js(`${btn("Re-analyze")}.disabled`)) && (await js(`[...document.querySelectorAll('[aria-labelledby="skill-gap-career-label"] button')].every(b => b.disabled)`)));
  await waitFor(results, 30000, "analysis");
  check("exactly one skill-gap request", count("/api/skill-gap") === 1, api);
  check("readiness 60% as text and progressbar", (await text("60%")) && (await js(`document.querySelector('[aria-label="Current role readiness for Mock Career 1"]')?.getAttribute('aria-valuenow')`)) === "60");
  check("real returned data: summary, SQL (have), Statistics (Essential), priority with timeframe",
    (await text("Mock readiness.")) && (await text("SQL")) && (await js(`/essential\\s*·\\s*1/i.test(document.querySelector('[aria-labelledby="skills-missing-title"]').innerText)`)) && (await text("2 weeks")) && (await text("First step: a")), await js(`document.querySelector('[aria-labelledby="skills-missing-title"]')?.innerText`));
  check("comparison shows the career's core skills and the student's profile skills", (await text("Core skills for Mock Career 1")) && (await text("Skills on your profile")) && (await text("Python")));
  check("selected career marked aria-pressed", (await js(`${careerBtn("Mock Career 1")}.getAttribute('aria-pressed')`)) === "true");

  console.log("--- switching careers and caching");
  await js(`${careerBtn("Mock Career 2")}.click()`);
  await waitFor(`${careerBtn("Mock Career 2")}.getAttribute('aria-pressed') === 'true' && ${results}`, 30000, "career 2");
  check("switching to an unanalyzed career sends 1 request", count("/api/skill-gap") === 2, api);
  await js(`${careerBtn("Mock Career 1")}.click()`); await sleep(500);
  check("switching back to an analyzed career uses the cache (no request)", count("/api/skill-gap") === 2 && (await text("Mock readiness.")), api);
  await js(`${btn("Re-analyze")}.click()`);
  await waitFor(`!${btn("Re-analyze")}.disabled && ${results}`, 30000, "re-analyze");
  check("Re-analyze sends exactly one new request", count("/api/skill-gap") === 3, api);

  console.log("--- navigation");
  await js(`${btn("Generate Learning Roadmap")}.click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Mark Complete'))`, 30000, "roadmap");
  check("'Generate Learning Roadmap' opens the existing roadmap for the career (1 request)", count("/api/roadmap") === 1 && (await title()) === "Learning Roadmap", api);
  const before = api.length;
  await nav("Skill Gap Analyzer"); await sleep(400);
  check("sidebar back to Skill Gap: cached analysis, no request", (await js(results)) && api.length === before, api.slice(before));
  await nav("Dashboard"); await sleep(300);
  await js(`${btn("View skill gap")}.click()`); await sleep(400);
  check("Dashboard 'View skill gap' opens the cached analysis (no request)", (await title()) === "Skill Gap Analyzer" && (await js(results)) && api.length === before, api.slice(before));
  await js(`${btn("Back to Career Finder")}.click()`); await sleep(300);
  check("'Back to Career Finder' returns to results, no request", (await title()) === "Career Finder" && (await text("Profile Synthesis")) && api.length === before, api.slice(before));
  await js(`window.__beforeReload = true`); await send("Page.reload");
  await waitFor(`!window.__beforeReload && document.readyState === 'complete' && !!document.querySelector('#app-page-title')`, 30000, "reload 2");
  await nav("Skill Gap Analyzer"); await sleep(500);
  check("after refresh: analysis restored from the session, no request", (await js(results)) && api.length === before, api.slice(before));

  console.log("--- keyboard");
  await js(`${careerBtn("Mock Career 2")}.focus()`);
  check("career buttons are focusable", (await js(`document.activeElement === ${careerBtn("Mock Career 2")}`)));
  await key("Enter", "Enter", 13);
  await waitFor(`${careerBtn("Mock Career 2")}.getAttribute('aria-pressed') === 'true'`, 5000, "enter selects");
  check("Enter on a career button selects it (cached, no request)", api.length === before, api.slice(before));
  await js(`${btn("Generate Learning Roadmap")}.focus()`); await key("Tab", "Tab", 9);
  check("Tab moves from Generate Learning Roadmap to Back to Career Finder", (await js(`document.activeElement?.textContent.trim()`)) === "Back to Career Finder");

  console.log("--- responsive");
  for (const [w, h, m] of [[1280, 900, false], [1024, 800, false], [768, 1024, true], [390, 844, true]] as [number, number, boolean][]) {
    await viewport(w, h, m); await sleep(300);
    check(`${w}px: no horizontal overflow`, await noOverflow());
  }
  check("no console errors or exceptions", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
