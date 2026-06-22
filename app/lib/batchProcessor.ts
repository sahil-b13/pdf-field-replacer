import JSZip from "jszip";
import { detectFields } from "./fieldDetector";
import { extractFirstPageText } from "./pdfTextExtractor";
import { applyOverlays, buildOverlayInstructions } from "./pdfWriter";
import type { DetectionResult, FormValues } from "./types";

export interface BatchPdfEntry {
  filename: string;
  bytes: ArrayBuffer;
}

/** Reads a ZIP file and returns all PDF entries inside it (flat, ignoring subfolders' non-PDF content). */
export async function extractPdfsFromZip(zipBytes: ArrayBuffer): Promise<BatchPdfEntry[]> {
  const zip = await JSZip.loadAsync(zipBytes);
  const entries: BatchPdfEntry[] = [];

  const fileEntries = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.toLowerCase().endsWith(".pdf")
  );

  for (const file of fileEntries) {
    const bytes = await file.async("arraybuffer");
    // Use just the base filename (strip any folder path from inside the zip)
    const filename = file.name.split("/").pop() || file.name;
    entries.push({ filename, bytes });
  }

  return entries;
}

/**
 * Runs detection on the first PDF in the batch only — this becomes the
 * template the form UI is built from, per the spec ("scans the first PDF
 * to detect the field pattern, shows the form once").
 */
export async function detectTemplateFromBatch(
  entries: BatchPdfEntry[]
): Promise<DetectionResult> {
  if (entries.length === 0) {
    throw new Error("No PDF files found inside the ZIP.");
  }
  const { items, pageWidth, pageHeight, isLikelyScanned } = await extractFirstPageText(
    entries[0].bytes
  );
  return detectFields(items, pageWidth, pageHeight, isLikelyScanned);
}

/**
 * Applies the same field replacements to every PDF in the batch, using each
 * PDF's OWN detected field positions (not just the template's), so that
 * minor per-file positional drift doesn't cause misalignment. Falls back to
 * the template's boxes for any field a given file fails to detect itself.
 */
export async function processBatch(
  entries: BatchPdfEntry[],
  templateDetection: DetectionResult,
  formValues: FormValues,
  onProgress?: (done: number, total: number, filename: string) => void
): Promise<{ filename: string; bytes: Uint8Array }[]> {
  const results: { filename: string; bytes: Uint8Array }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    onProgress?.(i, entries.length, entry.filename);

    let detection: DetectionResult;
    try {
      const { items, pageWidth, pageHeight, isLikelyScanned } = await extractFirstPageText(
        entry.bytes
      );
      detection = detectFields(items, pageWidth, pageHeight, isLikelyScanned);
    } catch {
      // If this file's own text can't be extracted, fall back to the
      // template's positions — better than skipping the file entirely.
      detection = templateDetection;
    }

    // Merge: prefer this file's own detected boxes, but fall back to the
    // template's box for any field this file didn't detect (e.g. slight
    // OCR/extraction noise on one document).
    const mergedFields = detection.fields.map((f) => {
      if (f.valueBox) return f;
      const templateField = templateDetection.fields.find((tf) => tf.key === f.key);
      return templateField?.valueBox ? { ...f, valueBox: templateField.valueBox } : f;
    });

    const instructions = buildOverlayInstructions(mergedFields, formValues);
    const outputBytes = await applyOverlays(entry.bytes, instructions);
    results.push({ filename: entry.filename, bytes: outputBytes });
  }

  onProgress?.(entries.length, entries.length, "");
  return results;
}

/** Packages a set of modified PDFs into a single downloadable ZIP blob. */
export async function buildOutputZip(
  files: { filename: string; bytes: Uint8Array }[]
): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filename, file.bytes);
  }
  return zip.generateAsync({ type: "blob" });
}
