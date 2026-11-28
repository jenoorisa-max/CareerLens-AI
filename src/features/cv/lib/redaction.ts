// Optional contact-detail redaction for CV text (DOCX only; PDF and image
// content cannot be changed in the browser, and the UI says so). Detected
// details are replaced with visible markers and counted, so the student can
// review exactly what will be sent. This is a best-effort heuristic: the UI
// shows the redacted text before anything is sent.

export interface RedactionResult {
  text: string;
  counts: { emails: number; phones: number; addresses: number };
}

export const REDACTION_MARKERS = {
  email: "[email removed]",
  phone: "[phone removed]",
  address: "[address removed]",
} as const;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
// A run of digits with phone-style separators. The lookbehind keeps it out of
// words, URLs and IDs (e.g. "linkedin.com/in/name-123456789").
const PHONE_CANDIDATE = /(?<![\w/.=-])\+?\(?\d[\d\s().-]{6,}\d(?![\w/])/g;
const YEAR_RANGE = /^\(?(19|20)\d{2}\)?\s*[-–—.]\s*\(?(19|20)\d{2}\)?$/;
const ADDRESS_LABEL = /^(\s*(?:home|postal|mailing|permanent|current|residential)?\s*address\s*[:\-–]\s*)(.+)$/i;
const ADDRESS_WORDS =
  /\b(street|st\.|road|rd\.|avenue|ave\.|lane|boulevard|blvd|house\s*(?:no\.?|#|number)|flat\s*(?:no\.?|#)|apartment|apt\.?|block\s+[a-z0-9]{1,3}\b|sector\s+[a-z]?-?\d|p\.?\s?o\.?\s*box|colony|postcode|zip\s*code)/i;
const SEGMENT_SEPARATOR = /(\s*[|•·]\s*)/;

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

function isAddressSegment(segment: string): boolean {
  const s = segment.trim();
  return s.length > 0 && s.length <= 150 && /\d/.test(s) && ADDRESS_WORDS.test(s);
}

export function redactContactDetails(input: string): RedactionResult {
  const counts = { emails: 0, phones: 0, addresses: 0 };

  let text = input.replace(EMAIL, () => {
    counts.emails++;
    return REDACTION_MARKERS.email;
  });

  text = text.replace(PHONE_CANDIDATE, (match) => {
    const digits = digitCount(match);
    if (digits < 9 || digits > 15 || YEAR_RANGE.test(match.trim())) return match;
    counts.phones++;
    return REDACTION_MARKERS.phone;
  });

  text = text
    .split("\n")
    .map((line) => {
      const labelled = ADDRESS_LABEL.exec(line);
      if (labelled && labelled[2].trim() && !labelled[2].includes(REDACTION_MARKERS.address)) {
        counts.addresses++;
        return `${labelled[1]}${REDACTION_MARKERS.address}`;
      }
      // Contact lines often combine details: "House 12, Street 4, Lahore | [email removed]".
      return line
        .split(SEGMENT_SEPARATOR)
        .map((part) => {
          if (SEGMENT_SEPARATOR.test(part) || !isAddressSegment(part)) return part;
          counts.addresses++;
          const lead = part.match(/^\s*/)?.[0] ?? "";
          return `${lead}${REDACTION_MARKERS.address}`;
        })
        .join("");
    })
    .join("\n");

  return { text, counts };
}

export function describeRedaction(counts: RedactionResult["counts"]): string {
  const parts: string[] = [];
  if (counts.emails) parts.push(`${counts.emails} email address${counts.emails > 1 ? "es" : ""}`);
  if (counts.phones) parts.push(`${counts.phones} phone number${counts.phones > 1 ? "s" : ""}`);
  if (counts.addresses) parts.push(`${counts.addresses} address line${counts.addresses > 1 ? "s" : ""}`);
  return parts.length ? `Removed ${parts.join(", ")}.` : "No contact details were detected.";
}
