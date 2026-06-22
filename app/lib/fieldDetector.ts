import { FIELD_DEFINITIONS, normalizeLabel } from "./fieldDefinitions";
import type {
  BoundingBox,
  DetectedField,
  DetectionResult,
  FieldKey,
  TextItem,
} from "./types";

const LINE_TOLERANCE_PX = 4; // y-distance under which two items are "on the same line"

interface Line {
  items: TextItem[];
  y: number; // representative baseline for the line
}

/** Groups text items into visual lines based on baseline proximity. */
function groupIntoLines(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y); // top to bottom (PDF y grows upward)
  const lines: Line[] = [];

  for (const item of sorted) {
    const existing = lines.find((l) => Math.abs(l.y - item.y) <= LINE_TOLERANCE_PX);
    if (existing) {
      existing.items.push(item);
    } else {
      lines.push({ items: [item], y: item.y });
    }
  }

  // sort items within each line left to right
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
  }

  return lines;
}

/** True if a box's horizontal center sits close to the page's horizontal center — used to detect standalone centered text (titles/subtitles) rather than left-aligned "Label: Value" content. */
function isPageCentered(boxMinX: number, boxMaxX: number, pageWidth: number): boolean {
  const boxCenter = (boxMinX + boxMaxX) / 2;
  const pageCenter = pageWidth / 2;
  const tolerance = pageWidth * 0.04; // ~4% of page width slack
  return Math.abs(boxCenter - pageCenter) <= tolerance;
}

/**
 * Given a line containing a matched label, find the value:
 * 1. If there's text after a colon/dash on the SAME line (and before the
 *    next label, if this is a multi-column row), that's the value.
 * 2. Otherwise, look at the next line below, at a similar x-position
 *    (handles boxed/table layouts where the label sits above the answer,
 *    possibly with other columns alongside it).
 * 3. Otherwise, no value found (label-only, maybe a header).
 */
function findValueForLabel(
  line: Line,
  labelItemIndices: number[],
  nextLabelStartIdx: number | null,
  allLines: Line[],
  lineIndex: number,
  pageWidth: number
): { value: string; box: BoundingBox } | null {
  const lastLabelIdx = Math.max(...labelItemIndices);
  const boundedEnd = nextLabelStartIdx ?? line.items.length;
  const remainder = line.items.slice(lastLabelIdx + 1, boundedEnd);

  // Strip a leading colon/dash-only token if present as its own item.
  const cleaned = remainder.filter((it) => !/^[\s:.\-]+$/.test(it.text));

  if (cleaned.length > 0) {
    const first = cleaned[0];
    const leadingPunctMatch = first.text.match(/^[\s:.\-]+/);
    const hasLeadingColon = !!leadingPunctMatch && leadingPunctMatch[0].includes(":");
    const text = first.text.replace(/^[\s:.\-]+/, "");
    if (text.trim().length > 0) {
      // White out the FULL original span (including the leading colon
      // glyph) to avoid leaving stray partial-glyph slivers behind. The
      // box remembers whether a colon needs to be redrawn before the new
      // value at write-time, so the form's pre-filled value stays clean
      // ("Rahul Sharma", not ": Rahul Sharma") while the final PDF still
      // shows the separator.
      const minX = first.x;
      const maxX = cleaned[cleaned.length - 1].x + cleaned[cleaned.length - 1].width;
      const value = cleaned.map((it) => it.text).join(" ").replace(/^[\s:.\-]+/, "").trim();
      return {
        value,
        box: {
          x: minX,
          y: first.y,
          width: Math.max(maxX - minX, 10),
          height: Math.max(...cleaned.map((it) => it.height)),
          fontSize: first.fontSize,
          fontName: first.fontName,
          isBold: first.isBold,
          isItalic: first.isItalic,
          color: first.color,
          hasLeadingColon,
          // A value immediately following a label on the same line is, by
          // construction, left-aligned after the label/colon — centering
          // doesn't apply here even if it happens to land near page-center.
          textAlign: "left",
        },
      };
    }
  }

  // Fallback: check the next line below for a value at roughly the same
  // x-position as this label (handles label-above-value table layouts,
  // including multi-column rows where each column has its own label
  // directly above its own value).
  const nextLine = allLines[lineIndex + 1];
  if (nextLine && line.y - nextLine.y < 30 && line.y - nextLine.y > 0) {
    const labelMinX = Math.min(...labelItemIndices.map((i) => line.items[i].x));
    const labelMaxX = Math.max(...labelItemIndices.map((i) => line.items[i].x + line.items[i].width));
    const xTolerance = 25; // px slack for slight misalignment between label and value column

    // Find the next line's value cluster that overlaps this label's x-range.
    const candidateItems = nextLine.items.filter(
      (it) => it.x < labelMaxX + xTolerance && it.x + it.width > labelMinX - xTolerance
    );

    if (candidateItems.length > 0) {
      const text = candidateItems.map((it) => it.text).join(" ").trim();
      const looksLikeAnotherLabel = FIELD_DEFINITIONS.some((def) =>
        def.patterns.some((p) => p.test(normalizeLabel(text)))
      );
      if (text.length > 0 && !looksLikeAnotherLabel) {
        const minX = Math.min(...candidateItems.map((it) => it.x));
        const maxX = Math.max(...candidateItems.map((it) => it.x + it.width));
        // A value stacked under its label (rather than following it on the
        // same line) is more often center-aligned within its column/cell —
        // check whether this value sits near the page's horizontal center.
        const textAlign: "left" | "center" = isPageCentered(minX, maxX, pageWidth)
          ? "center"
          : "left";
        return {
          value: text,
          box: {
            x: minX,
            y: candidateItems[0].y,
            width: maxX - minX,
            height: Math.max(...candidateItems.map((it) => it.height)),
            fontSize: candidateItems[0].fontSize,
            fontName: candidateItems[0].fontName,
            isBold: candidateItems[0].isBold,
            isItalic: candidateItems[0].isItalic,
            color: candidateItems[0].color,
            textAlign,
          },
        };
      }
    }
  }

  return null;
}

