// Core types shared across the detection engine, UI, and PDF writer.

export type FieldKey =
  | "name"
  | "enrollment"
  | "rollNo"
  | "academicYear"
  | "semester"
  | "branch"
  | "subject"
  | "date";

export interface FieldDefinition {
  key: FieldKey;
  label: string; // human-friendly label shown in the form
  patterns: RegExp[]; // patterns matched against extracted label text
}

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

// A single text run as extracted from pdfjs-dist, with its page-space
// bounding box (PDF user-space units, origin bottom-left, matching pdf-lib).
export interface TextItem {
  text: string;
  x: number; // left edge
  y: number; // baseline (bottom-left origin, PDF space)
  width: number;
  height: number;
  fontName: string;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  color: RGBColor;
}

// A detected field: where its label was found, and where its value
// (the thing we'll overwrite) sits on the page.
export interface DetectedField {
  key: FieldKey;
  label: string;
  detectedValue: string; // original value, pre-fill for the form
  valueBox: BoundingBox | null; // null if we found the label but couldn't isolate a value box
  labelBox: BoundingBox;
  confidence: "high" | "medium" | "low";
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  isBold: boolean;
  isItalic: boolean;
  color: RGBColor;
  /** True if the original value was preceded by a colon (e.g. "Name: John") that we whited out along with the value and need to redraw before the new text. */
  hasLeadingColon?: boolean;
  /** "center" if the original value was horizontally centered on the page (e.g. a centered title/subtitle); "left" otherwise. Used to decide whether replacement text should be re-centered rather than left-aligned at the original start x. */
  textAlign: "left" | "center";
}

// Result of scanning page 1 of a PDF.
export interface DetectionResult {
  pageWidth: number;
  pageHeight: number;
  fields: DetectedField[];
  rawTextItems: TextItem[]; // kept for manual-selection fallback
  isLikelyScanned: boolean; // true if page 1 has ~no extractable text
}

// What the user fills in the form. Empty/unchanged fields are skipped
// during replacement (no overlay drawn) so we never touch content we
// didn't confidently detect.
export type FormValues = Partial<Record<FieldKey, string>>;

export interface ManualSelection {
  key: FieldKey;
  box: BoundingBox;
}
