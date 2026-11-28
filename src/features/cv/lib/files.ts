// CV upload: file type detection and selection rules. Pure functions (no DOM),
// so they are shared by the upload panel and the unit tests.
import { CV_LIMITS } from "../../../shared/cvLimits";

export type CvFileKind = "pdf" | "docx" | "image";

/**
 * Original files are checked before any processing. DOCX and images are made
 * smaller before sending (text extraction / compression), so they may start
 * larger than the 3 MB upload limit; a PDF is sent as-is, so it may not.
 */
export const CV_FILE_RULES = {
  maxPdfBytes: CV_LIMITS.maxTotalFileBytes,
  maxDocxBytes: 10 * 1024 * 1024,
  maxImageBytes: 15 * 1024 * 1024,
  maxImages: CV_LIMITS.maxImages,
} as const;

export const ACCEPT_ATTRIBUTE =
  ".pdf,.docx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);

/**
 * Detects the real file type from its first bytes (the extension is only a
 * hint): PDF "%PDF-", PNG and JPEG signatures, and DOCX (a ZIP named .docx).
 * Returns null for anything else, including renamed files.
 */
export function detectKind(name: string, head: Uint8Array): CvFileKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) && ext === "docx") return "docx";
  return null;
}

export const FILE_MESSAGES = {
  unsupported: "This file type isn't supported. Please upload a PDF, DOCX, JPG or PNG file.",
  oldWord: "Older .doc files aren't supported. Please save your CV as .docx or PDF and upload it again.",
  mixed: "Please upload one PDF, one DOCX file, or up to 5 images — not a mix of file types.",
  onePdf: "Please upload a single PDF file.",
  oneDocx: "Please upload a single DOCX file.",
  tooManyImages: `You can upload up to ${CV_LIMITS.maxImages} images (one per CV page).`,
  pdfTooLarge: "This PDF is larger than 3 MB. Please compress it, or upload photos or screenshots of the pages instead.",
  docxTooLarge: "This DOCX file is larger than 10 MB. Please remove large images from it, or save it as a PDF.",
  imageTooLarge: "One of the images is larger than 15 MB. Please use a smaller photo or screenshot.",
  empty: "This file is empty.",
} as const;

export interface CandidateFile {
  name: string;
  size: number;
  kind: CvFileKind | null;
}

/**
 * Checks a new selection against what is already chosen. Images can be added
 * in several steps (up to 5 in total); a PDF or DOCX replaces everything.
 * Returns an error message, or null when the selection is valid.
 */
export function checkSelection(incoming: CandidateFile[], current: { kind: CvFileKind; count: number } | null): string | null {
  if (incoming.length === 0) return null;
  for (const f of incoming) {
    if (f.size === 0) return FILE_MESSAGES.empty;
    if (f.kind === null) return /\.doc$/i.test(f.name) ? FILE_MESSAGES.oldWord : FILE_MESSAGES.unsupported;
  }
  const kinds = new Set(incoming.map((f) => f.kind));
  if (kinds.size > 1) return FILE_MESSAGES.mixed;
  const kind = incoming[0].kind as CvFileKind;
  if (kind === "pdf") {
    if (incoming.length > 1) return FILE_MESSAGES.onePdf;
    if (incoming[0].size > CV_FILE_RULES.maxPdfBytes) return FILE_MESSAGES.pdfTooLarge;
    return null;
  }
  if (kind === "docx") {
    if (incoming.length > 1) return FILE_MESSAGES.oneDocx;
    if (incoming[0].size > CV_FILE_RULES.maxDocxBytes) return FILE_MESSAGES.docxTooLarge;
    return null;
  }
  const already = current?.kind === "image" ? current.count : 0;
  if (already + incoming.length > CV_FILE_RULES.maxImages) return FILE_MESSAGES.tooManyImages;
  if (incoming.some((f) => f.size > CV_FILE_RULES.maxImageBytes)) return FILE_MESSAGES.imageTooLarge;
  return null;
}

/** Moves the item at `from` to `to`, returning a new array (page reordering). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
