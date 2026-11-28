import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ExternalLink, FileSearch, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import CvUploadPanel, { type CvUpload } from "./CvUploadPanel";
import CvResults from "./CvResults";
import { checkSelection, detectKind, moveItem, type CandidateFile } from "./lib/files";
import { blobToBase64, prepareImage } from "./lib/images";
import { extractDocxText } from "./lib/docx";
import { redactContactDetails } from "./lib/redaction";
import { buildCvAnalyzeRequest, checkBeforeSend, type PreparedCv } from "./lib/request";
import { CV_LIMITS } from "../../shared/cvLimits";
import { postJSON, type ApiResult } from "../../lib/api";
import type { CvAnalysis } from "../../types/cv";

/** The shared coordinator's runShared(): global cooldown + duplicate protection. */
export type RunShared = <T>(key: string, send: () => Promise<ApiResult<T>>) => Promise<ApiResult<T>> | null;

interface CvAnalyzerProps {
  runShared: RunShared;
  cooldownSeconds: number;
}

export const CV_REQUEST_KEY = "cv-analyze";
export const GEMINI_TERMS_URL = "https://ai.google.dev/gemini-api/terms";
const PAGE_BUDGET_BYTES = Math.floor(CV_LIMITS.maxTotalFileBytes / CV_LIMITS.maxImages);

type Failure = { message: string; code?: string; detail?: string; status: number };

let pageCounter = 0;

/**
 * CV Analyzer page. Privacy: the CV (file data, extracted text, results) lives
 * only in this component's memory. It is never written to localStorage,
 * sessionStorage or the app's saved session, and is gone when the tab closes.
 */
