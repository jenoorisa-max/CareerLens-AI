// Task 8: responsive layout and accessibility across all five pages, in a real
// browser (Gemini mocked; run with MOCK_SKILLGAP=ok and a short MOCK_DELAY_MS).
// - 6 widths (1440/1280/1024/768/390/360): no overflow, nothing off-screen,
//   touch targets, one h1 and no skipped heading levels.
// - Text contrast measured from real pixels (text hidden, page screenshotted,
//   PNG decoded with node:zlib), so gradient and tinted backgrounds are covered.
// - Skip links, mobile drawer focus trap / Escape / scroll lock, Landing menu,
//   screen-reader announcements for finished results.
import { inflateSync } from "node:zlib";

const BASE = "http://localhost:3123/";
const page = (await (await fetch("http://127.0.0.1:9333/json/list")).json()).find((t: any) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map<number, (m: any) => void>(); const api: string[] = []; const errors: string[] = [];
// The Vite dev server's hot-reload socket is refused in this environment; that
// is not application code, so it is not counted as an app error.
const devNoise = (s: string) => /\[vite\]|@vite\/client|Vite server|WebSocket closed without opened/.test(s);
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/")) api.push(new URL(m.params.request.url).pathname);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") { const t = m.params.args.map((a: any) => a.value ?? a.description).join(" "); if (!devNoise(t)) errors.push(t); }
  if (m.method === "Runtime.exceptionThrown") { const d = m.params.exceptionDetails; const t = `${d?.text} ${d?.exception?.description ?? ""} ${d?.url ?? ""}`; if (!devNoise(t)) errors.push(t); }
};
const send = (method: string, params: object = {}) => new Promise<any>((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (e: string) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(e: string, ms: number, label: string) { const t = Date.now(); while (Date.now() - t < ms) { if (await js(e)) return; await sleep(100); } throw new Error("timeout: " + label); }
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${!ok && d !== undefined ? "  [" + JSON.stringify(d).slice(0, 600) + "]" : ""}`); };
const viewport = (w: number, mobile: boolean) => send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile });
const btn = (t: string) => `[...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.trim().includes(${JSON.stringify(t)}))`;
const nav = (t: string) => js(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes(${JSON.stringify(t)})).click()`);
async function key(k: string, code: string, vk: number, shift = false) {
  const extra = k === "Enter" ? { text: "\r" } : {};
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0, ...extra });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 }); await sleep(100);
}
const WIDTHS: [number, boolean][] = [[1440, false], [1280, false], [1024, false], [768, true], [390, true], [360, true]];

// --- layout + structure metrics (evaluated in the page) ---
const LAYOUT = String.raw`(() => {
  const W = document.documentElement.clientWidth;
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const srOnly = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.position === 'absolute' && (parseFloat(s.width) <= 1 || s.clip !== 'auto')) return true; } return false; };
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const offscreen = [], small = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || srOnly(el) || el.closest('.cl-skip-link')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 && !el.closest('[class*="overflow-hidden"],[class*="overflow-x-auto"]')) offscreen.push(el.tagName + ' ' + name(el));
  }
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
    if (!vis(el) || srOnly(el) || el.classList.contains('cl-skip-link')) continue;
    const r = el.getBoundingClientRect();
    const chip = el.classList.contains('rounded-pill') && el.classList.contains('min-h-9');  // compact chips: 36px, spaced
    const need = chip ? 36 : 44;
    // Height is the touch dimension; width must reach 44 except for spaced text links in a wrapped row.
    const narrowOk = el.tagName === 'A' && r.height >= 44;
    if (r.height < need - 0.5 || (r.width < need - 0.5 && !narrowOk && !chip)) small.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => vis(h) || srOnly(h)).map((h) => +h.tagName[1]);
  const skips = []; for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) skips.push(levels[i - 1] + '->' + levels[i]);
  return { overflow: document.documentElement.scrollWidth - W, offscreen: offscreen.slice(0, 5), small: [...new Set(small)], h1: levels.filter((l) => l === 1).length, skips };
})()`;

