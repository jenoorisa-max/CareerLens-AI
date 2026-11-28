import React, { useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, FileText, FileUp, ImageIcon, ShieldCheck, Trash2, X } from "lucide-react";
import { ACCEPT_ATTRIBUTE, formatBytes } from "./lib/files";
import { IMAGE_WARNING_TEXT, type PreparedImage } from "./lib/images";
import { describeRedaction, type RedactionResult } from "./lib/redaction";

export type CvUpload =
  | { kind: "pdf"; name: string; bytes: number; data: string; previewUrl: string }
  | { kind: "docx"; name: string; bytes: number; text: string }
  | { kind: "images"; pages: Array<{ id: string; name: string; image: PreparedImage }> };

interface CvUploadPanelProps {
  upload: CvUpload | null;
  processing: boolean;
  error: string | null;
  disabled: boolean;
  redact: boolean;
  redaction: RedactionResult | null;
  onFiles: (files: File[]) => void;
  onRemovePage: (index: number) => void;
  onMovePage: (from: number, to: number) => void;
  onClear: () => void;
  onRedactChange: (value: boolean) => void;
}

export default function CvUploadPanel(props: CvUploadPanelProps) {
  const { upload, processing, error, disabled, redact, redaction } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canAddImages = !upload || (upload.kind === "images" && upload.pages.length < 5);

  const pick = (list: FileList | null) => {
    if (list && list.length) props.onFiles([...list]);
    if (inputRef.current) inputRef.current.value = ""; // allow choosing the same file again
  };

  return (
    <section className="cl-card p-6 sm:p-8" aria-labelledby="cv-upload-title">
      <div className="flex items-start gap-3">
        <span className="cl-icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-control">
          <FileUp className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="cv-upload-title" className="font-display text-lg font-bold text-ink">1. Upload your CV</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            One PDF, one DOCX file, or up to 5 JPG/PNG images (one per page). PDFs can be up to 3 MB.
          </p>
        </div>
      </div>

      {canAddImages && (
        <div
          className={`mt-5 rounded-card border-2 border-dashed p-6 text-center transition-colors duration-200 sm:p-8 ${
            dragging ? "border-primary bg-lavender-soft" : "border-line bg-canvas"
          } ${disabled ? "opacity-60" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) props.onFiles([...e.dataTransfer.files]);
          }}
          data-testid="cv-dropzone"
        >
          <FileUp className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-ink">
            {upload?.kind === "images" ? "Add more page images" : "Drag and drop your CV here"}
          </p>
          <p className="mt-1 text-xs text-ink-muted">or</p>
          <input
            ref={inputRef}
            id="cv-file-input"
            type="file"
            className="sr-only"
            accept={ACCEPT_ATTRIBUTE}
            multiple
            disabled={disabled}
            aria-describedby="cv-upload-help"
            onChange={(e) => pick(e.target.files)}
          />
          <label
            htmlFor="cv-file-input"
            className={`cl-btn cl-btn-secondary mt-3 ${disabled ? "pointer-events-none" : "cursor-pointer"}`}
          >
            Choose file{upload?.kind === "images" ? "s" : ""}
          </label>
          <p id="cv-upload-help" className="mt-3 text-xs text-ink-muted">
            PDF, DOCX, JPG or PNG. Photos are resized in your browser before sending.
          </p>
        </div>
      )}

      {processing && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <span className="cl-loading-bar w-16" aria-hidden="true" />
          Preparing your file…
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-control border border-red-200 bg-red-50 px-3.5 py-3 text-sm font-medium text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {upload && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-ink">Preview</h3>
            <button type="button" onClick={props.onClear} disabled={disabled} className="cl-btn cl-btn-ghost text-xs">
              <X className="h-4 w-4" aria-hidden="true" />
              Remove {upload.kind === "images" ? "all pages" : "file"}
            </button>
          </div>

          {upload.kind === "pdf" && (
            <div className="overflow-hidden rounded-control border border-line">
              <div className="flex items-center gap-2 border-b border-line bg-canvas px-3.5 py-2.5 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 truncate font-semibold text-ink">{upload.name}</span>
                <span className="ml-auto shrink-0 text-xs text-ink-muted">{formatBytes(upload.bytes)}</span>
              </div>
              <object data={upload.previewUrl} type="application/pdf" className="block h-80 w-full bg-surface" aria-label={`Preview of ${upload.name}`}>
                <p className="p-4 text-sm text-ink-muted">
                  Your browser can't show the PDF here.{" "}
                  <a href={upload.previewUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
                    Open the preview in a new tab
                  </a>
                  .
                </p>
              </object>
            </div>
          )}

          {upload.kind === "docx" && (
            <div className="space-y-3">
              <div className="rounded-control border border-line">
                <div className="flex items-center gap-2 border-b border-line bg-canvas px-3.5 py-2.5 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 truncate font-semibold text-ink">{upload.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-ink-muted">{upload.text.length.toLocaleString("en-US")} characters</span>
                </div>
                <pre
                  tabIndex={0}
                  aria-label="Text extracted from your DOCX file"
                  className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-3.5 font-sans text-xs leading-relaxed text-ink"
                >
                  {upload.text}
                </pre>
              </div>

              <div className="rounded-control border border-line bg-canvas p-3.5">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    id="cv-redact"
                    type="checkbox"
                    checked={redact}
                    disabled={disabled}
                    onChange={(e) => props.onRedactChange(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                  />
                  <span className="text-sm">
                    <span className="font-semibold text-ink">Remove my contact details before sending</span>
                    <span className="block text-ink-muted">Email addresses, phone numbers and address lines are replaced in the text sent for analysis. Your file is not changed.</span>
                  </span>
                </label>
                {redact && redaction && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                      {describeRedaction(redaction.counts)} Please review the text that will be sent:
                    </p>
                    <pre
                      tabIndex={0}
                      aria-label="Text that will be sent for analysis"
                      className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-control border border-line bg-surface p-3 font-sans text-xs leading-relaxed text-ink"
                    >
                      {redaction.text}
                    </pre>
                    <p className="mt-2 text-xs text-ink-muted">Automatic detection can miss details. Anything still visible above will be sent.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {upload.kind === "images" && (
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="CV pages in order">
              {upload.pages.map((page, index) => (
                <li key={page.id} className="overflow-hidden rounded-control border border-line bg-surface">
                  <div className="relative bg-canvas">
                    <img src={page.image.previewUrl} alt={`Page ${index + 1}: ${page.name}`} className="h-44 w-full object-contain" />
                    <span className="absolute left-2 top-2 rounded-pill bg-ink/80 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                      Page {index + 1}
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 truncate">{page.name}</span>
                      <span className="ml-auto shrink-0">{formatBytes(page.image.bytes)}</span>
                    </p>
                    {page.image.warnings.map((w) => (
                      <p key={w} className="flex items-start gap-1.5 rounded-control bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {IMAGE_WARNING_TEXT[w]}
                      </p>
                    ))}
                    <div className="flex gap-1.5">
                      <button type="button" className="cl-btn cl-btn-secondary flex-1 px-2" disabled={disabled || index === 0}
                        onClick={() => props.onMovePage(index, index - 1)} aria-label={`Move page ${index + 1} up`}>
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" className="cl-btn cl-btn-secondary flex-1 px-2" disabled={disabled || index === upload.pages.length - 1}
                        onClick={() => props.onMovePage(index, index + 1)} aria-label={`Move page ${index + 1} down`}>
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" className="cl-btn cl-btn-secondary flex-1 px-2" disabled={disabled}
                        onClick={() => props.onRemovePage(index)} aria-label={`Remove page ${index + 1}`}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {upload.kind !== "docx" && (
            <p className="flex items-start gap-2 rounded-control border border-line bg-canvas px-3.5 py-3 text-xs text-ink-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Contact details can't be removed automatically from PDF or image files. If you don't want to share them, cover or delete them in your file before uploading.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
