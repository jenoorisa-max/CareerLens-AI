// CV Analyzer Stage 4 (frontend): file rules, image checks, DOCX extraction,
// contact redaction, request building, shared cooldown/duplicate protection,
// api.ts error extras, rendering of every state, and privacy rules.
const root = new URL("../../", import.meta.url).href.slice(0, -1); // repository root (no trailing slash)
const { readFileSync, readdirSync } = await import("node:fs");
const React = (await import(`${root}/node_modules/react/index.js`)).default;
const { renderToStaticMarkup } = await import(`${root}/node_modules/react-dom/server.node.js`);
const files = await import(`${root}/src/features/cv/lib/files.ts`);
const images = await import(`${root}/src/features/cv/lib/images.ts`);
const { redactContactDetails, describeRedaction, REDACTION_MARKERS } = await import(`${root}/src/features/cv/lib/redaction.ts`);
const { extractDocxText, tidyExtractedText } = await import(`${root}/src/features/cv/lib/docx.ts`);
const { buildCvAnalyzeRequest, checkBeforeSend, REQUEST_MESSAGES } = await import(`${root}/src/features/cv/lib/request.ts`);
const { createRequestCoordinator, COOLDOWN_MS } = await import(`${root}/src/lib/requests.ts`);
const { postJSON } = await import(`${root}/src/lib/api.ts`);
const { CV_LIMITS } = await import(`${root}/src/shared/cvLimits.ts`);
const CvAnalyzer = (await import(`${root}/src/features/cv/CvAnalyzer.tsx`)).default;
const CvResults = (await import(`${root}/src/features/cv/CvResults.tsx`)).default;
const CvUploadPanel = (await import(`${root}/src/features/cv/CvUploadPanel.tsx`)).default;
const JSZip = (await import(`${root}/node_modules/jszip/lib/index.js`)).default;

