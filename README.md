# Cover Page Swap

Swap your personal details (name, roll number, enrollment ID, etc.) onto a
friend's practical file or assignment cover page — without touching anything
else on the document. Runs entirely in the browser: nothing is uploaded to a
server, nothing is stored anywhere.

Built to solve one specific, repetitive problem: receiving a practical file
PDF from a friend, needing to swap in your own name/roll number/etc. on the
cover page, and re-uploading it to a college portal — without the layout
getting mangled (which `ilovepdf`-style "convert to Word and back" workflows
tend to do).

## How it works

1. **Upload** a single PDF, or a ZIP containing several PDFs that share the
   same cover-page template (batch mode).
2. The tool reads the **text layer** of page 1 (via `pdfjs-dist`) and looks
   for labeled fields — "Name of Student", "Enrollment No", "Roll No",
   "Academic Year", "Semester", "Branch/Class", "Subject", "Date of
   Submission" — using regex pattern matching against common label phrasings.
3. You see the detected fields highlighted on the page, and a form pre-filled
   with what was found. You type in your own details.
4. The tool draws a white rectangle exactly over each old value's bounding
   box and writes your new value in its place — matching the original's
   font size, bold/italic style, and text color (sampled directly from the
   rendered page), and re-centering the replacement if the original value
   was a centered title/subtitle rather than left-aligned. Everything else
   on the page (images, tables, other text, logos) is left completely
   alone, because it's literally never touched.
5. In batch mode, the same replacements are applied to every PDF in the ZIP,
   and you download a ZIP of the results.

If a field can't be confidently auto-detected (or the page turns out to be a
scanned image rather than real text), you can drag a box around the value by
hand and tell the tool which field it is.

## Tech stack

- **Next.js 14** (App Router) + TypeScript, deployed as a static-friendly app
  on Vercel's free Hobby plan
- **pdfjs-dist** — reads the text layer + renders a page-1 preview image
- **pdf-lib** — draws the white-out + replacement text onto the PDF
- **JSZip** — unpacks/repacks ZIPs for batch mode
- No backend, no database, no AI APIs, no file storage. Everything happens
  in the browser; files are held in memory and discarded when you close the
  tab.

## Project structure

```
pdf-field-replacer/
├── app/
│   ├── page.tsx                 # main flow: upload → detect → review → generate → download
│   ├── layout.tsx
│   ├── globals.css
│   ├── components/
│   │   ├── UploadZone.tsx       # drag-and-drop file input
│   │   ├── FieldPreview.tsx     # renders page 1 + yellow highlight boxes
│   │   ├── DetailsForm.tsx      # editable form, pre-filled with detected values
│   │   ├── ManualSelector.tsx   # drag-to-select fallback for undetected fields
│   │   └── Footer.tsx           # attribution + "Built for Digital Heroes" link
│   └── lib/
│       ├── types.ts             # shared types
│       ├── fieldDefinitions.ts  # regex patterns per field
│       ├── fieldDetector.ts     # core detection engine (line grouping, label/value matching)
│       ├── pdfTextExtractor.ts  # pdfjs-dist wrapper (text extraction + page rendering)
│       ├── pdfWriter.ts         # pdf-lib wrapper (white-out + redraw)
│       └── batchProcessor.ts    # JSZip-based batch mode
├── scripts/
│   └── copy-pdf-worker.js       # postinstall: copies pdfjs worker into /public
├── public/                      # pdf.worker.min.js lands here after install
├── package.json
├── next.config.js
└── tsconfig.json
```

## Running locally

Requires Node 18+ (Node 20+ recommended).

```bash
npm install      # also runs postinstall, which copies the pdf.js worker into /public
npm run dev
```

Open http://localhost:3000.

To build and run the production build locally:

```bash
npm run build
npm start
```

## Deploying to Vercel (free Hobby plan)

1. Push this project to a **public GitHub repo** (required by the brief).
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, click **Add
   New → Project**, and import the repo.
3. Vercel auto-detects Next.js — leave the default build settings
   (`npm install` / `npm run build`) as they are. No environment variables
   are needed.
