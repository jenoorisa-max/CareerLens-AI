// Real-browser check of the Landing Page and its navigation into the app
// (headless Edge/Chrome via CDP; Gemini mocked by mock-server.mts).
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
const click = (expr: string) => js(`(${expr}).click()`);
const btnText = (t: string, scope = "document") => `[...${scope}.querySelectorAll('button, a')].find(b => b.offsetParent !== null && b.textContent.trim().includes(${JSON.stringify(t)}))`;
const onLanding = () => js(`!!document.querySelector('h1') && document.querySelector('h1').textContent.includes('Discover Your Career.') && !document.querySelector('#student-name')`);
const onApp = () => js(`location.hash === '#/app' && !!document.querySelector('aside, header') && !!document.querySelector('main') && !document.querySelector('[aria-label="Main navigation"]')`);
const noOverflow = () => js(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
async function key(k: string, code: string, vk: number, shift = false) {
  const mod = shift ? 8 : 0;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: mod });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: mod });
  await sleep(60);
}
async function goLandingFresh() {
  await send("Page.navigate", { url: BASE });
  await waitFor(`!!document.querySelector('h1')`, 60000, "landing");
  await js(`window.scrollTo(0, 0)`); await sleep(200);
}

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
try {
  await viewport(1280, 900);
  await send("Page.navigate", { url: BASE });
  await waitFor(`!!document.querySelector('h1')`, 60000, "app");
  await js(`sessionStorage.clear()`); await goLandingFresh();

  console.log("--- desktop landing");
  check("'/' shows the Landing Page (not the app)", await onLanding());
  check("tagline is the h1", (await js(`document.querySelector('h1').textContent`)) === "Discover Your Career. Build Your Future.", await js(`document.querySelector('h1').textContent`));
  check("desktop nav links visible: Home, Features, How It Works, About", await js(`['Home','Features','How It Works','About'].every(t => [...document.querySelectorAll('[aria-label="Main navigation"] a')].some(a => a.textContent === t && a.offsetParent !== null))`));
  check("no AI request made by viewing the Landing Page", api.length === 0, api);
  check("no horizontal overflow at 1280px", await noOverflow());

  await click(btnText("Explore Features"));
  await sleep(1200);
  const featTop = await js(`document.querySelector('#features').getBoundingClientRect().top`);
  check("Explore Features scrolls to the Features section (below the sticky header)", featTop >= 0 && featTop < 120, featTop);
  await click(`[...document.querySelectorAll('[aria-label="Main navigation"] a')].find(a => a.textContent === 'How It Works')`);
  await sleep(1200);
  const howTop = await js(`document.querySelector('#how-it-works').getBoundingClientRect().top`);
  check("nav 'How It Works' scrolls to its section", howTop >= 0 && howTop < 120, howTop);
  check("Landing Page stays open after in-page navigation", await onLanding());

  console.log("--- Get Started and feature navigation");
  await goLandingFresh();
  await click(btnText("Get Started"));
  await waitFor(`!!document.querySelector('#student-name')`, 10000, "app after Get Started");
  check("Get Started opens the existing app (Career Finder form) at #/app", (await onApp()) && (await js(`location.hash`)) === "#/app");
  check("app opens scrolled to the top", (await js(`window.scrollY`)) === 0, await js(`window.scrollY`));
  await js(`history.back()`); await sleep(500);
  check("browser Back returns to the Landing Page", await onLanding());

  for (const [feature, expectText, tabLabel] of [
    ["AI Career Finder", "Your Student Profile", "Career Finder"],
    ["Skill Gap Analyzer", "Complete Career Finder First", "Skill Gap Analyzer"],
    ["Personalized Learning Roadmap", "Start with Career Finder", "Learning Roadmap"],
  ]) {
    await goLandingFresh();
    await click(`document.querySelector('[aria-label="Open ${feature}"]')`);
    await waitFor(`document.body.innerText.includes(${JSON.stringify(expectText)})`, 10000, feature);
    const crumb = await js(`document.querySelector('#app-page-title')?.textContent ?? ''`);
    check(`'${feature}' card opens the existing ${tabLabel} view`, (await onApp()) && crumb.includes(tabLabel), crumb);
  }
  check("opening features without a profile sent no AI request", api.length === 0, api);

  console.log("--- home link from the app, and a real assessment survives the round trip");
  await click(`document.querySelector('aside [aria-label="CareerLens AI home"]')`);
  await sleep(400);
  check("sidebar brand returns to the Landing Page (hash cleared)", (await onLanding()) && (await js(`location.hash`)) === "", await js(`location.hash`));
  await click(btnText("Get Started"));
  await waitFor(`!!document.querySelector('#student-name')`, 10000, "app");
  await click(btnText("Try Sample Profile")); await sleep(300);
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Analyze Skill Gap'))`, 30000, "careers");
  const before = api.length;
  await click(`document.querySelector('aside [aria-label="CareerLens AI home"]')`); await sleep(300);
  await click(btnText("Get Started"));
  await waitFor(`document.body.innerText.includes('Profile Synthesis')`, 10000, "results kept");
  check("Landing → app keeps the current assessment (results still shown, no new request)", api.length === before, api.slice(before));
  await js(`window.__beforeReload = true`); await send("Page.reload");
  // wait for the NEW page (the old one is marked), so no check runs mid-navigation
  await waitFor(`!window.__beforeReload && document.readyState === 'complete' && document.body.innerText.includes('Profile Synthesis')`, 30000, "reload in app");
  check("refresh on #/app stays in the app with the session restored", (await onApp()) && api.length === before, api.slice(before));

  console.log("--- keyboard accessibility");
  await goLandingFresh();
  await js(`document.activeElement && document.activeElement.blur()`);
  const focusOrder: string[] = [];
  for (let i = 0; i < 8; i++) { await key("Tab", "Tab", 9); focusOrder.push(await js(`(document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim()`)); }
  check("Tab reaches the skip link, brand, all four nav links and Get Started in order",
    ["Skip to main content", "CareerLens AI home", "Home", "Features", "How It Works", "About", "Get Started"].every((t, i) => focusOrder[i]?.startsWith(t)), focusOrder);
  const outline = await js(`getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth`);
  check("focused element shows a visible focus outline", /solid [1-9]/.test(outline), outline);

  console.log("--- tablet and mobile");
  await viewport(768, 1024, true); await goLandingFresh();
  check("tablet 768px: no horizontal overflow", await noOverflow());
  await viewport(390, 844, true); await goLandingFresh();
  check("mobile 390px: no horizontal overflow", await noOverflow());
  check("mobile: desktop nav links hidden, menu button shown",
    (await js(`[...document.querySelectorAll('[aria-label="Main navigation"] ul a')].every(a => a.offsetParent === null)`)) && (await js(`!!document.querySelector('[aria-controls="landing-mobile-menu"]').offsetParent`)));
  await click(`document.querySelector('[aria-controls="landing-mobile-menu"]')`); await sleep(200);
  check("mobile menu opens (aria-expanded=true, links visible)",
    (await js(`document.querySelector('[aria-controls="landing-mobile-menu"]').getAttribute('aria-expanded')`)) === "true" && (await js(`document.querySelectorAll('#landing-mobile-menu a').length`)) === 4);
  await key("Escape", "Escape", 27); await sleep(150);
  check("Escape closes the menu and returns focus to the menu button",
    !(await js(`!!document.querySelector('#landing-mobile-menu')`)) && (await js(`document.activeElement === document.querySelector('[aria-controls="landing-mobile-menu"]')`)));
  await click(`document.querySelector('[aria-controls="landing-mobile-menu"]')`); await sleep(200);
  await click(`[...document.querySelectorAll('#landing-mobile-menu a')].find(a => a.textContent === 'Features')`); await sleep(1200);
  check("tapping a menu link closes the menu and scrolls to the section",
    !(await js(`!!document.querySelector('#landing-mobile-menu')`)) && (await js(`Math.abs(document.querySelector('#features').getBoundingClientRect().top) < 120`)));
  await click(`document.querySelector('[aria-controls="landing-mobile-menu"]')`); await sleep(200);
  await click(`[...document.querySelectorAll('#landing-mobile-menu button')].find(b => b.textContent.includes('Get Started'))`);
  await waitFor(`location.hash === '#/app'`, 10000, "mobile get started");
  check("mobile menu 'Get Started' opens the app", await onApp());
  check("mobile app header brand returns to the Landing Page",
    await (async () => { await click(`document.querySelector('header [aria-label="CareerLens AI home"]')`); await sleep(300); return onLanding(); })());

  check("no console errors or exceptions in the browser", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
