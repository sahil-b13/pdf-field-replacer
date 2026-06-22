"use client";

import { useState, useCallback } from "react";
import UploadZone from "./components/UploadZone";
import FieldPreview from "./components/FieldPreview";
import DetailsForm from "./components/DetailsForm";
import ManualSelector from "./components/ManualSelector";
import Footer from "./components/Footer";
import { extractFirstPageText } from "./lib/pdfTextExtractor";
import { detectFields } from "./lib/fieldDetector";
import { applyOverlays, buildOverlayInstructions } from "./lib/pdfWriter";
import { extractPdfsFromZip, processBatch, buildOutputZip, type BatchPdfEntry } from "./lib/batchProcessor";
import type { DetectionResult, FieldKey, FormValues, BoundingBox } from "./lib/types";

type Stage = "landing" | "detecting" | "review" | "generating" | "done" | "error";
type Mode = "single" | "batch";

const PREVIEW_WIDTH = 620;

export default function Home() {
  const [stage, setStage] = useState<Stage>("landing");
  const [mode, setMode] = useState<Mode>("single");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [singleFileBytes, setSingleFileBytes] = useState<ArrayBuffer | null>(null);
  const [batchEntries, setBatchEntries] = useState<BatchPdfEntry[]>([]);

  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [previewImage, setPreviewImage] = useState<string>("");
  const [formValues, setFormValues] = useState<FormValues>({});

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [downloadName, setDownloadName] = useState<string>("");

  const reset = useCallback(() => {
    setStage("landing");
    setSingleFileBytes(null);
    setBatchEntries([]);
    setDetection(null);
    setPreviewImage("");
    setFormValues({});
    setProgress(null);
    setDownloadUrl("");
    setErrorMessage("");
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    setStage("detecting");
    setErrorMessage("");
    try {
      const isZip = file.name.toLowerCase().endsWith(".zip");

      if (isZip) {
        setMode("batch");
        const bytes = await file.arrayBuffer();
        const entries = await extractPdfsFromZip(bytes);
        if (entries.length === 0) {
          throw new Error("That ZIP doesn't contain any PDF files.");
        }
        setBatchEntries(entries);

        const { items, pageWidth, pageHeight, isLikelyScanned, previewDataUrl } = await extractFirstPageText(
          entries[0].bytes,
          PREVIEW_WIDTH
        );
        const result = detectFields(items, pageWidth, pageHeight, isLikelyScanned);

        setDetection(result);
        setPreviewImage(previewDataUrl);
        seedFormValues(result);
        setStage("review");
      } else {
        setMode("single");
        const bytes = await file.arrayBuffer();
        setSingleFileBytes(bytes);

        const { items, pageWidth, pageHeight, isLikelyScanned, previewDataUrl } = await extractFirstPageText(
          bytes,
          PREVIEW_WIDTH
        );
        const result = detectFields(items, pageWidth, pageHeight, isLikelyScanned);

        setDetection(result);
        setPreviewImage(previewDataUrl);
        seedFormValues(result);
        setStage("review");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong reading that file.");
      setStage("error");
    }
  }, []);

  function seedFormValues(result: DetectionResult) {
    const initial: FormValues = {};
    for (const field of result.fields) {
      if (field.detectedValue) initial[field.key] = "";
    }
    setFormValues(initial);
  }

  const handleFieldChange = useCallback((key: FieldKey, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleManualAssign = useCallback(
    (key: FieldKey, box: BoundingBox, valueText: string) => {
      setDetection((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fields: prev.fields.map((f) =>
            f.key === key ? { ...f, valueBox: box, confidence: "medium" as const } : f
          ),
        };
      });
      setFormValues((prev) => ({ ...prev, [key]: valueText }));
    },
    []
  );

  const handleGenerate = useCallback(async () => {
    if (!detection) return;
    setStage("generating");
    setErrorMessage("");

    try {
      if (mode === "single" && singleFileBytes) {
        const instructions = buildOverlayInstructions(detection.fields, formValues);
        if (instructions.length === 0) {
          throw new Error("No fields have been filled in yet — edit at least one field before generating.");
        }
        const outputBytes = await applyOverlays(singleFileBytes, instructions);
        const blob = new Blob([new Uint8Array(outputBytes)], { type: "application/pdf" });
        setDownloadUrl(URL.createObjectURL(blob));
        setDownloadName("updated-cover-page.pdf");
        setStage("done");
      } else if (mode === "batch" && batchEntries.length > 0) {
        const outputs = await processBatch(batchEntries, detection, formValues, (done, total) =>
          setProgress({ done, total })
        );
        const zipBlob = await buildOutputZip(outputs);
        setDownloadUrl(URL.createObjectURL(zipBlob));
        setDownloadName("updated-practicals.zip");
        setStage("done");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong while generating the file.");
      setStage("error");
    }
  }, [detection, formValues, mode, singleFileBytes, batchEntries]);

  const undetectedKeys: FieldKey[] =
    detection?.fields.filter((f) => !f.valueBox).map((f) => f.key) ?? [];

  return (
    <main className={`page ${stage === "review" ? "is-review" : ""}`}>
      <section className="hero">
        <span className="eyebrow">Stop converting PDFs to Word just to edit your details.</span>
        <h1>Edit your PDF in seconds — no Word conversion needed</h1>
        <p className="hero-sub">
        Upload the PDF, we auto-detect Name, Roll No, Date, and other personal fields on the first page,
        you fill in your own — everything else on the document stays exactly as it was.
        </p>
      </section>

      {stage === "landing" && (
        <section className="upload-section">
          <UploadZone onFileSelected={handleFileSelected} />
          <ul className="reassurance">
            <li>Runs entirely in your browser — files are never uploaded to a server</li>
            <li>Only the detected personal-detail values are touched</li>
            <li>Works with a single PDF, or a ZIP of many for batch mode</li>
          </ul>
        </section>
      )}

      {stage === "detecting" && (
        <section className="status-section">
          <div className="spinner" aria-label="Scanning document" />
          <p>Scanning the first page for personal details…</p>
        </section>
      )}

      {stage === "error" && (
        <section className="status-section error">
          <p className="error-text">{errorMessage}</p>
          <button className="primary-btn" onClick={reset}>
            Try a different file
          </button>
        </section>
      )}

      {stage === "review" && detection && (
        <section className="review-section">
          {detection.isLikelyScanned && (
            <div className="scanned-warning">
              This page looks like a scanned image rather than real text, so automatic detection
              may have found little or nothing. Use the manual selector below to mark fields by
              hand.
            </div>
          )}

          <div className="review-grid">
            <div className="preview-col">
              <h2>Detected on page 1</h2>
              <FieldPreview
                imageDataUrl={previewImage}
                pageWidth={detection.pageWidth}
                pageHeight={detection.pageHeight}
                maxWidth={PREVIEW_WIDTH}
                fields={detection.fields}
              />
              <p className="preview-hint">Hover a highlighted box to see what was detected there.</p>

              <ManualSelector
                imageDataUrl={previewImage}
                pageWidth={detection.pageWidth}
                pageHeight={detection.pageHeight}
                maxWidth={PREVIEW_WIDTH}
                undetectedKeys={undetectedKeys}
                onAssign={handleManualAssign}
              />
            </div>

            <div className="form-col">
              <h2>Your details</h2>
              <p className="form-hint">
                Fields left blank won&rsquo;t be changed on the document.
                {mode === "batch" && ` This will be applied to all ${batchEntries.length} PDFs in the ZIP.`}
              </p>
              <DetailsForm fields={detection.fields} values={formValues} onChange={handleFieldChange} />

              <button className="primary-btn generate-btn" onClick={handleGenerate}>
                {mode === "batch" ? `Replace & download ZIP (${batchEntries.length} files)` : "Replace & download PDF"}
              </button>
              <button className="text-btn" onClick={reset}>
                Start over with a different file
              </button>
            </div>
          </div>
        </section>
      )}

      {stage === "generating" && (
        <section className="status-section">
          <div className="spinner" aria-label="Generating file" />
          {mode === "batch" && progress ? (
            <p>
              Processing file {Math.min(progress.done + 1, progress.total)} of {progress.total}…
            </p>
          ) : (
            <p>Writing your details onto the document…</p>
          )}
        </section>
      )}

      {stage === "done" && (
        <section className="status-section done">
          <div className="done-stamp">✓</div>
          <h2>Done</h2>
          <p>Your file is ready. Nothing was uploaded anywhere — it was generated right here in your browser.</p>
          <a className="primary-btn" href={downloadUrl} download={downloadName}>
            Download {downloadName}
          </a>
          <button className="text-btn" onClick={reset}>
            Process another file
          </button>
        </section>
      )}

      <Footer />

      <style jsx>{`
        .page {
          max-width: 880px;
          margin: 0 auto;
          padding: 56px 24px 0;
          width: 100%;
        }
        .page.is-review {
          max-width: 1180px;
        }
        @media (max-width: 600px) {
          .page {
            padding: 32px 16px 0;
          }
        }
        .hero {
          text-align: center;
          margin-bottom: 40px;
        }
        .eyebrow {
          display: inline-block;
          font-family: var(--font-mono);
          font-size: 0.85rem;
          letter-spacing: 0.01em;
          color: var(--stamp-red);
          margin-bottom: 14px;
          max-width: 480px;
        }
        h1 {
          font-family: var(--font-display);
          font-size: clamp(1.8rem, 4vw, 2.6rem);
          line-height: 1.2;
          margin: 0 0 16px;
          color: var(--ink);
        }
        .hero-sub {
          color: var(--ink-soft);
          font-size: 1.05rem;
          max-width: 560px;
          margin: 0 auto;
          line-height: 1.6;
        }
        .upload-section {
          max-width: 620px;
          margin: 0 auto;
        }
        .reassurance {
          list-style: none;
          padding: 0;
          margin: 24px 0 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .reassurance li {
          font-size: 0.88rem;
          color: var(--ink-soft);
          padding-left: 22px;
          position: relative;
        }
        .reassurance li::before {
          content: "—";
          position: absolute;
          left: 0;
          color: var(--ledger-green);
        }
        .status-section {
          text-align: center;
          padding: 60px 0;
        }
        .status-section p {
          color: var(--ink-soft);
          margin-top: 16px;
        }
        .spinner {
          width: 36px;
          height: 36px;
          border: 3px solid var(--rule);
          border-top-color: var(--ledger-green);
          border-radius: 50%;
          margin: 0 auto;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .error-text {
          color: var(--stamp-red);
          margin-bottom: 20px;
        }
        .scanned-warning {
          background: #fde9e2;
          border: 1px solid var(--stamp-red);
          color: #7a2c18;
          padding: 12px 16px;
          border-radius: 4px;
          font-size: 0.88rem;
          margin-bottom: 24px;
          line-height: 1.5;
        }
        .review-grid {
          display: grid;
          grid-template-columns: minmax(280px, ${PREVIEW_WIDTH}px) minmax(280px, 1fr);
          gap: 32px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .review-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }
        }
        .preview-col,
        .form-col {
          min-width: 0;
          width: 100%;
        }
        .preview-col h2,
        .form-col h2 {
          font-family: var(--font-display);
          font-size: 1.3rem;
          margin: 0 0 14px;
        }
        .preview-hint {
          font-size: 0.82rem;
          color: var(--pencil);
          margin-top: 8px;
        }
        .form-hint {
          font-size: 0.88rem;
          color: var(--ink-soft);
          margin: 0 0 20px;
        }
        .primary-btn {
          display: inline-block;
          background: var(--ledger-green);
          color: white;
          border: none;
          padding: 13px 24px;
          border-radius: 3px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          margin-top: 8px;
        }
        .primary-btn:hover {
          background: var(--ledger-green-dark);
        }
        .generate-btn {
          width: 100%;
          margin-top: 24px;
        }
        .text-btn {
          display: block;
          margin: 14px auto 0;
          background: none;
          border: none;
          color: var(--ink-soft);
          text-decoration: underline;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .done-stamp {
          width: 56px;
          height: 56px;
          margin: 0 auto 16px;
          display: grid;
          place-items: center;
          border: 2px solid var(--ledger-green);
          border-radius: 50%;
          color: var(--ledger-green);
          font-size: 26px;
          transform: rotate(-6deg);
        }
        .done h2 {
          font-family: var(--font-display);
          margin: 0 0 8px;
        }
        .done p {
          max-width: 420px;
          margin: 0 auto 20px;
        }
      `}</style>
    </main>
  );
}