let pass = 0, fail = 0;
const check = (l: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : "  -> " + JSON.stringify(d)?.slice(0, 400)}`); };
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const noop = () => {};

console.log("--- file type detection (real bytes, not just the extension)");
const head = (bytes: number[]) => Uint8Array.from([...bytes, ...new Array(16).fill(0)].slice(0, 16));
const PDF_HEAD = head([0x25, 0x50, 0x44, 0x46, 0x2d]), PNG_HEAD = head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), JPG_HEAD = head([0xff, 0xd8, 0xff, 0xe0]), ZIP_HEAD = head([0x50, 0x4b, 0x03, 0x04]);
check("PDF, PNG, JPEG and DOCX detected from their bytes",
  files.detectKind("cv.pdf", PDF_HEAD) === "pdf" && files.detectKind("p.png", PNG_HEAD) === "image" && files.detectKind("p.JPG", JPG_HEAD) === "image" && files.detectKind("cv.docx", ZIP_HEAD) === "docx");
check("a renamed file is rejected (EXE named cv.pdf; ZIP named cv.zip; GIF)", files.detectKind("cv.pdf", head([0x4d, 0x5a])) === null && files.detectKind("cv.zip", ZIP_HEAD) === null && files.detectKind("a.gif", head([0x47, 0x49, 0x46, 0x38])) === null);
check("type follows the bytes: a PDF named .png is treated as a PDF", files.detectKind("page.png", PDF_HEAD) === "pdf");

console.log("--- selection rules and limits");
const f = (name: string, size: number, kind: any) => ({ name, size, kind });
const MB = 1024 * 1024;
const sel = (incoming: any[], current: any = null) => files.checkSelection(incoming, current);
check("one PDF up to exactly 3 MB is accepted", sel([f("cv.pdf", 3 * MB, "pdf")]) === null);
check("PDF over 3 MB rejected with advice", sel([f("cv.pdf", 3 * MB + 1, "pdf")]) === files.FILE_MESSAGES.pdfTooLarge);
check("two PDFs rejected", sel([f("a.pdf", 10, "pdf"), f("b.pdf", 10, "pdf")]) === files.FILE_MESSAGES.onePdf);
check("DOCX up to 10 MB accepted; larger rejected", sel([f("cv.docx", 10 * MB, "docx")]) === null && sel([f("cv.docx", 10 * MB + 1, "docx")]) === files.FILE_MESSAGES.docxTooLarge);
check("mixing types rejected", sel([f("a.pdf", 10, "pdf"), f("p.png", 10, "image")]) === files.FILE_MESSAGES.mixed);
check("5 images accepted; 6 rejected", sel(Array.from({ length: 5 }, (_, i) => f(`${i}.png`, 10, "image"))) === null && sel(Array.from({ length: 6 }, (_, i) => f(`${i}.png`, 10, "image"))) === files.FILE_MESSAGES.tooManyImages);
check("adding images counts pages already chosen (3 + 3 > 5)", sel([1, 2, 3].map((i) => f(`${i}.jpg`, 10, "image")), { kind: "image", count: 3 }) === files.FILE_MESSAGES.tooManyImages);
check("a PDF replaces existing images (allowed)", sel([f("cv.pdf", 10, "pdf")], { kind: "image", count: 4 }) === null);
check("image over 15 MB rejected", sel([f("huge.jpg", 15 * MB + 1, "image")]) === files.FILE_MESSAGES.imageTooLarge);
check("unsupported, old .doc and empty files have clear messages",
  sel([f("cv.txt", 10, null)]) === files.FILE_MESSAGES.unsupported && sel([f("cv.doc", 10, null)]) === files.FILE_MESSAGES.oldWord && sel([f("cv.pdf", 0, "pdf")]) === files.FILE_MESSAGES.empty);
check("page reordering moves one page and keeps the rest in order", JSON.stringify(files.moveItem(["p1", "p2", "p3"], 2, 0)) === '["p3","p1","p2"]' && JSON.stringify(files.moveItem(["p1", "p2"], 0, 5)) === '["p1","p2"]');

console.log("--- image resizing and quality checks");
check("resize keeps aspect ratio within 1600px; small images untouched",
  JSON.stringify(images.fitWithin(4000, 3000, 1600)) === '{"width":1600,"height":1200}' && JSON.stringify(images.fitWithin(800, 1200, 1600)) === '{"width":800,"height":1200}');
const W = 64, H = 64;
const pattern = (fn: (x: number, y: number) => number) => { const g = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = fn(x, y); return g; };
const sharp = pattern((x, y) => ((x >> 1) + (y >> 1)) % 2 ? 255 : 0); // crisp "text-like" edges
const blurred = pattern((x) => 128 + 40 * Math.sin(x / 10));        // soft gradients
const blank = pattern(() => 250);
const vSharp = images.laplacianVariance(sharp, W, H), vBlur = images.laplacianVariance(blurred, W, H);
check(`sharpness: crisp page scores far higher than a blurred one (${Math.round(vSharp)} vs ${vBlur.toFixed(2)})`, vSharp > images.BLUR_THRESHOLD && vBlur < images.BLUR_THRESHOLD);
check("blank page: very low contrast", images.standardDeviation(blank) < images.BLANK_THRESHOLD && images.standardDeviation(sharp) > 50);
check("quality warnings: blurry, low resolution, blank",
  JSON.stringify(images.assessImage({ width: 1600, height: 1200, sharpness: 5, contrast: 60 })) === '["blurry"]' &&
  JSON.stringify(images.assessImage({ width: 600, height: 800, sharpness: 500, contrast: 60 })) === '["low-resolution"]' &&
  JSON.stringify(images.assessImage({ width: 1600, height: 1200, sharpness: 500, contrast: 1 })) === '["blank"]' &&
  images.assessImage({ width: 1600, height: 1200, sharpness: 500, contrast: 60 }).length === 0);
check("grayscale conversion uses standard brightness weights", Math.round(images.toGrayscale(Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]), 2)[0]) === 76);

console.log("--- DOCX extraction (real DOCX built in the test, extracted with mammoth)");
const docxXml = (paras: string[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
async function makeDocx(paras: string[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", docxXml(paras));
  return zip.generateAsync({ type: "arraybuffer" });
}
const docx = await makeDocx(["Amina Tariq", "BS Computer Science, 2025", "Built an attendance app with Flutter."]);
const extracted = await extractDocxText(docx);
check("text extracted from a real DOCX, paragraphs kept in order", /^Amina Tariq\n+BS Computer Science, 2025\n+Built an attendance app with Flutter\.$/.test(extracted.text), extracted.text);
check("extra blank lines collapsed, words untouched", tidyExtractedText("A  \n\n\n\nB\r\nC") === "A\n\nB\nC");
let corruptRejected = false;
try { await extractDocxText(new TextEncoder().encode("not a zip").buffer); } catch { corruptRejected = true; }
check("a corrupt DOCX throws (the page shows a friendly error)", corruptRejected);

console.log("--- contact-detail redaction (DOCX text)");
const CV = [
  "Amina Tariq",
  "amina.tariq@example.com | +92 300 1234567 | House 12, Street 4, Gulberg, Lahore",
  "Address: Flat 3B, 22 Canal Road, Lahore 54000",
  "Phone: (042) 3576-1234   Alt: 0300-7654321",
  "Education: BS Computer Science, 2021 - 2025, CGPA 3.62/4.00",
  "Experience: Intern, 06/2024 – 08/2024; Phase 2 of the project delivered",
  "Portfolio: https://linkedin.com/in/amina-123456789 and github.com/amina",
].join("\n");
const red = redactContactDetails(CV);
check("emails removed", !red.text.includes("example.com") && red.counts.emails === 1);
check("phone numbers removed in several formats (+92, (042), 0300-)", !red.text.includes("300 1234567") && !red.text.includes("3576-1234") && !red.text.includes("7654321") && red.counts.phones === 3, red.counts);
check("address lines removed (labelled line and the address part of a contact line)", !red.text.includes("Canal Road") && !red.text.includes("Gulberg") && red.counts.addresses === 2, red.text);
check("not removed: year ranges, dates, GPA, project wording, URLs with digits",
  red.text.includes("2021 - 2025") && red.text.includes("06/2024 – 08/2024") && red.text.includes("3.62/4.00") && red.text.includes("Phase 2 of the project") && red.text.includes("amina-123456789"), red.text);
check("name, education and experience untouched; markers are visible", red.text.startsWith("Amina Tariq\n") && red.text.includes("BS Computer Science") && red.text.includes(REDACTION_MARKERS.email) && red.text.includes(REDACTION_MARKERS.phone) && red.text.includes(REDACTION_MARKERS.address));
check("redaction is stable when applied twice", redactContactDetails(red.text).text === red.text);
check("summary text is honest when nothing is found", describeRedaction({ emails: 0, phones: 0, addresses: 0 }) === "No contact details were detected." && describeRedaction(red.counts).startsWith("Removed 1 email address, 3 phone numbers, 2 address lines"));

console.log("--- request building and client-side limits");
const longText = "Experienced student with projects. ".repeat(3);
const png = (bytes: number, data: string) => ({ data, mimeType: "image/jpeg", bytes });
check("consent is required before sending", checkBeforeSend({ kind: "text", text: longText }, { consent: false, jobDescription: "" }) === REQUEST_MESSAGES.consent);
check("text too short / too long rejected; valid text accepted",
  checkBeforeSend({ kind: "text", text: "short" }, { consent: true, jobDescription: "" }) === REQUEST_MESSAGES.empty &&
  checkBeforeSend({ kind: "text", text: "a".repeat(CV_LIMITS.maxTextChars + 1) }, { consent: true, jobDescription: "" }) === REQUEST_MESSAGES.tooLong &&
  checkBeforeSend({ kind: "text", text: longText }, { consent: true, jobDescription: "" }) === null);
check("images: total over 3 MB rejected, more than 5 rejected",
  checkBeforeSend({ kind: "images", pages: [png(2 * MB, "a"), png(1.2 * MB, "b")] }, { consent: true, jobDescription: "" }) === REQUEST_MESSAGES.tooLarge &&
  checkBeforeSend({ kind: "images", pages: Array.from({ length: 6 }, (_, i) => png(10, String(i))) }, { consent: true, jobDescription: "" }) === REQUEST_MESSAGES.tooManyImages);
check("job description over the limit rejected", checkBeforeSend({ kind: "text", text: longText }, { consent: true, jobDescription: "j".repeat(CV_LIMITS.maxJobDescriptionChars + 1) }) === REQUEST_MESSAGES.jobDescription);
const reqImages = buildCvAnalyzeRequest({ kind: "images", pages: [png(1, "PAGE1"), png(1, "PAGE2"), png(1, "PAGE3")] }, { jobDescription: "  Junior dev  " });
check("images request: pages in the arranged order, JPEG, consent flags true, job description trimmed",
  reqImages.source.kind === "images" && (reqImages.source as any).files.map((x: any) => x.data).join() === "PAGE1,PAGE2,PAGE3" && (reqImages.source as any).files[0].mimeType === "image/jpeg" &&
  reqImages.consent.geminiFreeTier === true && reqImages.consent.noPermanentStorage === true && reqImages.jobDescription === "Junior dev", reqImages);
const reqPdf = buildCvAnalyzeRequest({ kind: "pdf", data: "PDFDATA", bytes: 10 }, { jobDescription: "   " });
check("PDF request: inline PDF, blank job description omitted", (reqPdf.source as any).file.mimeType === "application/pdf" && (reqPdf.source as any).file.data === "PDFDATA" && !("jobDescription" in reqPdf));
const reqText = buildCvAnalyzeRequest({ kind: "text", text: red.text }, { jobDescription: "" });
check("DOCX request: sends the (redacted) text only", reqText.source.kind === "text" && !(reqText.source as any).text.includes("example.com"));

console.log("--- shared cooldown and duplicate protection (real coordinator)");
{
  let now = 1_000_000;
  const calls: string[] = [];
  const careerPosts: any[] = [];
  const store = { getProfile: () => null, getSkillGap: () => undefined, getRoadmap: () => undefined, commitAssessment: noop, onSearchFailed: noop,
    setSkillGap: noop, setRoadmap: noop, setError: noop, onRequestsChanged: noop, onCooldownChanged: noop };
  const post = (url: string) => new Promise((resolve) => careerPosts.push({ url, resolve }));
  const c = createRequestCoordinator(store as any, post as any, { now: () => now });
  let release: (v: any) => void = noop;
  const send = () => { calls.push("send"); return new Promise<any>((r) => (release = r)); };
  const p1 = c.runShared("cv-analyze", send), p2 = c.runShared("cv-analyze", send);
  check("duplicate submissions share one request", calls.length === 1 && p1 !== null && p2 !== null && c.isSharedPending("cv-analyze"));
  c.reset(); // "New Assessment" in the career features
  check("a new career assessment does not cancel the CV request", c.isSharedPending("cv-analyze"));
  release({ ok: false, status: 503, message: "busy" });
  const r1 = await p1, r2 = await p2;
  check("both callers get the same result; request no longer pending", r1 === r2 && !c.isSharedPending("cv-analyze"));
  check("a CV 503 starts the SAME global cooldown", c.isCoolingDown() && c.cooldownUntil === now + COOLDOWN_MS);
  check("during the cooldown: CV requests are not sent (null)", c.runShared("cv-analyze", send) === null && calls.length === 1);
  await c.findCareers({ name: "x" } as any);
  check("…and career features are blocked too (shared cooldown)", careerPosts.length === 0);
  now += COOLDOWN_MS + 1;
  const p3 = c.runShared("cv-analyze", send)!;
  release({ ok: true, status: 200, data: { overallScore: 70 } });
  check("after the cooldown: a new CV request is sent; success starts no cooldown", (await p3).ok === true && calls.length === 2 && !c.isCoolingDown());
  const p4 = c.runShared("cv-analyze", send)!;
  release({ ok: false, status: 429, message: "rate" });
  await p4;
  check("a CV 429 also starts the shared cooldown", c.isCoolingDown());
  now += COOLDOWN_MS + 1;
  const p5 = c.runShared("cv-analyze", send)!;
  release({ ok: false, status: 400, message: "bad", code: "consent_required" });
  await p5;
  check("a 400 does not start a cooldown", !c.isCoolingDown());
}

console.log("--- api.ts: optional error code/detail (existing results unchanged)");
{
  const realFetch = globalThis.fetch;
  const respond = (status: number, body: unknown) => { globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as any; };
  respond(422, { error: "Unreadable.", code: "unreadable", detail: "Page 2 is blurry." });
  const r = await postJSON("/api/cv-analyze", {}, "fallback");
  check("CV error: message, code and detail passed through", !r.ok && r.message === "Unreadable." && r.code === "unreadable" && r.detail === "Page 2 is blurry.", r);
  respond(400, { error: "Please enter your name." });
  const legacy = await postJSON("/api/careers", {}, "fallback");
  check("existing endpoints: failure result has exactly the same fields as before", JSON.stringify(legacy) === JSON.stringify({ ok: false, status: 400, message: "Please enter your name." }), legacy);
  respond(200, { data: { a: 1 } });
  const okr = await postJSON("/api/careers", {}, "fallback");
  check("success result unchanged", JSON.stringify(okr) === JSON.stringify({ ok: true, status: 200, data: { a: 1 } }));
  globalThis.fetch = realFetch;
}

console.log("--- rendering: page, consent, upload panel, results");
const page = renderToStaticMarkup(React.createElement(CvAnalyzer, { runShared: () => null, cooldownSeconds: 0 }));
const pt = text(page);
check("one h1, upload/options/consent steps", (page.match(/<h1\b/g) ?? []).length === 1 && ["1. Upload your CV", "2. Target a job (optional)", "3. Privacy and consent"].every((s) => pt.includes(s)));
check("consent text: sent to Google's Gemini API free tier; not permanently stored; Google's own terms", pt.includes("Google's Gemini API (free tier)") && pt.includes("CareerLens does not permanently store your CV") && pt.includes("Google's own terms") && page.includes('href="https://ai.google.dev/gemini-api/terms"'));
check("no claim that Google does not retain or use the data", !/Google (does not|doesn't|will not|won't) (store|retain|use|keep)/i.test(pt));
check("consent checkbox starts unchecked; Analyze button disabled until a file and consent", /id="cv-consent"(?![^>]*checked)/.test(page) && /<button[^>]*disabled=""[^>]*>[^]*?Analyze my CV/.test(page) && pt.includes("Upload your CV to continue."));
check("file input: accepts PDF/DOCX/JPG/PNG, multiple, labelled", /id="cv-file-input"[^>]*accept="\.pdf,\.docx,\.jpg,\.jpeg,\.png/.test(page) && /<label[^>]*for="cv-file-input"/.test(page) && page.includes("multiple"));
check("job description: labelled, with live counter 0/5,000", /<label[^>]*for="cv-job-description"/.test(page) && pt.includes("0/5,000"));
const cool = text(renderToStaticMarkup(React.createElement(CvAnalyzer, { runShared: () => null, cooldownSeconds: 9 })));
check("shared cooldown shown on the CV button ('Try again in 9s')", cool.includes("Try again in 9s"));
check("reduced motion: spinners/skeletons only with motion-safe", !/\banimate-(spin|pulse)\b/.test(page.replace(/motion-safe:animate-(spin|pulse)/g, "")));

const panel = (upload: any, extra: object = {}) => renderToStaticMarkup(React.createElement(CvUploadPanel, { upload, processing: false, error: null, disabled: false, redact: true, redaction: null,
  onFiles: noop, onRemovePage: noop, onMovePage: noop, onClear: noop, onRedactChange: noop, ...extra }));
const docxPanel = panel({ kind: "docx", name: "cv.docx", bytes: 1000, text: CV }, { redaction: red });
check("DOCX preview: original text shown unaltered, plus a separate 'text that will be sent' with the redaction summary",
  docxPanel.includes("amina.tariq@example.com") && docxPanel.includes('aria-label="Text that will be sent for analysis"') && text(docxPanel).includes("Removed 1 email address") && text(docxPanel).includes("Automatic detection can miss details"));
check("DOCX: redaction checkbox offered", docxPanel.includes('id="cv-redact"'));
const pdfPanel = text(panel({ kind: "pdf", name: "cv.pdf", bytes: 2000, data: "x", previewUrl: "blob:x" }));
check("PDF: no automatic-redaction claim; tells the student to redact the file themselves",
  !pdfPanel.includes("Remove my contact details") && pdfPanel.includes("Contact details can't be removed automatically from PDF or image files"));
const img = (w: string[]) => ({ data: "x", mimeType: "image/jpeg", bytes: 1000, width: 1600, height: 1200, warnings: w, previewUrl: "blob:p" });
const imgPanel = panel({ kind: "images", pages: [{ id: "a", name: "one.jpg", image: img([]) }, { id: "b", name: "two.jpg", image: img(["blurry"]) }] });
check("images: pages numbered in order, blur warning shown, move buttons disabled at the ends",
  text(imgPanel).includes("Page 1") && text(imgPanel).includes("Page 2") && text(imgPanel).includes("This page looks blurry") &&
  /disabled=""[^>]*aria-label="Move page 1 up"/.test(imgPanel) && /disabled=""[^>]*aria-label="Move page 2 down"/.test(imgPanel) && !/disabled=""[^>]*aria-label="Move page 1 down"/.test(imgPanel));
check("upload errors are announced (role=alert)", /role="alert"[^>]*>[^]*?Too big/.test(panel(null, { error: "Too big" })));

const sample = {
  candidateStage: "Student", overallScore: 72, overallSummary: "Solid.",
  categoryScores: { contentQuality: { score: 68, explanation: "c" }, completeness: { score: 74, explanation: "d" }, careerRelevance: { score: 80, explanation: "e" }, professionalPresentation: { score: 70, explanation: "f" } },
  strengths: ["S1"], weaknesses: [], missingSections: [{ section: "Summary", importance: "Recommended", suggestion: "Add it." }],
  languageIssues: [{ type: "Style", excerpt: "Helped with tasks", issue: "Vague", suggestion: "Be specific" }], weakDescriptions: [], formattingIssues: [],
  ats: { estimatedScore: 66, summary: "OK", parsingRisks: ["Tables"] }, keywords: { present: ["Flutter"], missing: ["Git"] },
  improvements: [{ priority: "Low", action: "Low thing", reason: "r" }, { priority: "High", action: "High thing", reason: "r" }],
};
const res = renderToStaticMarkup(React.createElement(CvResults, { analysis: sample, onStartOver: noop }));
const rt = text(res);
check("overall score as an accessible image label with a plain-language band", res.includes('aria-label="Overall CV score: 72 out of 100 (Good)"'));
check("four category scores with accessible bars", ["Content quality", "Completeness", "Career relevance", "Professional presentation"].every((l) => res.includes(`aria-label="${l}: `)) && (res.match(/role="progressbar"/g) ?? []).length === 5);
check("ATS shown as an estimate, not a guarantee", rt.includes("ATS compatibility (estimate)") && rt.includes("Not a guarantee — no real ATS was used."));
check("missing keywords carry an honesty note", rt.includes("Only add these if you genuinely have the skill or experience."));
check("improvements: High priority listed first", rt.indexOf("High thing") < rt.indexOf("Low thing"));
check("empty sections say so instead of inventing content", rt.includes("No specific weaknesses were listed.") && rt.includes("No weak descriptions were found.") && rt.includes("No formatting issues were found."));
check("no job-match section without a job description", !rt.includes("Match with the job description"));
const withJob = text(renderToStaticMarkup(React.createElement(CvResults, { analysis: { ...sample, jobMatch: { matchScore: 74, summary: "Good fit.", matchedRequirements: ["Flutter"], gaps: ["Git"] } }, onStartOver: noop })));
check("job match shown when provided", withJob.includes("Match with the job description") && withJob.includes("74/100") && withJob.includes("Good fit."));
check("results: headings ordered (h2 sections, h3 items), AI disclaimer present", !/<h4/.test(res) && rt.includes("generated by AI and can be wrong"));

