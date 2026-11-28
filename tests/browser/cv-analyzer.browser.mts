// CV Analyzer Stage 4 in a real browser (production build, Gemini mocked).
// Test files are generated at runtime: the DOCX with JSZip (Node), the PDF and
// page images in the page (canvas). Requests are inspected through CDP.
const BASE = "http://localhost:3123/#/app";
const root = new URL("../../", import.meta.url).href.slice(0, -1);
const JSZip = (await import(`${root}/node_modules/jszip/lib/index.js`)).default;

const page = (await (await fetch("http://127.0.0.1:9333/json/list")).json()).find((t: any) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map<number, (m: any) => void>(); const errors: string[] = [];
const api: { path: string; id: string }[] = [];
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/")) api.push({ path: new URL(m.params.request.url).pathname, id: m.params.requestId });
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a: any) => a.value ?? a.description).join(" "));
  if (m.method === "Runtime.exceptionThrown") errors.push(`${m.params.exceptionDetails?.text} ${m.params.exceptionDetails?.exception?.description ?? ""}`);
};
const send = (method: string, params: object = {}) => new Promise<any>((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (e: string) => { const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(e: string, ms: number, label: string) { const t = Date.now(); while (Date.now() - t < ms) { if (await js(e)) return; await sleep(120); } throw new Error("timeout: " + label); }
let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${!ok && d !== undefined ? "  [" + JSON.stringify(d).slice(0, 400) + "]" : ""}`); };
const viewport = (w: number, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile });
const text = (t: string) => js(`document.querySelector('main').innerText.includes(${JSON.stringify(t)})`);
const btn = (t: string) => `[...document.querySelectorAll('main button')].find(b => b.offsetParent !== null && b.textContent.trim().includes(${JSON.stringify(t)}))`;
const nav = (t: string) => js(`[...document.querySelectorAll('aside nav button')].find(b => b.textContent.includes(${JSON.stringify(t)})).click()`);
const cvRequests = () => api.filter((a) => a.path === "/api/cv-analyze");
const postData = async (id: string) => JSON.parse((await send("Network.getRequestPostData", { requestId: id })).result.postData);
const alertText = () => js(`[...document.querySelectorAll('main [role=alert]')].map(a => a.innerText).join(' | ')`);
const noOverflow = () => js(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);

// In-page helpers: build File objects and hand them to the picker or the drop zone.
const SETUP = String.raw`
window.__cv = {
  pdf(size) { const head = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"; const b = new Uint8Array(size).fill(32); for (let i = 0; i < head.length; i++) b[i] = head.charCodeAt(i); return new File([b], "my-cv.pdf", { type: "application/pdf" }); },
  gif() { return new File([new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0])], "photo.gif", { type: "image/gif" }); },
  fromBase64(b64, name, type) { const s = atob(b64); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new File([b], name, { type }); },
  async image(name, w, h, label, blur, type) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); if (blur) x.filter = "blur(" + blur + "px)";
    x.fillStyle = "#111"; x.font = Math.round(w / 32) + "px sans-serif";
    for (let i = 0; i < 28; i++) x.fillText(label + " line " + i + ": Built a Flutter attendance app with Firebase", w * 0.06, (i + 2) * (h / 31));
    const blob = await new Promise((r) => c.toBlob(r, type || "image/png", 0.92));
    return new File([blob], name, { type: type || "image/png" });
  },
  give(files) { const input = document.querySelector("#cv-file-input"); const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); },
  drop(files) { const zone = document.querySelector("[data-testid=cv-dropzone]"); const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); zone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); },
  async b64(url) { const blob = await (await fetch(url)).blob(); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).replace(/^data:[^,]*,/, "")); fr.readAsDataURL(blob); }); },
};`;

async function makeDocx(paras: string[]): Promise<string> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return zip.generateAsync({ type: "base64" });
}
const DOCX_B64 = await makeDocx([
  "Amina Tariq", "amina.tariq@example.com | +92 300 1234567", "Address: House 12, Street 4, Gulberg, Lahore",
  "Education: BS Computer Science, 2021 - 2025", "Projects: Built a student attendance app using Flutter and Firebase.",
  "Helped with various tasks in the computing society.", "Skills: Python, SQL, Flutter",
]);

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
try {
  await viewport(1280);
  await send("Page.navigate", { url: BASE });
  await waitFor(`!!document.querySelector('aside nav')`, 60000, "app");
  await js(`sessionStorage.clear(); localStorage.clear(); window.__beforeReload = true`); await send("Page.reload");
  await waitFor(`!window.__beforeReload && document.readyState === 'complete' && !!document.querySelector('aside nav')`, 30000, "reload");

  console.log("--- navigation and empty state");
  await nav("CV Analyzer");
  await waitFor(`!!document.querySelector('#cv-file-input')`, 5000, "cv page");
  await js(SETUP);
  check("sidebar 'CV Analyzer' opens the page; title and one visible h1",
    (await js(`document.querySelector('#app-page-title').textContent`)) === "CV Analyzer" && (await js(`[...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null).length`)) === 1);
  check("Analyze is disabled before a file and consent; no request", (await js(`${btn("Analyze my CV")}.disabled`)) && cvRequests().length === 0);
  check("file input is labelled and keyboard-reachable (visible 'Choose file' label)", await js(`(() => { const el = document.getElementById('cv-file-input'); return !!el && el.labels.length > 0 && el.labels[0].offsetParent !== null && !el.disabled; })()`));

  console.log("--- file validation");
  await js(`__cv.give([__cv.gif()])`); await sleep(300);
  check("GIF rejected with a clear message (role=alert)", /isn't supported/.test(await alertText()), await alertText());
  await js(`__cv.give([__cv.pdf(3 * 1024 * 1024 + 1)])`); await sleep(400);
  check("PDF over 3 MB rejected before sending", /larger than 3 MB/.test(await alertText()) && cvRequests().length === 0, await alertText());

  console.log("--- DOCX: extraction, redaction preview, consent, one request");
  await js(`__cv.give([__cv.fromBase64(${JSON.stringify(DOCX_B64)}, "amina-cv.docx", "")])`);
  await waitFor(`!!document.querySelector('[aria-label="Text extracted from your DOCX file"]')`, 15000, "docx preview");
  check("original DOCX text shown unaltered (contact details still visible there)", await js(`document.querySelector('[aria-label="Text extracted from your DOCX file"]').innerText.includes('amina.tariq@example.com')`));
  const sent = await js(`document.querySelector('[aria-label="Text that will be sent for analysis"]').innerText`);
  check("'text that will be sent' has email, phone and address removed, and says what was removed",
    !sent.includes("example.com") && !sent.includes("1234567") && !sent.includes("Gulberg") && sent.includes("[email removed]") && (await text("Removed 1 email address, 1 phone number, 1 address line")), sent);
  check("still disabled until consent", await js(`${btn("Analyze my CV")}.disabled`));
  await js(`document.querySelector('#cv-consent').click()`);
  await js(`(() => { const t = document.querySelector('#cv-job-description'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'Junior Flutter developer role'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(150);
  check("consent enables Analyze", !(await js(`${btn("Analyze my CV")}.disabled`)));
  await js(`${btn("Analyze my CV")}.click(); ${btn("Analyze my CV")}?.click();`);
  await waitFor(`document.querySelector('main [role=status]')?.innerText.includes('reading and analyzing')`, 5000, "loading");
  check("loading: status message, button disabled showing progress", (await js(`[...document.querySelectorAll('main button')].some(b => b.disabled && b.textContent.includes('Analyzing your CV'))`)));
  await waitFor(`document.querySelector('main').innerText.includes('Your CV analysis')`, 30000, "results");
  check("double click sent exactly one request", cvRequests().length === 1, cvRequests());
  const body1 = await postData(cvRequests()[0].id);
  check("request: text kind, redacted text only, both consent flags, job description",
    body1.source.kind === "text" && !body1.source.text.includes("example.com") && !body1.source.text.includes("1234567") && body1.source.text.includes("Flutter and Firebase") &&
    body1.consent.geminiFreeTier === true && body1.consent.noPermanentStorage === true && body1.jobDescription === "Junior Flutter developer role", { ...body1, source: { kind: body1.source.kind } });
  check("results: overall score with plain-language band, categories, ATS estimate, keywords",
    (await js(`!!document.querySelector('[aria-label="Overall CV score: 72 out of 100 (Good)"]')`)) && (await text("Category scores")) && (await text("ATS compatibility (estimate)")) && (await text("Only add these if you genuinely have")));
  check("job match shown because a job description was given", (await text("Match with the job description")) && (await text("Good fit for a junior mobile role.")));
  check("improvements ordered High priority first", await js(`(() => { const t = document.querySelector('main').innerText; return t.indexOf('Quantify your attendance app') < t.indexOf('Add a summary'); })()`));
  check("finished analysis announced to screen readers", (await js(`[...document.querySelectorAll('[aria-live=polite]')].some(r => r.textContent === 'CV analysis ready. Overall score 72 out of 100.')`)));

  console.log("--- results kept across navigation; nothing persisted");
  await nav("Dashboard"); await sleep(300); await nav("CV Analyzer"); await sleep(300);
  check("back on CV Analyzer: results still shown, no new request", (await text("Your CV analysis")) && cvRequests().length === 1);
  const stored = await js(`JSON.stringify({ s: Object.fromEntries(Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)])), l: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])) })`);
  check("no CV content in sessionStorage or localStorage", !/example\.com|attendance app|Flutter|amina|cv-analyze|overallScore/i.test(stored), stored.slice(0, 200));
  for (const w of [1440, 1024, 768, 390, 360]) { await viewport(w, w < 1024); await sleep(200); if (!(await noOverflow())) check(`${w}px results: no horizontal overflow`, false); }
  check("results layout: no horizontal overflow at 1440/1024/768/390/360", true);
  await viewport(1280);

  console.log("--- images: page order, quality warnings, request order");
  await js(`${btn("Analyze another CV")}.click()`); await sleep(300);
  check("'Analyze another CV' resets the form (consent cleared)", (await js(`!!document.querySelector('#cv-file-input') && !document.querySelector('#cv-consent').checked`)));
  await js(`(async () => __cv.give([await __cv.image("page-one.png", 1240, 1754, "P1", 0), await __cv.image("page-two.jpg", 600, 840, "P2", 0, "image/jpeg"), await __cv.image("page-three.png", 1240, 1754, "P3", 9)]))()`);
  await waitFor(`document.querySelectorAll('[aria-label="CV pages in order"] li').length === 3`, 20000, "3 pages");
  const warnings = await js(`[...document.querySelectorAll('[aria-label="CV pages in order"] li')].map(li => li.innerText)`);
  check("small page flagged as low resolution; blurred page flagged as blurry; sharp page has no warning",
    /quite small/.test(warnings[1]) && /looks blurry/.test(warnings[2]) && !/blurry|small|empty/.test(warnings[0]), warnings);
  await js(`document.querySelector('[aria-label="Move page 3 up"]').click()`); await sleep(200);
  const order = await js(`[...document.querySelectorAll('[aria-label="CV pages in order"] img')].map(i => i.alt)`);
  check("reordering: page 3 moved up (keyboard-operable buttons)", order.join() === "Page 1: page-one.png,Page 2: page-three.png,Page 3: page-two.jpg", order);
  check("no automatic redaction is claimed for images", await text("Contact details can't be removed automatically from PDF or image files"));
  const shown = await js(`(async () => { const out = []; for (const img of document.querySelectorAll('[aria-label="CV pages in order"] img')) out.push(await __cv.b64(img.src)); return out; })()`);
  await js(`document.querySelector('#cv-consent').click()`); await sleep(100);
  await js(`${btn("Analyze my CV")}.click()`);
  await waitFor(`document.querySelector('main').innerText.includes('Your CV analysis')`, 30000, "image results");
  const body2 = await postData(cvRequests()[1].id);
  check("request: 3 JPEG pages in exactly the order shown", body2.source.kind === "images" && body2.source.files.length === 3 && body2.source.files.every((f: any) => f.mimeType === "image/jpeg") &&
    body2.source.files.map((f: any) => f.data).join("|") === shown.join("|"), body2.source.files?.map((f: any) => f.data.length));
  check("no job description → no job-match section", !(await text("Match with the job description")) && !("jobDescription" in body2));

  console.log("--- PDF by drag and drop; unreadable result");
  await js(`${btn("Analyze another CV")}.click()`); await sleep(300);
  await js(`__cv.drop([__cv.pdf(4096)])`);
  await waitFor(`!!document.querySelector('object[type="application/pdf"]')`, 10000, "pdf preview");
  check("dropped PDF shows a preview with its name and a fallback link", (await text("my-cv.pdf")) && (await js(`!!document.querySelector('object[type="application/pdf"] a[target=_blank]')`)));
  await js(`document.querySelector('#cv-consent').click()`);
  await js(`(() => { const t = document.querySelector('#cv-job-description'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'MOCK_UNREADABLE'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(100); await js(`${btn("Analyze my CV")}.click()`);
  await waitFor(`document.querySelector('main').innerText.includes("We couldn't read your CV")`, 30000, "unreadable");
  const body3 = await postData(cvRequests()[2].id);
  check("request: inline PDF", body3.source.kind === "pdf" && body3.source.file.mimeType === "application/pdf" && body3.source.file.data.length > 1000);
  check("unreadable: clear message with the page detail, no fake scores, no retry for a file problem",
    (await text("Page 2 is too blurry to read.")) && !(await text("Your CV analysis")) && !(await js(`!!${btn("Try again")}`)), await alertText());

  console.log("--- shared cooldown after a 503");
  await js(`(() => { const t = document.querySelector('#cv-job-description'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'MOCK_OVERLOAD'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(100); await js(`${btn("Analyze my CV")}.click()`);
  await waitFor(`/Try again in \\d+s/.test(document.querySelector('main').innerText)`, 40000, "cooldown");
  check("503: safe busy message and the CV button shows the shared countdown", /busy|try again/i.test(await alertText()) && (await js(`[...document.querySelectorAll('main button')].some(b => b.disabled && /Try again in \\d+s/.test(b.textContent))`)), await alertText());
  const before = cvRequests().length;
  await nav("Career Finder"); await sleep(300);
  check("the same cooldown blocks Career Finder (shared, not a separate system)", await js(`/Try again in \\d+s/.test(document.querySelector('button[type=submit]').textContent) && document.querySelector('button[type=submit]').disabled`));
  await nav("CV Analyzer"); await sleep(200);
  await js(`${btn("Try again in")}?.click()`); await sleep(300);
  check("no request is sent during the cooldown", cvRequests().length === before);

  console.log("--- layout and accessibility of the upload page");
  for (const w of [1440, 1024, 768, 390, 360]) { await viewport(w, w < 1024); await sleep(200); if (!(await noOverflow())) check(`${w}px upload page: no horizontal overflow`, false); }
  check("upload page layout: no horizontal overflow at 1440/1024/768/390/360", true);
  await viewport(1280);
  check("form controls are labelled (consent, job description; file picker hidden while one PDF is chosen)",
    await js(`!document.getElementById('cv-file-input') && ['cv-consent','cv-job-description'].every(id => { const el = document.getElementById(id); return el && (el.labels?.length > 0 || el.getAttribute('aria-label')); })`));
  check("no skipped heading levels on the CV page", await js(`(() => { const l = [...document.querySelectorAll('main h1, main h2, main h3, main h4')].filter(h => h.offsetParent !== null).map(h => +h.tagName[1]); return l.every((v, i) => i === 0 || v <= l[i - 1] + 1); })()`));
  check("no console errors or exceptions", errors.length === 0, errors.slice(0, 3));
} catch (e) { fail++; console.log("FAIL  " + (e as Error).message); }
console.log(`\napi requests: ${JSON.stringify(api.map((a) => a.path))}\n${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
