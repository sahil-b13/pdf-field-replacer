"use client";

import type { DetectedField } from "../lib/types";

interface FieldPreviewProps {
  imageDataUrl: string;
  pageWidth: number; // PDF user-space width (points)
  pageHeight: number; // PDF user-space height (points)
  maxWidth: number; // CSS px cap on the rendered width on large screens; scales down fluidly below this
  fields: DetectedField[];
}

export default function FieldPreview({
  imageDataUrl,
  pageWidth,
  pageHeight,
  maxWidth,
  fields,
}: FieldPreviewProps) {
  const aspectRatio = pageWidth / pageHeight;

  return (
    <div className="preview-frame" style={{ maxWidth, aspectRatio: `${aspectRatio}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageDataUrl} alt="First page of the uploaded PDF" />
      {fields
        .filter((f) => f.valueBox)
        .map((f) => {
          const box = f.valueBox!;
          // Position as PERCENTAGES of the container rather than fixed
          // pixels, so the highlight boxes track the image's actual
          // rendered size at any viewport width instead of relying on a
          // single precomputed scale factor that goes stale once the
          // container resizes (e.g. on window resize or orientation change).
          const leftPct = (box.x / pageWidth) * 100;
          const topPct = ((pageHeight - box.y - box.height) / pageHeight) * 100;
          const widthPct = Math.max((box.width / pageWidth) * 100, 3);
          const heightPct = Math.max(((box.height + 4) / pageHeight) * 100, 1.5);

          return (
            <div
              key={f.key}
              className="highlight-box"
              style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%` }}
              title={`${f.label}: ${f.detectedValue}`}
            >
              <span className="highlight-tag">{f.label}</span>
            </div>
          );
        })}

      <style jsx>{`
        .preview-frame {
          position: relative;
          width: 100%;
          border: 1px solid var(--rule);
          background: white;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
          overflow: hidden;
        }
        .preview-frame img {
          display: block;
          width: 100%;
          height: 100%;
        }
        .highlight-box {
          position: absolute;
          background: rgba(255, 230, 128, 0.55);
          border: 1.5px solid var(--highlight-border);
          border-radius: 2px;
          pointer-events: auto;
        }
        .highlight-tag {
          position: absolute;
          top: -20px;
          left: -1.5px;
          background: var(--ink);
          color: white;
          font-family: var(--font-mono);
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 2px;
          white-space: nowrap;
          opacity: 0;
          transition: opacity 0.1s ease;
          z-index: 2;
        }
        .highlight-box:hover .highlight-tag {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
