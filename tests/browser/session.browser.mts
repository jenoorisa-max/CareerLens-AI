// Real-browser check of D4 (F5) session persistence, via CDP in headless Edge.
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
const navBtn = (t: string) => `[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes(${JSON.stringify(t)}))`;
const text = (t: string) => `document.body.innerText.includes(${JSON.stringify(t)})`;
const reload = async () => { await send("Page.reload"); await waitFor(`document.readyState === 'complete' && !!document.querySelector('aside')`, 30000, "reload"); await sleep(1000); };

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
try {
  await send("Page.navigate", { url: APP });
  await waitFor(`!!${btn("Try Sample Profile")}`, 60000, "app");
  await js(`sessionStorage.clear()`);
  await js(`${btn("Try Sample Profile")}.click()`); await sleep(300);
  await js(`document.querySelector('button[type=submit]').click()`);
  await waitFor(`!!${btn("Analyze Skill Gap")}`, 30000, "careers");
  await js(`${btn("Analyze Skill Gap")}.click()`);
  await waitFor(text("Skills You Already Have"), 30000, "skill gap");
  await js(`${btn("Generate Learning Roadmap")}.click()`);
  await waitFor(`!!${btn("Mark Complete")}`, 30000, "roadmap");
  await js(`${btn("Mark Complete")}.click()`); await sleep(300);
  check("roadmap generated; ticking stage 1 -> '1/4 Stages'", await js(text("1/4 Stages")));
  const saved = await js(`JSON.parse(sessionStorage.getItem('careerlens:session:v1') || 'null')`);
  check("session saved to sessionStorage (v1, profile, careers, gap, roadmap, progress)",
    saved?.version === 1 && saved.profile?.name === "Amina Tariq" && saved.careerResults?.careers?.length === 3 &&
    !!saved.skillGapsByCareer?.["Mock Career 1"] && !!saved.roadmapsByCareer?.["Mock Career 1"] && saved.completedStages?.["Mock Career 1::1"] === true, saved && Object.keys(saved));

  const n0 = api.length;
  await js(`${navBtn("Career Finder")}.click()`); await sleep(400); await js(`${navBtn("Learning Roadmap")}.click()`); await sleep(400);
  check("progress survives a tab switch (was lost before D4)", await js(text("1/4 Stages")));
  check("tab switching with cached results sends no request", api.length === n0, api.slice(n0));

  const n1 = api.length;
  await reload();
  check("after REFRESH: roadmap tab, roadmap and progress restored ('1/4 Stages')", (await js(text("1/4 Stages"))) && (await js(text("Your Beginner-Friendly Action Plan"))));
  check("after REFRESH: sidebar shows the restored profile", await js(`document.querySelector('aside').innerText.includes('Amina Tariq')`));
  await js(`${navBtn("Skill Gap")}.click()`); await sleep(400);
  check("after REFRESH: skill gap restored", await js(text("Skills You Already Have")));
  check("after REFRESH: no API request (nothing regenerated, no quota used)", api.length === n1, api.slice(n1));

  await js(`${navBtn("Learning Roadmap")}.click()`); await sleep(300);
  const n2 = api.length;
  await js(`${btn("Regenerate")}.click()`);
  await waitFor(`!!${btn("Mark Complete")} && !${btn("Regenerate")}?.disabled`, 30000, "regenerated");
  check("Regenerate sends exactly 1 roadmap request and clears that career's progress ('0/4 Stages')", api.slice(n2).join() === "/api/roadmap" && (await js(text("0/4 Stages"))), api.slice(n2));

  await js(`${btn("New Assessment")}.click()`); await sleep(400);
  check("New Assessment clears the saved session", (await js(`sessionStorage.getItem('careerlens:session:v1')`)) === null);
  await reload();
  check("after New Assessment + REFRESH: empty Career Finder, nothing restored",
    (await js(`!document.body.innerText.includes('Profile Synthesis') && document.querySelector('aside').innerText.includes('Complete your student profile')`)));

  await js(`sessionStorage.setItem('careerlens:session:v1', '{corrupt json')`); await reload();
  check("corrupt saved session -> app loads normally with an empty assessment", await js(`!!${btn("Try Sample Profile")} && !document.body.innerText.includes('Profile Synthesis')`));
  check("no console errors in the browser", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api)}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
