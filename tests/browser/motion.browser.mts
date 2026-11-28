// Phase 1 Task 9: final motion polish in a real browser. Scroll reveal never
// leaves content hidden; nothing is hidden or moving under reduced motion or in
// print; hover/press feedback works and coexists with entrance animations.
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
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${!ok && d !== undefined ? "  [" + JSON.stringify(d).slice(0, 500) + "]" : ""}`); };
const viewport = (w: number, h: number, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
const media = (reduce: boolean, type = "") => send("Emulation.setEmulatedMedia", { media: type, features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] });
const btn = (t: string) => `[...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.trim().includes(${JSON.stringify(t)}))`;
const style = (sel: string, prop: string) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? getComputedStyle(el)[${JSON.stringify(prop)}] : null; })()`);
const REVEAL_ITEMS = `[...document.querySelectorAll('.cl-reveal, .cl-reveal-group > *')]`;
const hiddenCount = () => js(`${REVEAL_ITEMS}.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99).length`);
async function freshLanding() {
  await send("Page.navigate", { url: BASE });
  await waitFor(`!!document.querySelector('[aria-label="Main navigation"]') && document.readyState === 'complete'`, 60000, "landing");
  await js(`window.scrollTo(0, 0)`); await sleep(300);
}
async function scrollThrough() {
  const H = await js(`document.documentElement.scrollHeight`);
  for (let y = 0; y <= H; y += 400) { await js(`window.scrollTo(0, ${y})`); await sleep(120); }
  await sleep(1200); // longest reveal (640ms + 270ms delay) has finished
}

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
try {
  await viewport(1280, 800); await media(false);
  await send("Page.navigate", { url: BASE });
  await waitFor(`!!document.querySelector('[aria-label="Main navigation"]')`, 60000, "landing");
  await js(`sessionStorage.clear()`);

  console.log("--- Landing: hero sequence and scroll reveal (motion allowed)");
  await freshLanding();
  check("hero plays in sequence: headline is the 2nd step (50ms), preview follows (260ms delay)",
    (await style("#home .cl-stagger > :nth-child(2)", "animationDelay")) === "0.05s" && (await style("#home .cl-enter-late", "animationDelay")) === "0.26s");
  const total = await js(`${REVEAL_ITEMS}.length`);
  check("reveal armed: sections below the fold start hidden (opacity 0) until scrolled to", (await js(`document.querySelector('.cl-reveal-on') !== null`)) && (await hiddenCount()) > 0, { total, hidden: await hiddenCount() });
  // the hero entrance takes ~0.4s once painted; allow for a slow machine
  let heroVisible = true;
  try { await waitFor(`getComputedStyle(document.querySelector('h1')).opacity === '1'`, 3000, "hero"); } catch { heroVisible = false; }
  check("content above the fold is not a reveal target and becomes fully visible when the hero sequence ends",
    (await js(`!document.querySelector('h1').closest('.cl-reveal, .cl-reveal-group')`)) && heroVisible);
  await scrollThrough();
  check(`after scrolling through: every revealed element is fully visible (${total} elements, none stuck hidden)`, (await hiddenCount()) === 0, await hiddenCount());
  check("revealed items animate in with a stagger (2nd feature card 90ms)", (await style("#features .cl-reveal-group > :nth-child(2)", "animationDelay")) === "0.09s");
  await js(`window.scrollTo(0, 0)`); await sleep(300); await scrollThrough();
  check("reveal happens once: scrolling back up and down keeps everything visible", (await hiddenCount()) === 0);
  await js(`document.querySelector('a[href="#features"]').click()`); await sleep(1200);
  check("in-page link to #features lands on visible content", (await hiddenCount()) === 0);

  console.log("--- Landing: nothing hidden under reduced motion or in print");
  await media(true); await freshLanding();
  check("reduced motion: reveal never armed, nothing hidden, no entrance animation", (await js(`document.querySelector('.cl-reveal-on') === null`)) && (await hiddenCount()) === 0 && (await style("#home .cl-enter-late", "animationName")) === "none");
  await media(false, "print"); await freshLanding();
  check("print: all sections visible even though reveal is armed on screen", (await hiddenCount()) === 0, await hiddenCount());
  await media(false); await freshLanding();

  console.log("--- interaction feedback");
  const arrowBtn = `#home .cl-btn-primary`;
  const box = await js(`(() => { const r = document.querySelector(${JSON.stringify(arrowBtn)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y }); await sleep(350);
  check("Get Started arrow nudges forward on hover (translate 3px)", (await style(`${arrowBtn} .lucide-arrow-right`, "translate")) === "3px");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 });
  await js(`${btn("Get Started")}.click()`); await waitFor(`!!document.querySelector('#student-name')`, 5000, "finder");
  await js(`${btn("Try Sample Profile")}.click()`); await sleep(300);
  await js(`document.querySelector('button.cl-press.rounded-pill').scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(150);
  const c = await js(`(() => { const r = document.querySelector('button.cl-press.rounded-pill').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1 }); await sleep(250);
  check("chip press feedback: scales to 0.97 while pressed", (await style("button.cl-press.rounded-pill:active", "scale")) === "0.97", await style("button.cl-press.rounded-pill:active", "scale"));
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1 }); await sleep(200);
  // the press toggled a chip; the sample profile restores a known state
  await js(`${btn("Try Sample Profile")}.click()`); await sleep(200);
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`!!document.querySelector('[aria-label="Analyze Skill Gap for Mock Career 1"]')`, 30000, "careers");
  await sleep(700);
  check("results stagger in using `translate` (entrance no longer holds `transform`)", (await style(".cl-stagger > :nth-child(2)", "animationName")) === "enterSlide" && (await style(".cl-stagger > :nth-child(2)", "transform")) === "none");
  const card = "main ul.cl-stagger > li:first-child article";
  await js(`document.querySelector(${JSON.stringify(card)}).scrollIntoView({ block: 'center', behavior: 'instant' })`); await sleep(150);
  const cb = await js(`(() => { const r = document.querySelector(${JSON.stringify(card)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 40 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cb.x, y: cb.y }); await sleep(400);
  check("hover lift still works on a card inside an animated list", /matrix\(1, 0, 0, 1, 0, -2\)/.test(await style(card, "transform")), await style(card, "transform"));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 });
  await js(`document.querySelector('[aria-label="Analyze Skill Gap for Mock Career 1"]').click()`);
  await waitFor(`document.body.innerText.includes('Skills You Already Have')`, 30000, "skill gap");
  await js(`${btn("Generate Learning Roadmap")}.click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Mark Complete'))`, 30000, "roadmap");
  check("roadmap stage card eases border and shadow on status change", /border-color/.test(await style("ol article", "transitionProperty")) && (await style("ol article", "transitionDuration")).startsWith("0.3s"));
  await js(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes('Dashboard')).click()`); await sleep(500);
  check("Dashboard: journey steps stagger in", (await style('[aria-label="Career journey"] > :nth-child(2)', "animationName")) === "enterSlide" && (await style('[aria-label="Career journey"] > :nth-child(2)', "animationDelay")) === "0.05s");

  console.log("--- prefers-reduced-motion: complete");
  await media(true); await sleep(200);
  const moving = await js(`[...document.querySelectorAll('body *')].filter(el => { const s = getComputedStyle(el); const anim = s.animationName !== 'none' && parseFloat(s.animationDuration) > 0; const tr = s.transitionDuration.split(',').some(d => parseFloat(d) > 0); return anim || tr; }).map(el => el.tagName + '.' + String(el.className).slice(0, 40)).slice(0, 5)`);
  check("reduce: no element on the Dashboard has a running animation or a non-zero transition", moving.length === 0, moving);
  await js(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes('Career Finder')).click()`); await sleep(300);
  check("reduce: press feedback disabled (no scale on navigation items)", (await style("aside nav button.cl-press", "scale")) === "none");
  await media(false);

  check("motion work sent no extra AI requests", api.join() === "/api/careers,/api/skill-gap,/api/roadmap", api);
  check("no console errors or exceptions", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