console.log("--- privacy: CV data is never persisted");
const cvSources = readdirSync(new URL("../../src/features/cv/", import.meta.url), { recursive: true })
  .filter((p: any) => /\.(ts|tsx)$/.test(String(p)))
  .map((p: any) => readFileSync(new URL(`../../src/features/cv/${String(p).replace(/\\/g, "/")}`, import.meta.url), "utf8")).join("\n")
  // Code only: comments may (rightly) mention that storage is NOT used.
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("comment stripping kept the real code to check", cvSources.includes("runShared") && cvSources.includes("redactContactDetails"));
check("CV feature code never uses localStorage, sessionStorage or IndexedDB", !/localStorage|sessionStorage|indexedDB/.test(cvSources));
const app = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");
const sessionSrc = readFileSync(new URL("../../src/lib/session.ts", import.meta.url), "utf8");
check("the saved session has no CV fields (only the open page name may be 'cv')", !/cv(Upload|Result|Analysis|Text)/i.test(sessionSrc) && /TABS: ActiveTab\[\] = \[[^\]]*"cv"/.test(sessionSrc));
check("App keeps the CV page mounted (hidden) instead of storing CV data", app.includes('<div hidden={activeTab !== "cv"}>') && app.includes("runShared={requests.runShared}"));
check("sidebar has a CV Analyzer entry", readFileSync(new URL("../../src/components/SidebarNav.tsx", import.meta.url), "utf8").includes('{ id: "cv", label: "CV Analyzer"'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
