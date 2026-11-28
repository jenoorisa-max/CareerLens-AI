// DOCX text extraction with mammoth, loaded only when a DOCX file is chosen
// (a separate chunk, so it does not add to the app's initial download).

export interface DocxText {
  text: string;
}

type Extractor = (input: Record<string, unknown>) => Promise<{ value: string }>;

/** Collapses the blank lines mammoth emits between paragraphs; words are untouched. */
export function tidyExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The browser build of mammoth reads `arrayBuffer`, the Node build (used by the
 * unit tests) reads `buffer`; both accept an ArrayBuffer, so both are passed.
 */
export async function extractDocxText(bytes: ArrayBuffer, extractor?: Extractor): Promise<DocxText> {
  const extract: Extractor =
    extractor ?? ((await import("mammoth")) as unknown as { default?: { extractRawText: Extractor }; extractRawText?: Extractor }).default?.extractRawText ??
    ((await import("mammoth")) as unknown as { extractRawText: Extractor }).extractRawText;
  const result = await extract({ arrayBuffer: bytes, buffer: bytes });
  return { text: tidyExtractedText(result.value ?? "") };
}