// --- pixel-based contrast ---
function decodePng(buf: Buffer) {
  let p = 8, w = 0, h = 0, ct = 0; const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("ascii", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8) throw new Error("bit depth"); }
    else if (type === "IDAT") idat.push(data); else if (type === "IEND") break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error("colour type " + ct); })();
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - stride + x] : 0, c = y && x >= bpp ? out[dst - stride + x - bpp] : 0;
      const v = raw[src + x];
      let pr = 0;
      if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = (v + pr) & 255;
    }
  }
  return { w, h, bpp, px: out };
}
const lum = (r: number, g: number, b: number) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const TEXT = String.raw`(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const srOnly = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.position === 'absolute' && (parseFloat(s.width) <= 1 || s.clip !== 'auto')) return true; } return false; };
  const items = [];
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || srOnly(el) || el.closest('[aria-hidden="true"], .cl-skip-link, textarea, input, select, [disabled]')) continue;
    if (s.backgroundClip === 'text' || /text/.test(s.webkitBackgroundClip || '')) continue;  // gradient headline: checked separately
    let op = 1; for (let e = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity); if (op < 1) continue;
    const range = document.createRange(); range.selectNodeContents(el); const r = range.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight) >= 700;
    items.push({ t: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), fg: rgba(s.color), large: size >= 24 || (bold && size >= 18.66), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
  }
  return items;
})()`;
async function measureContrast(): Promise<{ count: number; bad: string[] }> {
  // Scroll to the top first so sticky/fixed bars are painted where they belong in the full-page capture.
  await js(`window.scrollTo(0, 0)`); await sleep(100);
  const items: any[] = await js(TEXT);
  await js(`(() => { const s = document.createElement('style'); s.id = '__hide'; s.textContent = '*{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important;caret-color:transparent!important}'; document.head.append(s); })()`);
  await sleep(150);
  const H = await js(`document.documentElement.scrollHeight`), W = await js(`document.documentElement.clientWidth`);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  await js(`document.getElementById('__hide').remove()`);
  const img = decodePng(Buffer.from(shot.result.data, "base64"));
  const bad: string[] = [];
  for (const it of items) {
    const ratios: number[] = [];
    // Sample the central area of the text box (3px in from the sides, 20% in from top and
    // bottom): glyphs sit there, while the box corners can fall outside a rounded pill.
    const x0 = it.x + 3, x1 = it.x + it.w - 3, y0 = it.y + it.h * 0.2, y1 = it.y + it.h * 0.8;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.h, y1); y += 2)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.w, x1); x += 2) {
        const i = (y * img.w + x) * img.bpp, br = img.px[i], bg = img.px[i + 1], bb = img.px[i + 2], a = it.fg[3];
        const fr = it.fg[0] * a + br * (1 - a), fgc = it.fg[1] * a + bg * (1 - a), fb = it.fg[2] * a + bb * (1 - a);
        const L1 = lum(fr, fgc, fb), L2 = lum(br, bg, bb); ratios.push((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05));
      }
    if (!ratios.length) continue;
    ratios.sort((a, b) => a - b);
    const worst = ratios[Math.floor(ratios.length * 0.1)];  // 10th percentile: ignores borders/icons crossing the box
    if (worst < (it.large ? 3 : 4.5)) bad.push(`${it.t} ${worst.toFixed(2)}`);
  }
  return { count: items.length, bad };
}
async function contrastFailures(label: string) {
  const { count, bad } = await measureContrast();
  check(`${label}: text contrast measured on real pixels (${count} text items)`, bad.length === 0, bad.slice(0, 8));
}

