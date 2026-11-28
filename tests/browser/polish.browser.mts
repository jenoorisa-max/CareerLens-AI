// Real-browser check of the Phase 1 global polish across all five pages: motion
// runs normally, is switched off under prefers-reduced-motion, keyboard focus is
// visible, and no page overflows horizontally. Run with MOCK_SKILLGAP=ok and
// MOCK_DELAY_MS (so loading states are observable). Gemini is mocked.
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
async function waitFor(e: string, ms: number, label: string) { const t = Date.now(); while (Date.now() - t < ms) { if (await js(e)) return; await sleep(100); } throw new Error("timeout: " + label); }
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d !== undefined ? "  [" + JSON.stringify(d) + "]" : ""}`); };
const viewport = (w: number, h: number, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
const reducedMotion = (on: boolean) => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "no-preference" }] });
const btn = (t: string) => `[...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.trim().includes(${JSON.stringify(t)}))`;
const nav = (t: string) => js(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes(${JSON.stringify(t)})).click()`);
const style = (sel: string, prop: string, pseudo = "") => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? getComputedStyle(el${pseudo ? `, ${JSON.stringify(pseudo)}` : ""})[${JSON.stringify(prop)}] : null; })()`);
const noOverflow = () => js(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
async function key(k: string, code: string, vk: number, shift = false) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 }); await sleep(100);
}
async function hover(sel: string) {
  const box = await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView({ block: "center", behavior: "instant" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 40 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y }); await sleep(400);
}
const focusRing = () => js(`(() => { const s = getComputedStyle(document.activeElement); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'; })()`);

async function pagesHaveNoOverflow(label: string) {
  const bad: string[] = [];
  for (const [w, h, m] of [[1280, 900, false], [1024, 800, false], [768, 1024, true], [390, 844, true]] as [number, number, boolean][]) {
    await viewport(w, h, m); await sleep(250);
    if (!(await noOverflow())) bad.push(`${w}px`);
  }
  await viewport(1280, 900);
  check(`${label}: no horizontal overflow at 1280/1024/768/390`, bad.length === 0, bad);
}

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
try {
  await viewport(1280, 900); await reducedMotion(false);
  await send("Page.navigate", { url: BASE });
  await waitFor(`!!document.querySelector('[aria-label="Main navigation"]')`, 60000, "landing");
  await js(`sessionStorage.clear(); window.__beforeReload = true`); await send("Page.reload");
  await waitFor(`!window.__beforeReload && document.readyState === 'complete' && !!document.querySelector('[aria-label="Main navigation"]')`, 30000, "reload");

  console.log("--- Landing Page");
  await key("Tab", "Tab", 9);
  check("Landing: first Tab lands on a control with a visible focus ring", (await js(`document.activeElement !== document.body`)) && (await focusRing()), await js(`document.activeElement?.outerHTML.slice(0, 80)`));
  await pagesHaveNoOverflow("Landing Page");

  console.log("--- Career Finder (motion on)");
  await js(`${btn("Get Started")}.click()`); await waitFor(`!!document.querySelector('#student-name')`, 5000, "finder");
  check("page entrance animation runs (animate-enter)", (await style(".animate-enter", "animationName")) === "enterSlide");
  await js(`${btn("Try Sample Profile")}.click()`); await sleep(200);
  check("progress fill animates/transitions (completeness bar)", (await style('[aria-label="Profile completeness"] > div', "animationName")) === "clGrow" && (await style('[aria-label="Profile completeness"] > div', "transitionProperty")) === "width");
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`!!document.querySelector('.cl-loading-bar')`, 5000, "loading bar");
  check("loading: indeterminate bar animates", (await style(".cl-loading-bar", "animationName", "::after")) === "clIndeterminate");
  await waitFor(`!!document.querySelector('[aria-label="Analyze Skill Gap for Mock Career 1"]')`, 30000, "careers");
  check("results: career cards enter with a stagger (2nd card delayed)", (await style(".cl-stagger > :nth-child(2)", "animationName")) === "enterSlide" && (await style(".cl-stagger > :nth-child(2)", "animationDelay")) === "0.05s");
  await hover("main article.cl-card-interactive");
  check("career card lifts on hover (translateY -2px)", /matrix\(1, 0, 0, 1, 0, -2\)/.test(await style("main article.cl-card-interactive", "transform")), await style("main article.cl-card-interactive", "transform"));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
  await js(`document.querySelector('[aria-label="Analyze Skill Gap for Mock Career 1"]').focus()`);
  check("card also lifts while a control inside has keyboard focus (focus-within)", /matrix\(1, 0, 0, 1, 0, -2\)/.test(await style("main ul.cl-stagger > li:first-child article", "transform")));
  await js(`document.activeElement.blur()`);
  await pagesHaveNoOverflow("Career Finder with results");

  console.log("--- Skill Gap Analyzer and Learning Roadmap");
  await js(`document.querySelector('[aria-label="Analyze Skill Gap for Mock Career 1"]').click()`);
  await waitFor(`document.body.innerText.includes('Skills You Already Have')`, 30000, "skill gap");
  check("Skill Gap: readiness bar grows in; analysis sections stagger", (await style('[aria-label^="Current role readiness"] > div', "animationName")) === "clGrow" && (await style(".cl-stagger > :nth-child(3)", "animationDelay")) === "0.1s");
  await js(`[...document.querySelectorAll('[aria-labelledby="skill-gap-career-label"] button')][0].focus()`); await key("Tab", "Tab", 9); await key("Tab", "Tab", 9, true);
  check("career switcher: keyboard focus shows a ring", await focusRing());
  await pagesHaveNoOverflow("Skill Gap Analyzer");
  await js(`${btn("Generate Learning Roadmap")}.click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Mark Complete'))`, 30000, "roadmap");
  await js(`document.querySelectorAll('ol article')[0].querySelector('button').click()`); await sleep(100);
  check("Roadmap: completion check icon pops in", (await style("ol article .cl-pop", "animationName")) === "clPop");
  for (let i = 1; i < 4; i++) { await js(`document.querySelectorAll('ol article')[${i}].querySelector('button').click()`); await sleep(80); }
  check("Roadmap: all stages ticked -> success panel 'All stages complete.'", (await js(`document.body.innerText.includes('All stages complete.')`)) && (await js(`!!document.querySelector('.bg-emerald-50 .cl-pop')`)));
  await pagesHaveNoOverflow("Learning Roadmap");

  console.log("--- Dashboard and mobile drawer");
  await nav("Dashboard"); await sleep(300);
  check("Dashboard: panels stagger in", (await style("main .cl-stagger > :nth-child(2)", "animationName")) === "enterSlide");
  await pagesHaveNoOverflow("Dashboard");
  await viewport(390, 844, true); await sleep(250);
  await js(`document.querySelector('[aria-controls="app-mobile-drawer"]').click()`); await sleep(50);
  check("mobile drawer slides in", (await style("#app-mobile-drawer .cl-drawer-in", "animationName")) === "clDrawerIn" || (await style("#app-mobile-drawer.cl-drawer-in", "animationName")) === "clDrawerIn");
  await key("Escape", "Escape", 27); await viewport(1280, 900);

  console.log("--- prefers-reduced-motion: reduce");
  await reducedMotion(true); await sleep(200);
  check("reduce: Dashboard stagger off", (await style("main .cl-stagger > :nth-child(2)", "animationName")) === "none");
  await nav("Career Finder"); await sleep(300);
  check("reduce: page entrance off", (await style(".animate-enter", "animationName")) === "none");
  check("reduce: progress fills do not animate or transition", (await style('[aria-label^="Match for "] > div', "animationName")) === "none" && (await style('[aria-label^="Match for "] > div', "transitionDuration")) === "0s");
  check("reduce: result cards do not stagger", (await style(".cl-stagger > :nth-child(2)", "animationName")) === "none");
  await hover("main article.cl-card-interactive");
  check("reduce: card hover keeps highlight but no movement", (await style("main article.cl-card-interactive", "transform")) === "none");
  check("reduce: buttons have no transitions", (await style(".cl-btn", "transitionDuration")) === "0s");
  await nav("Learning Roadmap"); await sleep(300);
  await js(`${btn("Regenerate")}.click()`);
  await waitFor(`!!document.querySelector('.cl-loading-bar')`, 5000, "loading bar (reduced)");
  check("reduce: loading bar is static, spinner does not spin", (await style(".cl-loading-bar", "animationName", "::after")) === "none" && (await style('[role=status] svg', "animationName")) === "none");
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Mark Complete'))`, 30000, "regenerated");
  await js(`document.querySelectorAll('ol article')[0].querySelector('button').click()`); await sleep(100);
  check("reduce: completion check appears without the pop", (await style("ol article .cl-pop", "animationName")) === "none");
  await reducedMotion(false);

  check("no console errors or exceptions", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
