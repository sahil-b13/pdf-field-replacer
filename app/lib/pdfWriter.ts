import { PDFDocument, rgb, StandardFonts, PDFFont } from "pdf-lib";
import type { BoundingBox, FieldKey, FormValues, DetectedField } from "./types";

export interface OverlayInstruction {
  box: BoundingBox;
  newValue: string;
}

/**
 * Builds the list of overlay instructions from detected fields + the user's
 * form input. A field is only overlaid if:
 *  - we have a valueBox for it (we know exactly where to draw), AND
 *  - the user actually provided a non-empty value
 * This guarantees we never touch parts of the PDF we didn't confidently
 * locate, per the "never alter unrelated content" requirement.
 */
export function buildOverlayInstructions(
  fields: DetectedField[],
  formValues: FormValues
): OverlayInstruction[] {
  const instructions: OverlayInstruction[] = [];
  for (const field of fields) {
    const newValue = formValues[field.key];
    if (!newValue || !newValue.trim()) continue;
    if (!field.valueBox) continue;
    instructions.push({ box: field.valueBox, newValue: newValue.trim() });
  }
  return instructions;
}

/**
 * Applies overlay instructions to page 1 of a PDF: draws a white rectangle
 * over the old value's exact bounding box, then draws the new text in the
 * same position using a close-matching standard font at the original size.
 * Returns the modified PDF as bytes. The input bytes are not mutated.
 */
export async function applyOverlays(
  pdfBytes: ArrayBuffer,
  instructions: OverlayInstruction[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPage(0);
  const { width: pageWidth } = page.getSize();

  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  for (const instr of instructions) {
    const font = pickFont(fonts, instr.box.isBold, instr.box.isItalic);
    drawWhiteOut(page, instr.box, pageWidth);
    drawReplacementText(page, instr.box, instr.newValue, font);
  }

  return pdfDoc.save();
}

function pickFont(
  fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont },
  isBold: boolean,
  isItalic: boolean
): PDFFont {
  if (isBold && isItalic) return fonts.boldItalic;
  if (isBold) return fonts.bold;
  if (isItalic) return fonts.italic;
  return fonts.regular;
}

function drawWhiteOut(
  page: import("pdf-lib").PDFPage,
  box: BoundingBox,
  pageWidth: number
) {
  // Slightly generous padding so we fully cover the original glyphs
  // (descenders/ascenders) without bleeding into neighboring lines.
  const paddingX = 1.5;
  const paddingY = 1.5;

  if (box.textAlign === "center") {
    // Centered text can grow in either direction when replaced, so white
    // out symmetrically around the box's original center rather than only
    // extending rightward. Cap at the page width so we never draw outside
    // page bounds.
    const centerX = box.x + box.width / 2;
    const halfWidth = box.width / 2 + 60; // generous symmetric buffer
    const left = Math.max(0, centerX - halfWidth);
    const right = Math.min(pageWidth, centerX + halfWidth);
    page.drawRectangle({
      x: left,
      y: box.y - paddingY * 1.5,
      width: right - left,
      height: box.height + paddingY * 3,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });
    return;
  }

  page.drawRectangle({
    x: box.x - paddingX,
    y: box.y - paddingY * 1.5, // a bit more below baseline for descenders
    width: box.width + paddingX * 2 + 20, // extra width buffer for longer replacement text within the cell
    height: box.height + paddingY * 3,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
}

function drawReplacementText(
  page: import("pdf-lib").PDFPage,
  box: BoundingBox,
  text: string,
  font: PDFFont
) {
  // Re-add the colon separator we whited out along with the old value, so
  // the line still reads "Label : New Value" rather than "Label New Value".
  const displayText = box.hasLeadingColon ? `: ${text}` : text;

  // Start at the original font size, then shrink to fit if the new value
  // is wider than the available space (keeps layout intact rather than
  // overflowing into adjacent cells/columns). Centered text gets a more
  // generous allowance since it can grow symmetrically either side.
  let fontSize = box.fontSize > 0 ? box.fontSize : 10;
  const maxWidth = box.textAlign === "center" ? box.width + 120 : Math.max(box.width, 40) + 16;

  let textWidth = font.widthOfTextAtSize(displayText, fontSize);
  const minFontSize = 6;
  while (textWidth > maxWidth && fontSize > minFontSize) {
    fontSize -= 0.5;
    textWidth = font.widthOfTextAtSize(displayText, fontSize);
  }

  // For centered text, recompute the x position so the NEW text is
  // centered on the same point the OLD text was centered on, rather than
  // left-aligning the new text at the old text's start position (which
  // would visibly shift a centered title/subtitle off-center).
  const drawX =
    box.textAlign === "center" ? box.x + box.width / 2 - textWidth / 2 : box.x;

  page.drawText(displayText, {
    x: drawX,
    y: box.y,
    size: fontSize,
    font,
    color: rgb(box.color.r / 255, box.color.g / 255, box.color.b / 255),
  });
}

export type { FieldKey, FormValues };