4. Click **Deploy**. That's it — no paid add-ons, no database, no storage
   bucket, ₹0 spent.

Because `npm install` triggers the `postinstall` script, the pdf.js worker
file is copied into `public/` automatically on every Vercel build, so you
don't need to commit a large binary worker file to the repo.

## Before you deploy: things to edit

- **`app/components/Footer.tsx`** — replace `[YOUR FULL NAME HERE]` and
  `[your.email@example.com]` with your actual name and email (the spec
  requires these to be visible on the page so people can contact you).
- The "Built for Digital Heroes" button already links to
  `https://digitalheroesco.com` as required — no changes needed there.

## How field detection actually works

The detection engine (`app/lib/fieldDetector.ts`) does roughly this:

1. **Extract** every text run from page 1 via `pdfjs-dist`, each with an
   exact bounding box in PDF coordinate space.
2. **Group** text runs into visual "lines" by comparing baseline (y)
   positions.
3. For each line, **scan left to right** for a run of text that matches one
   of the known label patterns (e.g. `/\bname\s*of\s*student\b/i`). Labels
   that are split across multiple text runs by the PDF generator (e.g.
   `"Date"` + `"of Submission"` as two separate runs) are handled by growing
   the match window until it stabilizes on the most specific pattern.
4. Once a label is found, look for its **value**:
   - First, check for text immediately after it on the same line (after
     stripping a leading colon/dash) — this covers the common
     `"Label : Value"` layout, including multiple label/value pairs side by
     side on one row.
   - If nothing follows on the same line, check the line directly below at
     the same horizontal position — this covers boxed/table layouts where
     the value sits under its label.
5. If a colon was part of the original value text, it's redrawn after
   white-out so the line still reads `Label : New Value` instead of losing
   the separator.
6. A field that can't be matched this way still appears in the form (so you
   can fill it in), but won't be auto-overlaid onto the PDF unless you use
   the manual selector to tell the tool exactly where it is.

This is intentionally conservative: a field is only ever overlaid onto the
PDF if the tool found (or you manually pointed at) an exact bounding box for
it. Nothing is overlaid speculatively, and nothing outside a confirmed value
box is ever touched.

## Known limitations (v1)

- **Scanned / image-only PDFs**: if page 1 has no real text layer (i.e. it's
  a photo or scan of a printed page), automatic detection will find little
  or nothing — pdfjs can only read text that's actually encoded in the PDF,
  not pixels. The tool detects this case and shows a warning, and you can
  use the manual drag-to-select fallback to tag fields by hand on the
  rendered page image. Full OCR (e.g. Tesseract.js) was deliberately left out
  of v1 to keep the bundle small and the tool fast — it's a reasonable
  follow-up if you hit this often.
- **Unusual / heavily templated layouts**: the detector handles the common
  "Label : Value" and "label-above-value" patterns, plus labels split across
  multiple text runs and multiple label/value pairs on one row. Truly
  unconventional layouts (rotated text, labels embedded inside images, values
  inside form fields/widgets rather than plain text) may need the manual
  selector.
- **Batch mode** re-runs detection on every file individually (not just the
  first one) so that small positional drift between files doesn't cause
  misalignment, but it assumes every file in the ZIP shares essentially the
  same cover-page template and field labels as the first file.
- Font matching samples the actual rendered pixel color and infers
  bold/italic from the PDF's internal font name, then maps onto the closest
  standard Helvetica variant (regular/bold/italic/bold-italic) at the
  original font size — it does not re-embed the document's exact original
  font file, since reliably extracting and embedding arbitrary fonts from
  arbitrary PDFs is its own can of worms. Font *size* is matched exactly and
  shrinks automatically if your replacement text is longer than the
  original.
- The review screen (preview + form) and the rest of the page are fully
  responsive — the layout collapses to a single column on phones and
  tablets, the manual field selector supports touch drag-to-select, and
  highlighted boxes scale with the page image at any viewport width.

## License

MIT — see `LICENSE`.
