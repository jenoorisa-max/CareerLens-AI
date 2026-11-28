// Real-browser check of the redesigned Dashboard and app navigation
// (headless Edge/Chrome via CDP; Gemini mocked by mock-server.mts, all 200).
const BASE = "http://localhost:3123/";
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
async function waitFor(e: string, ms: number, label: string) { const t = Date.now(); while (Date.now() - t < ms) { if (await js(e)) return; await sleep(150); } throw new Error("timeout: " + label); }
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d !== undefined ? "  [" + JSON.stringify(d) + "]" : ""}`); };
const viewport = (w: number, h: number, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
const visibleBtn = (t: string, scope = "document") => `[...${scope}.querySelectorAll('button, a')].find(b => b.offsetParent !== null && b.textContent.trim().includes(${JSON.stringify(t)}))`;
const click = (expr: string) => js(`(${expr}).click()`);
const nav = (label: string) => click(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes(${JSON.stringify(label)}))`);
const text = (t: string) => js(`document.body.innerText.includes(${JSON.stringify(t)})`);
const title = () => js(`document.querySelector('#app-page-title')?.textContent`);
const noOverflow = () => js(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
async function key(k: string, code: string, vk: number) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
  await sleep(80);
}

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
try {
  await viewport(1280, 900);
  await send("Page.navigate", { url: BASE + "#/app" });
  await waitFor(`!!document.querySelector('aside')`, 60000, "app");
  await js(`sessionStorage.clear(); window.__beforeReload = true`); await send("Page.reload");
  // wait for the NEW page (the old one is marked), so no check runs mid-navigation
  await waitFor(`!window.__beforeReload && document.readyState === 'complete' && !!document.querySelector('#student-name')`, 30000, "reload");

  console.log("--- sidebar and empty Dashboard");
  check("sidebar shows Dashboard, Career Finder, Skill Gap Analyzer, Learning Roadmap, CV Analyzer",
    await js(`['Dashboard','Career Finder','Skill Gap Analyzer','Learning Roadmap','CV Analyzer'].every(t => [...document.querySelectorAll('aside nav button')].some(b => b.textContent.includes(t)))`));
  check("current page marked with aria-current=page (Career Finder for a new user)",
    (await js(`document.querySelector('aside nav button[aria-current="page"]')?.textContent`))?.includes("Career Finder"));
  await nav("Dashboard"); await sleep(300);
  check("Dashboard opens; topbar title 'Dashboard'", (await title()) === "Dashboard" && (await text("Welcome to CareerLens AI")), await title());
  check("empty state: 'Start with Career Finder', no numbers or progress", (await text("Start with Career Finder")) && !(await js(`!!document.querySelector('main [role="progressbar"]')`)));
  check("viewing the Dashboard sent no AI request", api.length === 0, api);
  await click(visibleBtn("Open Career Finder"));
  await waitFor(`!!document.querySelector('#student-name')`, 5000, "finder");
  check("next-step 'Open Career Finder' opens the existing form", (await title()) === "Career Finder");

  console.log("--- journey driven from the Dashboard (requests only on click)");
  await click(visibleBtn("Try Sample Profile")); await sleep(300);
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Analyze Skill Gap'))`, 30000, "careers");
  await nav("Dashboard"); await sleep(300);
  const afterCareers = api.length;
  check("Dashboard after Career Finder: real name, 3 matches, next step names the career",
    (await text("Welcome back, Amina")) && (await text("Your career matches")) && (await text("Analyze your skill gap for Mock Career 1")), null);
  check("no readiness/roadmap panels before that data exists", !(await text("Skill readiness")) && !(await text("Roadmap progress")));
  await click(visibleBtn("Analyze skill gap"));
  await waitFor(`document.body.innerText.includes('Skills You Already Have')`, 30000, "skill gap");
  check("next-step button runs the existing Skill Gap Analyzer (exactly 1 request)", api.slice(afterCareers).join() === "/api/skill-gap" && (await title()) === "Skill Gap Analyzer", api.slice(afterCareers));
  await nav("Dashboard"); await sleep(300);
  check("Dashboard shows real readiness from the analysis", (await text("Skill readiness")) && (await text("60%")) && (await text("Build your learning roadmap for Mock Career 1")));
  const beforeView = api.length;
  await click(visibleBtn("View skill gap"));
  await sleep(500);
  check("'View skill gap' reuses the cached result (no new request)", api.length === beforeView && (await title()) === "Skill Gap Analyzer", api.slice(beforeView));
  await nav("Dashboard"); await sleep(300);
  await click(visibleBtn("Build roadmap"));
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Mark Complete'))`, 30000, "roadmap");
  check("next-step 'Build roadmap' runs the existing roadmap (1 request)", api.slice(beforeView).join() === "/api/roadmap" && (await title()) === "Learning Roadmap", api.slice(beforeView));
  await click(visibleBtn("Mark Complete")); await sleep(200);
  await nav("Dashboard"); await sleep(300);
  check("Dashboard shows real roadmap progress 1/4 and the next stage", (await text("1/4")) && (await text("Next stage: Stage 2")) && (await text("Continue your roadmap: Stage 2")));

  console.log("--- persistence, refresh, Back and Landing Page");
  const beforeReload = api.length;
  await send("Page.reload"); await waitFor(`!!document.querySelector('#app-page-title')`, 30000, "reload");
  await sleep(500);
  check("refresh on the Dashboard: Dashboard restored with assessment and 1/4 progress, no request",
    (await title()) === "Dashboard" && (await text("1/4")) && (await text("Welcome back, Amina")) && api.length === beforeReload, api.slice(beforeReload));
  await click(`document.querySelector('[aria-label="Back to the CareerLens AI home page"]')`); await sleep(400);
  check("topbar 'Home' returns to the Landing Page", (await js(`location.hash`)) === "" && (await js(`!!document.querySelector('[aria-label="Main navigation"]')`)));
  await click(visibleBtn("Get Started"));
  await waitFor(`location.hash === '#/app'`, 5000, "back to app");
  check("Landing 'Get Started' returns to where the student left off (Dashboard), no request",
    (await title()) === "Dashboard" && (await text("1/4")) && api.length === beforeReload, api.slice(beforeReload));
  await js(`history.back()`); await sleep(400);
  check("browser Back returns to the Landing Page", await js(`!!document.querySelector('[aria-label="Main navigation"]')`));
  await js(`history.forward()`); await sleep(400);
  check("browser Forward returns to the app", (await js(`location.hash`)) === "#/app" && !!(await title()));

  for (const [label, expected] of [["Career Finder", "Career Finder"], ["Skill Gap Analyzer", "Skill Gap Analyzer"], ["Learning Roadmap", "Learning Roadmap"]]) {
    await nav("Dashboard"); await sleep(200);
    const before = api.length;
    await click(`[...document.querySelectorAll('main button')].find(b => b.textContent.includes(${JSON.stringify(label)}) && b.textContent.includes('Open'))`);
    await sleep(400);
    check(`quick access '${label}' opens the existing view with cached data (no request)`, (await title()) === expected && api.length === before, api.slice(before));
  }
  check("roadmap progress still intact after navigation", await text("1/4 Stages"));

  console.log("--- tablet and mobile");
  await viewport(1024, 800); await sleep(300);
  check("1024px (desktop sidebar): no horizontal overflow", await noOverflow());
  await viewport(768, 1024, true); await nav("Dashboard").catch(() => {}); await sleep(300);
  check("tablet 768px: mobile header with menu button and page title, no overflow",
    (await js(`!!document.querySelector('[aria-controls="app-mobile-drawer"]').offsetParent`)) && (await noOverflow()));
  await viewport(390, 844, true); await sleep(300);
  check("mobile 390px: no horizontal overflow", await noOverflow());
  await click(`document.querySelector('[aria-controls="app-mobile-drawer"]')`); await sleep(250);
  check("menu opens a drawer dialog with the 5 navigation items (incl. CV Analyzer), focus moved into it",
    (await js(`document.querySelector('#app-mobile-drawer')?.getAttribute('role')`)) === "dialog" &&
    (await js(`document.querySelectorAll('#app-mobile-drawer nav button').length`)) === 5 &&
    (await js(`document.querySelector('#app-mobile-drawer').contains(document.activeElement)`)));
  await key("Escape", "Escape", 27);
  check("Escape closes the drawer and returns focus to the menu button",
    !(await js(`!!document.querySelector('#app-mobile-drawer')`)) && (await js(`document.activeElement === document.querySelector('[aria-controls="app-mobile-drawer"]')`)));
  await click(`document.querySelector('[aria-controls="app-mobile-drawer"]')`); await sleep(250);
  await click(`[...document.querySelectorAll('#app-mobile-drawer nav button')].find(b => b.textContent.includes('Learning Roadmap'))`); await sleep(300);
  check("choosing an item navigates and closes the drawer", !(await js(`!!document.querySelector('#app-mobile-drawer')`)) && (await text("1/4 Stages")));
  check("mobile header shows the current page title", await js(`document.querySelector('header').innerText.includes('Learning Roadmap')`));

  check("no console errors or exceptions in the browser", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
