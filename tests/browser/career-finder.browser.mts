// Real-browser check of the redesigned Career Finder (run with MOCK_DELAY_MS so
// the loading state is observable). Gemini is mocked by mock-server.mts.
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
const text = (t: string) => js(`document.body.innerText.includes(${JSON.stringify(t)})`);
const active = () => js(`document.activeElement?.id`);
const submit = async () => { await js(`document.querySelector('button[type=submit]').click()`); await sleep(250); };
async function type(sel: string, value: string) {
  await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.focus(); el.select?.(); })()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
  if (value) await send("Input.insertText", { text: value });
  await sleep(80);
}
async function key(k: string, code: string, vk: number) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); await sleep(80);
}
const noOverflow = () => js(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
try {
  await viewport(1280, 900);
  await send("Page.navigate", { url: APP });
  await waitFor(`!!document.querySelector('#student-name')`, 60000, "app");
  await js(`sessionStorage.clear(); window.__beforeReload = true`); await send("Page.reload");
  // wait for the NEW page (the old one is marked), so no check runs mid-navigation
  await waitFor(`!window.__beforeReload && document.readyState === 'complete' && !!document.querySelector('#student-name')`, 30000, "reload");

  console.log("--- validation feedback (same rules and messages, shown at the field)");
  check("empty form shows 0 of 5 complete", await text("0 of 5 complete"));
  await submit();
  check("empty submit: 'Please enter your name.' shown under Full Name, field marked invalid and focused",
    (await js(`document.querySelector('#student-name-error')?.textContent.trim()`)) === "Please enter your name." &&
    (await js(`document.querySelector('#student-name').getAttribute('aria-invalid')`)) === "true" && (await active()) === "student-name");
  check("error is linked to the field (aria-describedby)", (await js(`document.querySelector('#student-name').getAttribute('aria-describedby')`)) === "student-name-error");
  check("no AI request for an invalid form", api.length === 0, api);
  await type("#student-name", "Sam Lee"); await submit();
  check("next missing field: field of study error + focus", (await js(`document.querySelector('#field-of-study-error')?.textContent.trim()`)) === "Please enter your field of study." && (await active()) === "field-of-study");
  check("previous field no longer marked invalid", (await js(`document.querySelector('#student-name').getAttribute('aria-invalid')`)) === "false");
  await type("#field-of-study", "Biology"); await submit();
  check("skills error + focus on the skills input", (await js(`document.querySelector('#skills-input-error')?.textContent.trim()`)) === "Please add at least one current skill." && (await active()) === "skills-input");
  await type("#skills-input", "Lab work"); await key("Enter", "Enter", 13);
  check("Enter in the skills input adds a chip (keyboard)", (await js(`document.querySelectorAll('[aria-label^="Remove skill "]').length`)) === 1 && (await text("1/30")));
  await submit();
  check("interests error + focus", (await js(`document.querySelector('#interests-input-error')?.textContent.trim()`)) === "Please add at least one interest." && (await active()) === "interests-input");
  await type("#interests-input", "Health"); await key("Enter", "Enter", 13); await submit();
  check("career goals error ('Please share your career goals.') + focus", (await js(`document.querySelector('#career-goals-error')?.textContent.trim()`)) === "Please share your career goals." && (await active()) === "career-goals");
  await type("#career-goals", "Work in research."); await sleep(100);
  check("completeness reaches 5 of 5 from real input; goals counter updates", (await text("5 of 5 complete")) && (await text("17/2,000")));
  check("still no AI request during validation", api.length === 0, api);

  console.log("--- loading and results");
  await js(`${btn("Try Sample Profile")}.click()`); await sleep(200);
  await submit();
  await waitFor(`!!document.querySelector('[role=status]') && document.body.innerText.includes('CareerLens AI is evaluating')`, 5000, "loading state");
  check("loading: status message visible and submit shows 'Analyzing Profile...' (disabled)",
    (await js(`document.querySelector('button[type=submit]').disabled`)) && (await js(`document.querySelector('button[type=submit]').textContent.includes('Analyzing Profile...')`)));
  await waitFor(`document.body.innerText.includes('Profile Synthesis')`, 30000, "results");
  check("exactly one career request sent", api.join() === "/api/careers", api);
  check("results: profile synthesis for the submitted student, 3 career cards with match bars",
    (await text("For Amina Tariq · Computer Science")) && (await js(`document.querySelectorAll('main article').length`)) === 3 &&
    (await js(`[...document.querySelectorAll('[aria-label^="Match for "]')].map(b => b.getAttribute('aria-valuenow')).join()`)) === "89,88,87");
  check("career cards show real fields (day-to-day, core skills, growth outlook)", (await text("Task one")) && (await text("Growing.")) && (await text("Core Skills")));

  console.log("--- actions and navigation");
  await js(`document.querySelector('[aria-label="Analyze Skill Gap for Mock Career 2"]').click()`);
  await waitFor(`document.body.innerText.includes('Skills You Already Have')`, 30000, "skill gap");
  check("'Analyze Skill Gap' opens the existing analyzer for that career (1 request)", api.filter((p) => p === "/api/skill-gap").length === 1 && (await js(`document.querySelector('#app-page-title').textContent`)) === "Skill Gap Analyzer");
  await js(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes('Career Finder')).click()`); await sleep(300);
  check("back to Career Finder: results and inputs kept, no new request", (await text("Profile Synthesis")) && (await js(`document.querySelector('#student-name').value`)) === "Amina Tariq" && api.length === 2, api);
  await js(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes('Dashboard')).click()`); await sleep(300);
  check("Dashboard reflects the assessment", (await text("Your career matches")) && (await text("Mock Career 2")));
  await js(`document.querySelector('[aria-label="Back to the CareerLens AI home page"]').click()`); await sleep(300);
  await js(`${btn("Get Started")}.click()`); await waitFor(`location.hash === '#/app'`, 5000, "app");
  check("Landing → Get Started returns to the app with the assessment intact (no request)", (await text("Your career matches")) && api.length === 2, api);
  await js(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes('Career Finder')).click()`); await sleep(300);
  await js(`document.querySelector('[aria-label="Build Learning Roadmap for Mock Career 1"]').click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Mark Complete'))`, 30000, "roadmap");
  check("'Build Learning Roadmap' opens the existing roadmap (1 request)", api.filter((p) => p === "/api/roadmap").length === 1, api);

  console.log("--- responsive and keyboard");
  await js(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes('Career Finder')).click()`); await sleep(300);
  for (const [w, h, m] of [[1280, 900, false], [1024, 800, false], [768, 1024, true], [390, 844, true]] as [number, number, boolean][]) {
    await viewport(w, h, m); await sleep(250);
    check(`${w}px: no horizontal overflow with form and results`, await noOverflow());
  }
  await viewport(1280, 900); await js(`window.scrollTo(0,0)`); await js(`document.activeElement?.blur()`);
  await js(`document.querySelector('#student-name').focus()`);
  const order: string[] = [];
  for (let i = 0; i < 3; i++) { await key("Tab", "Tab", 9); order.push(await active()); }
  check("Tab moves through the form in order (name → education → field of study)", order.join() === "education-level,field-of-study,skills-input", order);
  check("no console errors or exceptions", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
