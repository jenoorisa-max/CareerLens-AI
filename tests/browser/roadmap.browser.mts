// Real-browser check of the redesigned Learning Roadmap (run with MOCK_SKILLGAP=ok
// and MOCK_DELAY_MS so the loading state is observable). Gemini is mocked by
// mock-server.mts; every AI request is counted.
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
const careerBtn = (t: string) => `[...document.querySelectorAll('[aria-labelledby="roadmap-career-label"] button')].find(b => b.textContent.trim() === ${JSON.stringify(t)})`;
const stageBtn = (n: number) => `document.querySelectorAll('ol article')[${n - 1}].querySelector('button')`;
const stageText = (n: number) => js(`document.querySelectorAll('ol article')[${n - 1}].innerText`);
const statuses = () => js(`[...document.querySelectorAll('ol article')].map(a => /Current stage/.test(a.innerText) ? 'current' : /Upcoming/.test(a.innerText) ? 'upcoming' : /Complete\\b/.test(a.innerText) ? 'completed' : '?').join()`);
const text = (t: string) => js(`document.body.innerText.includes(${JSON.stringify(t)})`);
const title = () => js(`document.querySelector('#app-page-title')?.textContent`);
const count = (p: string) => api.filter((x) => x === p).length;
const live = () => js(`document.querySelector('[aria-live="polite"]')?.textContent`);
const noOverflow = () => js(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
const loaded = `[...document.querySelectorAll('button')].some(b => b.textContent.includes('Mark Complete') || b.textContent.includes('Completed'))`;
async function key(k: string, code: string, vk: number) {
  // a carriage-return text makes Enter activate a focused button, as a real keypress does
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, ...(k === "Enter" ? { text: "\r" } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); await sleep(120);
}
async function reload(label: string) {
  await js(`window.__beforeReload = true`); await send("Page.reload");
  // wait for the NEW page (the old one is marked), so no check runs mid-navigation
  await waitFor(`!window.__beforeReload && document.readyState === 'complete' && !!document.querySelector('#app-page-title')`, 30000, label);
  await sleep(400);
}

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
try {
  await viewport(1280, 900);
  await send("Page.navigate", { url: APP });
  await waitFor(`!!document.querySelector('#student-name')`, 60000, "app");
  await js(`sessionStorage.clear()`); await reload("fresh");

  console.log("--- empty state");
  await nav("Learning Roadmap"); await sleep(300);
  check("before Career Finder: 'Start with Career Finder', no request", (await text("Start with Career Finder")) && api.length === 0, api);

  console.log("--- generation, loading and overview");
  await js(`${btn("Go to Career Finder")}.click()`); await sleep(300);
  await js(`${btn("Try Sample Profile")}.click()`); await sleep(200);
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`!!document.querySelector('[aria-label="Build Learning Roadmap for Mock Career 1"]')`, 30000, "careers");
  await js(`document.querySelector('[aria-label="Build Learning Roadmap for Mock Career 1"]').click()`);
  await waitFor(`document.querySelector('[role=status]')?.innerText.includes('Building your personalized roadmap for Mock Career 1')`, 5000, "loading");
  check("loading: status message, Regenerate and career buttons disabled",
    (await js(`${btn("Regenerate")}.disabled`)) && (await js(`[...document.querySelectorAll('[aria-labelledby="roadmap-career-label"] button')].every(b => b.disabled)`)));
  await waitFor(loaded, 30000, "roadmap");
  check("exactly one roadmap request; title 'Learning Roadmap'", count("/api/roadmap") === 1 && (await title()) === "Learning Roadmap", api);
  check("overview from returned data: role, overview, 8 weeks, 4 stages, 0/4 Stages",
    (await text("Target Role · Mock Career 1")) && (await text("Overview")) && (await text("8 weeks")) && (await text("4 stages")) && (await text("0/4 Stages")));
  check("timeline: 4 stages; stage 1 current, others upcoming (written as text)", (await statuses()) === "current,upcoming,upcoming,upcoming", await statuses());
  const stage1Text: string = await stageText(1);
  check("stage content kept: title, duration, goal, topic, tool, resource + type, project, deliverable",
    ["Stage 01", "Stage 1", "2 weeks", "Goal: Goal", "Topic", "Tool", "Resource", "Course", "Desc", "Project", "One"].every((s) => stage1Text.toLowerCase().includes(s.toLowerCase())), stage1Text);

  console.log("--- completion tracking (keyboard)");
  await js(`${stageBtn(1)}.focus()`); await key("Enter", "Enter", 13);
  check("Enter on stage 1 'Mark Complete' -> Completed; 1/4 Stages; bar 25%",
    (await js(`${stageBtn(1)}.textContent.includes('Completed')`)) && (await text("1/4 Stages")) && (await js(`document.querySelector('[aria-label="Roadmap progress"]').getAttribute('aria-valuenow')`)) === "1" &&
    (await js(`document.querySelector('[aria-label="Roadmap progress"] > div').style.width`)) === "25%");
  check("status moves: stage 1 complete, stage 2 current; next stage named", (await statuses()) === "completed,current,upcoming,upcoming" && (await text("Next stage: Stage 2")), await statuses());
  check("progress announced in the live region", (await live()) === "1 of 4 stages complete.", await live());
  check("focus stays on the toggled button", await js(`document.activeElement === ${stageBtn(1)}`));
  await js(`${stageBtn(3)}.click()`); await sleep(150);
  check("ticking stage 3 out of order: 2/4, stage 2 still current", (await text("2/4 Stages")) && (await statuses()) === "completed,current,completed,upcoming", await statuses());
  await js(`${stageBtn(3)}.click()`); await sleep(150);
  check("un-ticking stage 3 returns to 1/4", (await text("1/4 Stages")) && (await statuses()) === "completed,current,upcoming,upcoming");
  check("completion sends no AI request", count("/api/roadmap") === 1, api);

  console.log("--- caching, refresh and navigation");
  await js(`${careerBtn("Mock Career 2")}.click()`);
  await waitFor(`${careerBtn("Mock Career 2")}.getAttribute('aria-pressed') === 'true' && ${loaded}`, 30000, "career 2");
  check("other career: 1 new request, its own progress (0/4)", count("/api/roadmap") === 2 && (await text("0/4 Stages")), api);
  await js(`${careerBtn("Mock Career 1")}.click()`); await sleep(400);
  check("back to Mock Career 1: cached (no request), progress 1/4 kept", count("/api/roadmap") === 2 && (await text("1/4 Stages")), api);
  const n0 = api.length;
  await reload("refresh");
  check("refresh: roadmap and 1/4 progress restored, no request", (await title()) === "Learning Roadmap" && (await text("1/4 Stages")) && (await statuses()) === "completed,current,upcoming,upcoming" && api.length === n0, api.slice(n0));
  await nav("Dashboard"); await sleep(300);
  check("Dashboard shows the same real progress (1/4, next Stage 2)", (await text("1/4")) && (await text("Next stage: Stage 2")));
  await nav("Career Finder"); await sleep(300);
  check("Career Finder results still there", await text("Profile Synthesis"));
  await nav("Learning Roadmap"); await sleep(300);
  check("back to the roadmap via sidebar: cached, no request", (await text("1/4 Stages")) && api.length === n0, api.slice(n0));
  await nav("Skill Gap Analyzer");
  await waitFor(`document.body.innerText.includes('Skills You Already Have')`, 30000, "skill gap");
  await js(`${btn("Generate Learning Roadmap")}.click()`); await sleep(500);
  check("Skill Gap 'Generate Learning Roadmap' opens the cached roadmap (only the skill-gap request was sent)", (await title()) === "Learning Roadmap" && (await text("1/4 Stages")) && api.slice(n0).join() === "/api/skill-gap", api.slice(n0));

  console.log("--- actions");
  await js(`window.__printed = 0; window.print = () => { window.__printed++; }`);
  await js(`${btn("Print Plan")}.click()`);
  check("Print Plan calls the browser's print", (await js(`window.__printed`)) === 1);
  const n1 = api.length;
  await js(`${btn("Regenerate")}.click()`);
  await waitFor(`!${btn("Regenerate")}.disabled && ${loaded}`, 30000, "regenerate");
  check("Regenerate: exactly 1 request, that career's progress cleared (0/4), stage 1 current", api.slice(n1).join() === "/api/roadmap" && (await text("0/4 Stages")) && (await statuses()).startsWith("current"), api.slice(n1));

  console.log("--- responsive");
  for (const [w, h, m] of [[1280, 900, false], [1024, 800, false], [768, 1024, true], [390, 844, true]] as [number, number, boolean][]) {
    await viewport(w, h, m); await sleep(300);
    check(`${w}px: no horizontal overflow`, await noOverflow());
  }
  check("390px: status still written in each stage card (timeline rail hidden)", (await statuses()) === "current,upcoming,upcoming,upcoming");
  check("no console errors or exceptions", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
