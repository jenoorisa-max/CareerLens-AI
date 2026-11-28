// Real-browser check of the Career Finder input limits (headless Edge/Chrome via CDP).
// Uses Input.insertText, which behaves like real typing/pasting, so the browser's
// own maxlength enforcement is exercised.
const APP = "http://localhost:3123/#/app"; // application view (Landing Page is at "/")
const page = (await (await fetch("http://127.0.0.1:9333/json/list")).json()).find((t: any) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map<number, (m: any) => void>(); const api: string[] = []; const errors: string[] = [];
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/")) api.push(new URL(m.params.request.url).pathname);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(" "));
};
const send = (method: string, params: object = {}) => new Promise<any>((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (e: string) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(e: string, ms: number, label: string) { const t = Date.now(); while (Date.now() - t < ms) { if (await js(e)) return; await sleep(200); } throw new Error("timeout: " + label); }
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d !== undefined ? "  [" + JSON.stringify(d) + "]" : ""}`); };
const btn = (t: string) => `[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(t)}))`;
/** Clears the field, then types/pastes `text` like a user (browser maxlength applies). */
async function type(selector: string, text: string) {
  await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.select(); })()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
  await send("Input.insertText", { text });
  await sleep(150);
}
const value = (selector: string) => js(`document.querySelector(${JSON.stringify(selector)}).value`);
const chips = (kind: string) => js(`document.querySelectorAll('[aria-label^="Remove ${kind} "]').length`);
const addSkill = async () => { await js(`${btn("Add")}.click()`); await sleep(200); };
const addInterest = async () => { await js(`[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Add')[1].click()`); await sleep(200); };
const text = (t: string) => js(`document.body.innerText.includes(${JSON.stringify(t)})`);

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
try {
  await send("Page.navigate", { url: APP });
  await waitFor(`!!document.querySelector('#student-name')`, 60000, "app");
  await js(`sessionStorage.clear()`);

  await type("#student-name", "N".repeat(150));
  check("typing 150 characters into Name stops at 100", (await value("#student-name")).length === 100, (await value("#student-name")).length);
  await type("#field-of-study", "F".repeat(200));
  check("typing 200 characters into Field of Study stops at 150", (await value("#field-of-study")).length === 150, (await value("#field-of-study")).length);
  await type("#career-goals", "G".repeat(2100));
  check("typing 2,100 characters into Career Goals stops at 2,000", (await value("#career-goals")).length === 2000, (await value("#career-goals")).length);
  await type("#student-name", "N".repeat(100));
  check("exactly 100 characters in Name is kept", (await value("#student-name")).length === 100, null);

  const long81 = "S".repeat(81);
  await type("#skills-input", long81); await addSkill();
  check("81-character skill: rejected with the server's message", await text("Each skill must be 80 characters or fewer."));
  check("81-character skill: text kept in the input (not cleared, not truncated)", (await value("#skills-input")) === long81, (await value("#skills-input")).length);
  check("81-character skill: no chip added", (await chips("skill")) === 0, await chips("skill"));
  await type("#skills-input", "S".repeat(80));
  check("typing in the field clears the tag error", !(await text("Each skill must be 80 characters or fewer.")));
  await addSkill();
  check("80-character skill: added and input cleared", (await chips("skill")) === 1 && (await value("#skills-input")) === "", await chips("skill"));

  await type("#skills-input", Array.from({ length: 29 }, (_, i) => `skill${i}`).join(", ")); await addSkill();
  check("comma list bringing skills to exactly 30: accepted", (await chips("skill")) === 30, await chips("skill"));
  await type("#skills-input", "one more"); await addSkill();
  check("31st skill: rejected with the server's message, count stays 30, text kept",
    (await text("Please add no more than 30 skills.")) && (await chips("skill")) === 30 && (await value("#skills-input")) === "one more", await chips("skill"));
  await js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '+ Excel')?.click()`); await sleep(200);
  check("suggestion button at 30 skills is also rejected (count stays 30)", (await chips("skill")) === 30, await chips("skill"));

  await type("#interests-input", "I".repeat(81)); await addInterest();
  check("81-character interest: rejected with the server's interest message", await text("Each interest must be 80 characters or fewer."));
  await type("#interests-input", "AI"); await addInterest();

  const before = api.length;
  await js(`document.querySelector('button[type=submit]').click()`); await sleep(600);
  check("submit with pending over-limit skill text: blocked, no /api request, text still in the input",
    api.length === before && (await value("#skills-input")) === "one more" && (await text("Please add no more than 30 skills.")), api.slice(before));

  await type("#skills-input", ""); await sleep(100);
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`!!${btn("Analyze Skill Gap")}`, 30000, "careers after valid submit");
  check("valid submission at the limits (100-char name, 150-char field, 2,000-char goals, 30 skills) is sent and succeeds",
    api.filter((p) => p === "/api/careers").length === 1, api);
  check("no console errors in the browser", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