function matchLabelAtOffset(
  line: Line,
  startIdx: number
): { key: FieldKey; label: string; itemIndices: number[] } | null {
  const maxWindow = Math.min(6, line.items.length - startIdx);
  if (maxWindow <= 0) return null;

  function findMatch(windowSize: number): { defIdx: number; patIdx: number } | null {
    const windowItems = line.items.slice(startIdx, startIdx + windowSize);
    const candidate = normalizeLabel(windowItems.map((i) => i.text).join(" "));
    for (let defIdx = 0; defIdx < FIELD_DEFINITIONS.length; defIdx++) {
      const def = FIELD_DEFINITIONS[defIdx];
      for (let patIdx = 0; patIdx < def.patterns.length; patIdx++) {
        if (def.patterns[patIdx].test(candidate)) return { defIdx, patIdx };
      }
    }
    return null;
  }

  let windowSize = 1;
  let match = findMatch(windowSize);

  while (match && windowSize < maxWindow) {
    const next = findMatch(windowSize + 1);
    if (next && next.defIdx === match.defIdx && next.patIdx < match.patIdx) {
      windowSize += 1;
      match = next;
    } else {
      break;
    }
  }

  if (!match) {
    // No direct match at windowSize=1. Try growing — but only feed in
    // additional items up to (and not including) the next position that
    // independently starts a valid label match on its own. Without this
    // guard, a value text run (e.g. ": Rahul Sharma") sitting between two
    // labels can get glued together with the NEXT label's text and
    // accidentally satisfy that next label's pattern, falsely consuming
    // the first label's value as part of the second label's match.
    let safeLimit = maxWindow;
    for (let probe = 1; probe < maxWindow; probe++) {
      const probeWindow = line.items.slice(startIdx + probe, startIdx + probe + 1);
      const probeCandidate = normalizeLabel(probeWindow.map((i) => i.text).join(" "));
      const independentlyMatches = FIELD_DEFINITIONS.some((def) =>
        def.patterns.some((p) => p.test(probeCandidate))
      );
      if (independentlyMatches) {
        safeLimit = probe; // stop before absorbing this independent label
        break;
      }
    }

    for (let w = 2; w <= safeLimit; w++) {
      const m = findMatch(w);
      if (m) {
        match = m;
        windowSize = w;
        break;
      }
    }
  }

  if (!match) return null;

  const def = FIELD_DEFINITIONS[match.defIdx];
  return {
    key: def.key,
    label: def.label,
    itemIndices: Array.from({ length: windowSize }, (_, i) => startIdx + i),
  };
}