export default function CvAnalyzer({ runShared, cooldownSeconds }: CvAnalyzerProps) {
  const [upload, setUpload] = useState<CvUpload | null>(null);
  const [processing, setProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [redact, setRedact] = useState(true);
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [result, setResult] = useState<CvAnalysis | null>(null);
  const sending = useRef(false);
  const lastRequest = useRef<ReturnType<typeof buildCvAnalyzeRequest> | null>(null);

  // Object URLs (PDF preview, image thumbnails) are released when replaced or on unmount.
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const releaseUrls = (keep: string[] = []) => {
    urls.current.filter((u) => !keep.includes(u)).forEach((u) => URL.revokeObjectURL(u));
    urls.current = urls.current.filter((u) => keep.includes(u));
  };

  const redaction = useMemo(
    () => (upload?.kind === "docx" && redact ? redactContactDetails(upload.text) : null),
    [upload, redact]
  );

  const prepared: PreparedCv | null = !upload
    ? null
    : upload.kind === "docx"
      ? { kind: "text", text: redaction ? redaction.text : upload.text }
      : upload.kind === "pdf"
        ? { kind: "pdf", data: upload.data, bytes: upload.bytes }
        : { kind: "images", pages: upload.pages.map((p) => ({ data: p.image.data, mimeType: p.image.mimeType, bytes: p.image.bytes })) };

  const busy = processing || loading;

  async function handleFiles(files: File[]) {
    if (busy || files.length === 0) return;
    setUploadError(null);
    setFailure(null);
    const candidates: CandidateFile[] = await Promise.all(
      files.map(async (f) => ({ name: f.name, size: f.size, kind: detectKind(f.name, new Uint8Array(await f.slice(0, 16).arrayBuffer())) }))
    );
    const current = upload ? { kind: upload.kind === "images" ? ("image" as const) : upload.kind, count: upload.kind === "images" ? upload.pages.length : 1 } : null;
    const problem = checkSelection(candidates, current);
    if (problem) return setUploadError(problem);

    const kind = candidates[0].kind;
    setProcessing(true);
    try {
      if (kind === "pdf") {
        const file = files[0];
        const previewUrl = URL.createObjectURL(file);
        releaseUrls();
        urls.current.push(previewUrl);
        setUpload({ kind: "pdf", name: file.name, bytes: file.size, data: await blobToBase64(file), previewUrl });
      } else if (kind === "docx") {
        const file = files[0];
        let text = "";
        try {
          text = (await extractDocxText(await file.arrayBuffer())).text;
        } catch {
          return setUploadError("This DOCX file could not be read. Please check the file, or save it as a PDF and try again.");
        }
        if (text.replace(/\s/g, "").length < CV_LIMITS.minTextChars) {
          return setUploadError("We couldn't find enough text in this DOCX file. If your CV is mostly images, upload it as a PDF or as page images instead.");
        }
        releaseUrls();
        setUpload({ kind: "docx", name: file.name, bytes: file.size, text });
      } else {
        const pages: Array<{ id: string; name: string; image: Awaited<ReturnType<typeof prepareImage>> }> = [];
        for (const file of files) {
          try {
            const image = await prepareImage(file, PAGE_BUDGET_BYTES);
            urls.current.push(image.previewUrl);
            pages.push({ id: `page-${++pageCounter}`, name: file.name, image });
          } catch {
            return setUploadError(`"${file.name}" could not be opened as an image. Please check the file and try again.`);
          }
        }
        setUpload((prev) => {
          const kept = prev?.kind === "images" ? prev.pages : [];
          if (prev && prev.kind !== "images") releaseUrls(pages.map((p) => p.image.previewUrl));
          return { kind: "images", pages: [...kept, ...pages] };
        });
      }
    } finally {
      setProcessing(false);
    }
  }

  function clearUpload() {
    releaseUrls();
    setUpload(null);
    setUploadError(null);
    setFailure(null);
  }

  function startOver() {
    clearUpload();
    setResult(null);
    setJobDescription("");
    setConsent(false);
    lastRequest.current = null;
    window.scrollTo({ top: 0 });
  }

  async function send(body: ReturnType<typeof buildCvAnalyzeRequest>) {
    if (sending.current) return; // duplicate clicks while a request is starting
    const pending = runShared<CvAnalysis>(CV_REQUEST_KEY, () => postJSON<CvAnalysis>("/api/cv-analyze", body, "We couldn't analyze your CV. Please try again."));
    if (!pending) return; // shared cooldown: the button already shows the countdown
    sending.current = true;
    setLoading(true);
    setFailure(null);
    try {
      const outcome = await pending;
      if (outcome.ok) {
        setResult(outcome.data);
        lastRequest.current = null;
        window.scrollTo({ top: 0 });
      } else {
        setFailure({ message: outcome.message, code: outcome.code, detail: outcome.detail, status: outcome.status });
      }
    } finally {
      sending.current = false;
      setLoading(false);
    }
  }

  function analyze() {
    if (!prepared || busy) return;
    const problem = checkBeforeSend(prepared, { consent, jobDescription });
    if (problem) return setFailure({ message: problem, status: 0 });
    const body = buildCvAnalyzeRequest(prepared, { jobDescription });
    lastRequest.current = body;
    void send(body);
  }

  const coolingDown = cooldownSeconds > 0;
  const canAnalyze = Boolean(prepared) && consent && !busy && !coolingDown;
  // Retry is offered for temporary problems only (not for input the server rejected).
  const retryable = failure && lastRequest.current && (failure.status === 0 ? false : failure.status >= 500 || failure.status === 429 || failure.status === 408);
  const jdLength = jobDescription.trim().length;

  return (
    <div className="space-y-6 animate-enter">
      <section className="cl-card cl-card-hero p-6 sm:p-8">
        <p className="cl-eyebrow">CV Analyzer</p>
        <h1 className="mt-2 text-heading font-bold text-ink">Get clear, honest feedback on your CV</h1>
        <p className="mt-2 max-w-2xl text-ink-muted">
          Upload your CV to see an overall score, category scores, an estimated ATS compatibility check, and concrete
          suggestions to improve it. Add a job description to see how well your CV matches it.
        </p>
      </section>

      {result ? (
        <CvResults analysis={result} onStartOver={startOver} />
      ) : (
        <>
          <CvUploadPanel
            upload={upload}
            processing={processing}
            error={uploadError}
            disabled={busy}
            redact={redact}
            redaction={redaction}
            onFiles={(f) => void handleFiles(f)}
            onRemovePage={(i) => setUpload((prev) => {
              if (prev?.kind !== "images") return prev;
              const removed = prev.pages[i];
              if (removed) { URL.revokeObjectURL(removed.image.previewUrl); urls.current = urls.current.filter((u) => u !== removed.image.previewUrl); }
              const pages = prev.pages.filter((_, j) => j !== i);
              return pages.length ? { kind: "images", pages } : null;
            })}
            onMovePage={(from, to) => setUpload((prev) => (prev?.kind === "images" ? { kind: "images", pages: moveItem(prev.pages, from, to) } : prev))}
            onClear={clearUpload}
            onRedactChange={setRedact}
          />

          <section className="cl-card p-6 sm:p-8" aria-labelledby="cv-options-title">
            <div className="flex items-start gap-3">
              <span className="cl-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-control">
                <FileSearch className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="cv-options-title" className="font-display text-lg font-bold text-ink">2. Target a job (optional)</h2>
                <p className="mt-0.5 text-sm text-ink-muted">Paste a job description to see how well your CV matches it.</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="cv-job-description" className="cl-label mb-0">Job description</label>
                <span id="cv-job-description-count" className={`text-xs tabular-nums ${jdLength > CV_LIMITS.maxJobDescriptionChars ? "font-semibold text-red-700" : "text-ink-muted"}`}>
                  {jdLength.toLocaleString("en-US")}/{CV_LIMITS.maxJobDescriptionChars.toLocaleString("en-US")}
                </span>
              </div>
              <textarea
                id="cv-job-description"
                rows={5}
                value={jobDescription}
                disabled={busy}
                onChange={(e) => setJobDescription(e.target.value)}
                aria-describedby="cv-job-description-count"
                aria-invalid={jdLength > CV_LIMITS.maxJobDescriptionChars}
                placeholder="Optional: paste the job advert or its requirements here"
                className="cl-input mt-1.5 resize-y"
              />
            </div>
          </section>

          <section className="cl-card cl-card-tint p-6 sm:p-8" aria-labelledby="cv-consent-title">
            <div className="flex items-start gap-3">
              <span className="cl-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-control">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="cv-consent-title" className="font-display text-lg font-bold text-ink">3. Privacy and consent</h2>
                <ul className="mt-2 space-y-1.5 text-sm text-ink">
                  <li>• Your CV content is sent to <strong>Google's Gemini API (free tier)</strong> to create this analysis.</li>
                  <li>• <strong>CareerLens does not permanently store your CV.</strong> It is used for this request only and kept in this browser tab until you start over or close it.</li>
                  <li>
                    • Google's handling of free-tier data is governed by{" "}
                    <a href={GEMINI_TERMS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-strong underline">
                      Google's own terms<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
                    </a>
                    , which may allow Google to use it to improve its services. Avoid including anything you don't want to share.
                  </li>
                </ul>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-control border border-line bg-surface p-3.5">
                  <input
                    id="cv-consent"
                    type="checkbox"
                    checked={consent}
                    disabled={busy}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                  />
                  <span className="text-sm font-semibold text-ink">
                    I understand, and I agree to send my CV to Google's Gemini API for analysis.
                  </span>
                </label>
              </div>
            </div>
          </section>

          <section className="cl-card p-6" aria-label="Analyze your CV">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p id="cv-analyze-help" className="text-sm text-ink-muted">
                {!upload
                  ? "Upload your CV to continue."
                  : !consent
                    ? "Please confirm the privacy notice to continue."
                    : coolingDown
                      ? `The AI service is busy. You can try again in ${cooldownSeconds}s.`
                      : "Ready when you are. Analysis usually takes 10–30 seconds."}
              </p>
              <button type="button" onClick={analyze} disabled={!canAnalyze} aria-describedby="cv-analyze-help" className="cl-btn cl-btn-primary shrink-0 px-6 py-3">
                {loading ? (
                  <><Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Analyzing your CV…</>
                ) : coolingDown ? (
                  <span>Try again in {cooldownSeconds}s</span>
                ) : (
                  <><Sparkles className="h-4 w-4" aria-hidden="true" /> Analyze my CV</>
                )}
              </button>
            </div>
          </section>

          {loading && (
            <section className="space-y-4" aria-busy="true">
              <div role="status" className="cl-card p-5">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 shrink-0 text-primary motion-safe:animate-spin" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-ink">CareerLens AI is reading and analyzing your CV…</p>
                    <p className="text-xs text-ink-muted">Checking content, structure, language and ATS readiness.</p>
                  </div>
                </div>
                <div className="cl-loading-bar mt-4" aria-hidden="true" />
              </div>
              <div className="grid gap-6 sm:grid-cols-2" aria-hidden="true">
                {[1, 2].map((i) => (
                  <div key={i} className="cl-card h-40 space-y-3 p-6 motion-safe:animate-pulse">
                    <div className="h-4 w-1/3 rounded-pill bg-lavender-soft" />
                    <div className="h-3 w-full rounded-pill bg-canvas" />
                    <div className="h-3 w-5/6 rounded-pill bg-canvas" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {failure && !loading && (
            <section role="alert" className="cl-card flex flex-col gap-4 border-red-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-red-50 text-red-600">
                  <AlertCircle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{failure.code === "unreadable" ? "We couldn't read your CV" : "Your CV wasn't analyzed"}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">{failure.message}</p>
                  {failure.detail && <p className="mt-1 text-sm text-ink-muted"><span className="font-semibold text-ink">Details: </span>{failure.detail}</p>}
                </div>
              </div>
              {retryable && (
                <button type="button" onClick={() => lastRequest.current && void send(lastRequest.current)} disabled={coolingDown}
                  className="cl-btn cl-btn-secondary shrink-0 self-start sm:self-center">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {coolingDown ? `Try again in ${cooldownSeconds}s` : "Try again"}
                </button>
              )}
            </section>
          )}
        </>
      )}

      {/* Announces a finished analysis to screen readers. */}
      <p className="sr-only" aria-live="polite">{!loading && result ? `CV analysis ready. Overall score ${result.overallScore} out of 100.` : ""}</p>
    </div>
  );
}
