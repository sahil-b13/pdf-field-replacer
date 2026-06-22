"use client";

import { useCallback, useRef, useState } from "react";

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function UploadZone({ onFileSelected, disabled }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndEmit = useCallback(
    (file: File) => {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isZip =
        file.type === "application/zip" ||
        file.type === "application/x-zip-compressed" ||
        file.name.toLowerCase().endsWith(".zip");

      if (!isPdf && !isZip) {
        setError("That file isn't a PDF or ZIP. Choose a .pdf or .zip file.");
        return;
      }
      setError(null);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file) validateAndEmit(file);
    },
    [disabled, validateAndEmit]
  );

  return (
    <div className="upload-wrap">
      <div
        className={`upload-zone ${isDragging ? "dragging" : ""} ${disabled ? "disabled" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) inputRef.current?.click();
        }}
        aria-label="Upload a PDF or ZIP file"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.zip,application/pdf,application/zip,application/x-zip-compressed"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) validateAndEmit(file);
            e.target.value = "";
          }}
          style={{ display: "none" }}
          disabled={disabled}
        />
        <div className="upload-stamp">⊞</div>
        <p className="upload-title">Drop your file here</p>
        <p className="upload-sub">
          One PDF for a single cover page, or a ZIP of PDFs to batch-process them all at once
        </p>
        <span className="upload-pill">Choose file</span>
        <p className="upload-types">Accepts .pdf and .zip — nothing leaves your browser</p>
      </div>
      {error && <p className="upload-error">{error}</p>}

      <style jsx>{`
        .upload-wrap {
          width: 100%;
        }
        .upload-zone {
          border: 2px dashed var(--rule);
          border-radius: 4px;
          background: var(--paper-raised);
          padding: 56px 32px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        @media (max-width: 480px) {
          .upload-zone {
            padding: 36px 18px;
          }
        }
        .upload-zone:hover,
        .upload-zone.dragging {
          border-color: var(--ledger-green);
          background: #fdfcf8;
        }
        .upload-zone.disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .upload-stamp {
          width: 56px;
          height: 56px;
          margin: 0 auto 18px;
          display: grid;
          place-items: center;
          border: 2px solid var(--ink);
          border-radius: 50%;
          font-size: 24px;
          color: var(--ink);
          transform: rotate(-6deg);
        }
        .upload-title {
          font-family: var(--font-display);
          font-size: 1.4rem;
          margin: 0 0 8px;
          color: var(--ink);
        }
        .upload-sub {
          color: var(--ink-soft);
          font-size: 0.95rem;
          max-width: 440px;
          margin: 0 auto 20px;
          line-height: 1.5;
        }
        .upload-pill {
          display: inline-block;
          background: var(--ledger-green);
          color: white;
          padding: 10px 22px;
          border-radius: 3px;
          font-weight: 600;
          font-size: 0.9rem;
          letter-spacing: 0.01em;
        }
        .upload-types {
          margin: 16px 0 0;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--pencil);
        }
        .upload-error {
          margin-top: 12px;
          color: var(--stamp-red);
          font-size: 0.9rem;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