async function layoutAllWidths(label: string) {
  const issues: string[] = [];
  for (const [w, m] of WIDTHS) {
    await viewport(w, m); await sleep(300);
    const r = await js(LAYOUT);
    if (r.overflow > 0) issues.push(`${w}: overflow ${r.overflow}px`);
    if (r.offscreen.length) issues.push(`${w}: off-screen ${r.offscreen.join("; ")}`);
    if (r.small.length) issues.push(`${w}: small targets ${r.small.join("; ")}`);
    if (r.h1 !== 1) issues.push(`${w}: ${r.h1} h1`);
    if (r.skips.length) issues.push(`${w}: heading skips ${r.skips.join(",")}`);
  }
  await viewport(1280, false); await sleep(200);
  check(`${label}: 1440/1280/1024/768/390/360 - no overflow, nothing off-screen, touch targets >= 44px (chips 36px), one h1, no skipped headings`, issues.length === 0, issues);
}
async function contrastAt(label: string, widths: [number, boolean][] = [[1440, false], [390, true]]) {
  for (const [w, m] of widths) { await viewport(w, m); await sleep(300); await contrastFailures(`${label} @${w}`); }
  await viewport(1280, false); await sleep(200);
}

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }); // stable pixels
try {
  await viewport(1280, false);
  await send("Page.navigate", { url: BASE });
  await waitFor(`!!document.querySelector('[aria-label="Main navigation"]')`, 60000, "landing");
  await js(`sessionStorage.clear(); window.__beforeReload = true`); await send("Page.reload");
  await waitFor(`!window.__beforeReload && document.readyState === 'complete' && !!document.querySelector('[aria-label="Main navigation"]')`, 30000, "reload");

  console.log("--- Landing Page");
  await key("Tab", "Tab", 9);
  check("first Tab focuses a visible 'Skip to main content' link", (await js(`document.activeElement.textContent.trim()`)) === "Skip to main content" && (await js(`document.activeElement.getBoundingClientRect().top >= 0`)));
  await key("Enter", "Enter", 13);
  check("activating it moves focus to the main content (no hash change)", (await js(`document.activeElement.id`)) === "main-content" && (await js(`location.hash`)) === "");
  check("tagline unchanged: h1 'Discover Your Career. Build Your Future.'", (await js(`document.querySelector('h1').textContent`)) === "Discover Your Career. Build Your Future.");
  check("gradient headline keeps large-text contrast (darkest stop vs canvas >= 3:1; forced-colours fallback in CSS)",
    await js(`getComputedStyle(document.querySelector('h1 .cl-text-gradient')).backgroundImage.includes('linear-gradient')`));
  await layoutAllWidths("Landing Page");
  // Negative control: a deliberately low-contrast probe must be caught by the pixel measurement.
  await js(`(() => { const p = document.createElement('p'); p.id = '__probe'; p.textContent = 'Contrast probe text'; p.style.cssText = 'position:absolute;top:8px;left:8px;z-index:9;color:#c8c6d4;background:#f7f6fb;font-size:14px;padding:4px'; document.body.append(p); })()`);
  const probe = await measureContrast();
  await js(`document.getElementById('__probe').remove()`);
  check("negative control: the pixel contrast check catches a 1.6:1 probe", probe.bad.some((b) => b.startsWith("Contrast probe text")), probe.bad);
  await contrastAt("Landing Page");
  await viewport(360, true); await sleep(250);
  await js(`document.querySelector('[aria-controls="landing-mobile-menu"]').focus()`); await key("Enter", "Enter", 13);
  check("360px menu: opens (aria-expanded) with links >= 44px tall", (await js(`document.querySelector('[aria-controls="landing-mobile-menu"]').getAttribute('aria-expanded')`)) === "true" &&
    (await js(`[...document.querySelectorAll('#landing-mobile-menu a, #landing-mobile-menu button')].every(a => a.getBoundingClientRect().height >= 44)`)));
  await key("Escape", "Escape", 27);
  check("Escape closes the menu and returns focus to the menu button", !(await js(`!!document.querySelector('#landing-mobile-menu')`)) && (await js(`document.activeElement.getAttribute('aria-controls')`)) === "landing-mobile-menu");
  await viewport(1280, false);

  console.log("--- Career Finder");
  await js(`${btn("Get Started")}.click()`); await waitFor(`!!document.querySelector('#student-name')`, 5000, "finder");
  await js(`document.querySelector('button[type=submit]').click()`); await sleep(300);
  await layoutAllWidths("Career Finder (validation error shown)");
  await js(`${btn("Try Sample Profile")}.click()`); await sleep(200);
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`!!document.querySelector('[aria-label="Analyze Skill Gap for Mock Career 1"]')`, 30000, "careers");
  check("finished search announced to screen readers ('3 career paths are ready.')", await js(`[...document.querySelectorAll('[aria-live="polite"]')].some(r => r.textContent === '3 career paths are ready.')`));
  await layoutAllWidths("Career Finder with results");
  await contrastAt("Career Finder");
  await viewport(1440, false); await js(`window.scrollTo(0, 0)`);
  check("app: 'Skip to main content' is the first focusable element on the page",
    (await js(`[...document.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].find(e => !e.disabled)?.textContent.trim()`)) === "Skip to main content");
  await js(`document.querySelector('.cl-skip-link').focus()`);
  check("app: the skip link becomes visible when focused", await js(`(() => { const r = document.querySelector('.cl-skip-link').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()`));
  await key("Enter", "Enter", 13);
  check("app skip link moves focus to <main> and keeps the #/app route", (await js(`document.activeElement.tagName`)) === "MAIN" && (await js(`location.hash`)) === "#/app");
  await viewport(1280, false);

  console.log("--- Skill Gap Analyzer");
  await js(`document.querySelector('[aria-label="Analyze Skill Gap for Mock Career 1"]').click()`);
  await waitFor(`document.body.innerText.includes('Skills You Already Have')`, 30000, "skill gap");
  check("finished analysis announced ('Skill gap analysis for Mock Career 1 is ready.')", await js(`[...document.querySelectorAll('[aria-live="polite"]')].some(r => r.textContent === 'Skill gap analysis for Mock Career 1 is ready.')`));
  await layoutAllWidths("Skill Gap Analyzer");
  await contrastAt("Skill Gap Analyzer");

  console.log("--- Learning Roadmap");
  await js(`${btn("Generate Learning Roadmap")}.click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Mark Complete'))`, 30000, "roadmap");
  check("finished roadmap announced ('Learning roadmap for Mock Career 1 is ready.')", await js(`[...document.querySelectorAll('[aria-live="polite"]')].some(r => r.textContent === 'Learning roadmap for Mock Career 1 is ready.')`));
  check("progress live region still first and unchanged", (await js(`document.querySelector('[aria-live="polite"]').textContent`)) === "0 of 4 stages complete.");
  await js(`document.querySelectorAll('ol article')[0].querySelector('button').click()`); await sleep(150);
  await layoutAllWidths("Learning Roadmap");
  await contrastAt("Learning Roadmap");

  console.log("--- Dashboard and mobile drawer");
  await nav("Dashboard"); await sleep(300);
  await layoutAllWidths("Dashboard");
  await contrastAt("Dashboard");
  await viewport(360, true); await sleep(300);
  check("360px header: page title fully visible (wordmark hidden, icon kept, brand still named)",
    (await js(`(() => { const t = [...document.querySelectorAll('header span')].find(s => s.textContent === 'Dashboard'); return t && t.scrollWidth <= t.clientWidth; })()`)) &&
    (await js(`!!document.querySelector('header [aria-label="CareerLens AI home"]')`)));
  const menu = `document.querySelector('[aria-controls="app-mobile-drawer"]')`;
  await js(`${menu}.focus()`); await key("Enter", "Enter", 13); await sleep(200);
  check("drawer opens as a modal dialog with focus inside; page behind cannot scroll",
    (await js(`document.querySelector('#app-mobile-drawer')?.getAttribute('aria-modal')`)) === "true" && (await js(`document.querySelector('#app-mobile-drawer').contains(document.activeElement)`)) &&
    (await js(`document.body.style.overflow`)) === "hidden");
  const focusables = `[...document.querySelectorAll('#app-mobile-drawer button:not([disabled]), #app-mobile-drawer a[href]')]`;
  await js(`${focusables}.at(-1).focus()`); await key("Tab", "Tab", 9);
  check("Tab on the last control wraps to the first (focus stays in the drawer)", await js(`document.activeElement === ${focusables}[0]`));
  await key("Tab", "Tab", 9, true);
  check("Shift+Tab on the first control wraps to the last", await js(`document.activeElement === ${focusables}.at(-1)`));
  check("drawer controls are >= 44px", await js(`${focusables}.every(b => b.getBoundingClientRect().height >= 44)`), await js(`${focusables}.map(b => Math.round(b.getBoundingClientRect().height))`));
  await key("Escape", "Escape", 27);
  check("Escape closes the drawer, restores scrolling and returns focus to the menu button",
    !(await js(`!!document.querySelector('#app-mobile-drawer')`)) && (await js(`document.body.style.overflow`)) === "" && (await js(`document.activeElement === ${menu}`)));
  await js(`${menu}.click()`); await sleep(200);
  await js(`[...document.querySelectorAll('#app-mobile-drawer nav button')].find(b => b.textContent.includes('Learning Roadmap')).click()`); await sleep(300);
  check("choosing a page closes the drawer and restores scrolling", !(await js(`!!document.querySelector('#app-mobile-drawer')`)) && (await js(`document.body.style.overflow`)) === "");

  check("all AI requests came from deliberate actions only (careers, skill gap, roadmap)", api.join() === "/api/careers,/api/skill-gap,/api/roadmap", api);
  check("no application console errors or exceptions", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