/**
 * Finds every label match within a line, scanning left to right. Supports
 * multi-column rows where more than one labeled field appears on the same
 * visual line (e.g. "Name of Student ___   Roll No ___").
 */
function matchAllLabelsInLine(
  line: Line
): { key: FieldKey; label: string; itemIndices: number[] }[] {
  const matches: { key: FieldKey; label: string; itemIndices: number[] }[] = [];
  let cursor = 0;

  while (cursor < line.items.length) {
    const match = matchLabelAtOffset(line, cursor);
    if (match) {
      matches.push(match);
      cursor = Math.max(...match.itemIndices) + 1;
    } else {
      cursor += 1;
    }
  }

  return matches;
}

/**
 * Main entry point: scans extracted page-1 text items and returns detected
 * fields with their value bounding boxes (for overlay) and pre-fill values
 * (for the form UI).
 */
export function detectFields(
  items: TextItem[],
  pageWidth: number,
  pageHeight: number,
  isLikelyScanned: boolean
): DetectionResult {
  const lines = groupIntoLines(items);
  const found = new Map<FieldKey, DetectedField>();

  lines.forEach((line, lineIndex) => {
    if (found.size >= FIELD_DEFINITIONS.length) return;

    const matches = matchAllLabelsInLine(line);

    matches.forEach((match, matchIdx) => {
      if (found.has(match.key)) return; // first match wins (top of page)

      const labelItems = match.itemIndices.map((i) => line.items[i]);
      const labelMinX = Math.min(...labelItems.map((i) => i.x));
      const labelMaxX = Math.max(...labelItems.map((i) => i.x + i.width));

      const labelBox: BoundingBox = {
        x: labelMinX,
        y: labelItems[0].y,
        width: labelMaxX - labelMinX,
        height: Math.max(...labelItems.map((i) => i.height)),
        fontSize: labelItems[0].fontSize,
        fontName: labelItems[0].fontName,
        isBold: labelItems[0].isBold,
        isItalic: labelItems[0].isItalic,
        color: labelItems[0].color,
        textAlign: "left",
      };

      // Bound the same-line value search to stop before the next label
      // match on this line, if there is one (multi-column rows).
      const nextMatch = matches[matchIdx + 1];
      const nextLabelStartIdx = nextMatch ? Math.min(...nextMatch.itemIndices) : null;

      const valueResult = findValueForLabel(
        line,
        match.itemIndices,
        nextLabelStartIdx,
        lines,
        lineIndex,
        pageWidth
      );

      found.set(match.key, {
        key: match.key,
        label: match.label,
        detectedValue: valueResult?.value ?? "",
        valueBox: valueResult?.box ?? null,
        labelBox,
        confidence: valueResult ? "high" : "low",
      });
    });
  });

  // Ensure every field definition appears in the result (even if undetected)
  // so the form always shows all 8 fields, just empty/unfilled ones for
  // anything we couldn't find — the user can still fill them in, though
  // without a valueBox we won't overlay them onto the PDF automatically.
  const fields: DetectedField[] = FIELD_DEFINITIONS.map((def) => {
    return (
      found.get(def.key) ?? {
        key: def.key,
        label: def.label,
        detectedValue: "",
        valueBox: null,
        labelBox: {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          fontSize: 10,
          fontName: "Helvetica",
          isBold: false,
          isItalic: false,
          color: { r: 0, g: 0, b: 0 },
          textAlign: "left",
        },
        confidence: "low" as const,
      }
    );
  });

  return {
    pageWidth,
    pageHeight,
    fields,
    rawTextItems: items,
    isLikelyScanned,
  };
}
