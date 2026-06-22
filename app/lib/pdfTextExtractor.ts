"use client";

import type { TextItem } from "./types";

// pdfjs-dist must only be imported on the client. We lazy-load it so this
// module is safe to import from components that might render during SSR.
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import("pdfjs-dist");
  // The worker is copied into /public by scripts/copy-pdf-worker.js
  // (see package.json "postinstall"). Must match the installed
  // pdfjs-dist version exactly or pdf.js throws a version-mismatch error.
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
  pdfjsLib = lib;
  return lib;
}

export interface PageExtraction {
  pageWidth: number;
  pageHeight: number;
  items: TextItem[];
  isLikelyScanned: boolean;
  previewDataUrl: string;
  previewScale: number; // multiply a PDF-space coordinate by this to get preview-image pixel coordinates
}

/** Heuristic: does this pdf.js internal font name look like a bold variant? */
function looksBold(fontName: string): boolean {
  return /bold|black|heavy|semibold|extrabold/i.test(fontName);
}

/** Heuristic: does this pdf.js internal font name look like an italic/oblique variant? */
function looksItalic(fontName: string): boolean {
  return /italic|oblique/i.test(fontName);
}

/**
 * Renders the page once to an offscreen canvas at a decent pixel density,
 * then samples the actual rendered color at a point inside each text item's
 * glyph ink (not the baseline, which can land in whitespace between
 * letters). This sidesteps the fact that pdf.js's getTextContent() doesn't
 * expose fill color directly — color lives in the PDF graphics state, which
 * is only resolved during actual rendering.
 *
 * Also returns a downscaled preview image generated from this SAME render,
 * so we only ever render the page once per extraction instead of rendering
 * it again separately for the on-screen preview.
 */
async function renderAndSampleColors(
  page: import("pdfjs-dist").PDFPageProxy,
  items: TextItem[],
  pageHeight: number,
  previewTargetWidth: number
): Promise<{ colors: Map<number, { r: number; g: number; b: number }>; previewDataUrl: string }> {
  const sampleScale = 3; // render at 3x for precise-enough pixel sampling
  const viewport = page.getViewport({ scale: sampleScale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { colors: new Map(), previewDataUrl: "" };

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Read the whole rendered page's pixels ONCE. Calling getImageData
  // per-pixel per-item (as a naive implementation would) means thousands
  // of separate calls for a typical cover page, which is slow enough to
  // visibly stall the UI. One bulk read + plain array indexing afterward
  // is dramatically faster.
  const { data: pixels, width: canvasWidth, height: canvasHeight } = ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );

  function getPixel(x: number, y: number): { r: number; g: number; b: number } | null {
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return null;
    const offset = (y * canvasWidth + x) * 4;
    return { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2] };
  }

  const colors = new Map<number, { r: number; g: number; b: number }>();

  items.forEach((item, idx) => {
    // Sample a point a little left-of-center and vertically inside the
    // glyph body (roughly 35% up from the baseline), which tends to land
    // on ink for most letterforms rather than gaps or descenders.
    const sampleXPdf = item.x + Math.min(item.width * 0.3, item.width || 1);
    const sampleYPdf = item.y + item.height * 0.35;

    // Convert PDF (bottom-left origin) coords to canvas pixel (top-left origin).
    const px = Math.round(sampleXPdf * sampleScale);
    const py = Math.round((pageHeight - sampleYPdf) * sampleScale);

    // Sample a small neighborhood and pick the darkest pixel (most likely
    // to be glyph ink rather than anti-aliased edge or background gap).
    const radius = Math.max(1, Math.round(sampleScale));
    let best: { r: number; g: number; b: number; lum: number } | null = null;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const pixel = getPixel(px + dx, py + dy);
        if (!pixel) continue;
        const lum = 0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b;
        if (!best || lum < best.lum) best = { ...pixel, lum };
      }
    }

    // If the darkest pixel nearby is still close to white, this text item
    // is probably thin/small and we missed the ink — fall back to black
    // rather than reporting a near-white "color" that would make the
    // replacement text invisible.
    if (best && best.lum < 235) {
      colors.set(idx, { r: best.r, g: best.g, b: best.b });
    }
  });

  // Downscale the same canvas we just rendered into a smaller preview
  // image, instead of asking pdf.js to render the page a second time.
  const previewScale = previewTargetWidth / (viewport.width / sampleScale);
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = Math.round(viewport.width * (previewScale / sampleScale));
  previewCanvas.height = Math.round(viewport.height * (previewScale / sampleScale));
  const previewCtx = previewCanvas.getContext("2d");
  let previewDataUrl = "";
  if (previewCtx) {
    previewCtx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
    previewDataUrl = previewCanvas.toDataURL("image/png");
  }

  return { colors, previewDataUrl };
}

/**
 * Extracts all text runs from the first page of a PDF, with bounding boxes
 * converted into PDF user-space coordinates (origin bottom-left), so they
 * line up directly with pdf-lib's coordinate system later when we draw
 * overlays. Also samples each run's rendered color and infers bold/italic
 * from the font name, so replacement text can match the original styling.
 */
export async function extractFirstPageText(
  fileBytes: ArrayBuffer,
  previewTargetWidth = 620
): Promise<PageExtraction> {
  const pdfjs = await getPdfjs();

  // pdfjs takes ownership of the buffer it's given; pass a copy since the
  // caller (and pdf-lib later) may still need the original bytes.
  const bytesCopy = fileBytes.slice(0);
  const doc = await pdfjs.getDocument({ data: bytesCopy }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();

  const pageHeight = viewport.height;
  const pageWidth = viewport.width;

  const items: TextItem[] = [];
  for (const raw of textContent.items) {
    // pdfjs types this as TextItem | TextMarkedContent; only TextItem has `str`.
    if (!("str" in raw) || !raw.str || !raw.str.trim()) continue;

    // raw.transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
    // translateX/Y is the text origin in PDF user space (bottom-left origin),
    // which is exactly what pdf-lib's drawText expects.
    const transform = raw.transform;
    const x = transform[4];
    const y = transform[5];
    const fontSize = Math.hypot(transform[2], transform[3]) || Math.abs(transform[3]) || 10;
    const width = raw.width ?? 0;
    const height = raw.height ?? fontSize;
    const fontName = raw.fontName ?? "Helvetica";

    items.push({
      text: raw.str,
      x,
      y,
      width,
      height,
      fontName,
      fontSize,
      isBold: looksBold(fontName),
      isItalic: looksItalic(fontName),
      color: { r: 0, g: 0, b: 0 }, // placeholder, filled in below
    });
  }

  const { colors: colorMap, previewDataUrl } = await renderAndSampleColors(
    page,
    items,
    pageHeight,
    previewTargetWidth
  );
  items.forEach((item, idx) => {
    const sampled = colorMap.get(idx);
    if (sampled) item.color = sampled;
  });

  // A page is "likely scanned" if it has very little extractable text
  // (e.g. just a header) relative to a typical assignment cover page.
  const totalChars = items.reduce((sum, it) => sum + it.text.length, 0);
  const isLikelyScanned = totalChars < 25;

  await doc.destroy();

  return {
    pageWidth,
    pageHeight,
    items,
    isLikelyScanned,
    previewDataUrl,
    previewScale: previewTargetWidth / pageWidth,
  };
}

