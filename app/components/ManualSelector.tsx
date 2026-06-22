"use client";

import { useRef, useState } from "react";
import type { BoundingBox, FieldKey } from "../lib/types";
import { FIELD_DEFINITIONS } from "../lib/fieldDefinitions";

interface ManualSelectorProps {
  imageDataUrl: string;
  pageWidth: number;
  pageHeight: number;
  maxWidth: number; // CSS px cap on the rendered width on large screens; scales down fluidly below this
  undetectedKeys: FieldKey[];
  onAssign: (key: FieldKey, box: BoundingBox, valueText: string) => void;
}

interface DragRect {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

export default function ManualSelector({
  imageDataUrl,
  pageWidth,
  pageHeight,
  maxWidth,
  undetectedKeys,
  onAssign,
}: ManualSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragRect | null>(null);
  const [pendingBox, setPendingBox] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null
  );
  const [pickedKey, setPickedKey] = useState<FieldKey | "">("");
  const [valueText, setValueText] = useState("");

  const aspectRatio = pageWidth / pageHeight;
  const undetectedDefs = FIELD_DEFINITIONS.filter((d) => undetectedKeys.includes(d.key));

  if (undetectedDefs.length === 0) return null;

  // Reads the container's ACTUAL current rendered size (which changes with
  // viewport width since the container is now fluid) rather than relying
  // on a single precomputed scale factor that would go stale on resize or
  // when rendered at a different width than originally calculated.
  function getCurrentScale() {
    const rect = containerRef.current!.getBoundingClientRect();
    return rect.width / pageWidth;
  }

  function getRelativePos(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function handleStart(clientX: number, clientY: number) {
    const { x, y } = getRelativePos(clientX, clientY);
    setDrag({ startX: x, startY: y, curX: x, curY: y });
    setPendingBox(null);
  }

  function handleMove(clientX: number, clientY: number) {
    if (!drag) return;
    const { x, y } = getRelativePos(clientX, clientY);
    setDrag({ ...drag, curX: x, curY: y });
  }

  function handleEnd() {
    if (!drag) return;
    const left = Math.min(drag.startX, drag.curX);
    const top = Math.min(drag.startY, drag.curY);
    const width = Math.abs(drag.curX - drag.startX);
    const height = Math.abs(drag.curY - drag.startY);
    setDrag(null);
    if (width < 8 || height < 6) return; // ignore accidental tiny drags/taps
    setPendingBox({ left, top, width, height });
  }

  function confirmAssignment() {
    if (!pendingBox || !pickedKey) return;
    const scale = getCurrentScale();
    // Convert CSS top-left coords back to PDF bottom-left-origin user space.
    const pdfX = pendingBox.left / scale;
    const pdfWidth = pendingBox.width / scale;
    const pdfHeight = pendingBox.height / scale;
    const pdfY = pageHeight - pendingBox.top / scale - pdfHeight;

    const box: BoundingBox = {
      x: pdfX,
      y: pdfY,
      width: pdfWidth,
      height: pdfHeight,
      fontSize: Math.max(pdfHeight * 0.75, 8),
      fontName: "Helvetica",
      isBold: false,
      isItalic: false,
      color: { r: 0, g: 0, b: 0 },
      textAlign: "left",
    };

    onAssign(pickedKey, box, valueText);
    setPendingBox(null);
    setPickedKey("");
    setValueText("");
  }

  const liveRect = drag
    ? {
        left: Math.min(drag.startX, drag.curX),
        top: Math.min(drag.startY, drag.curY),
        width: Math.abs(drag.curX - drag.startX),
        height: Math.abs(drag.curY - drag.startY),
      }
    : null;

  return (
    <div className="manual-wrap">
      <p className="manual-instructions">
        We couldn&rsquo;t confidently find <strong>{undetectedDefs.map((d) => d.label).join(", ")}</strong> on the
        page. Drag (or tap and drag, on mobile) a box around the value on the page below, then tell us which field it
        is.
      </p>

      <div
        ref={containerRef}
        className="manual-frame"
        style={{ maxWidth, aspectRatio: `${aspectRatio}` }}
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={handleEnd}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) handleStart(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) handleMove(t.clientX, t.clientY);
        }}
        onTouchEnd={handleEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageDataUrl} alt="PDF page for manual field selection" draggable={false} />
        {liveRect && (
          <div
            className="drag-rect"
            style={{ left: liveRect.left, top: liveRect.top, width: liveRect.width, height: liveRect.height }}
          />
        )}
        {pendingBox && (
          <div
            className="pending-rect"
            style={{ left: pendingBox.left, top: pendingBox.top, width: pendingBox.width, height: pendingBox.height }}
          />
        )}
      </div>

      {pendingBox && (
        <div className="assign-panel">
          <select value={pickedKey} onChange={(e) => setPickedKey(e.target.value as FieldKey)}>
            <option value="">Which field is this?</option>
            {undetectedDefs.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Your value for this field"
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
          />
          <button onClick={confirmAssignment} disabled={!pickedKey || !valueText.trim()}>
            Add field
          </button>
          <button className="cancel" onClick={() => setPendingBox(null)}>
            Cancel
          </button>
        </div>
      )}

      <style jsx>{`
        .manual-wrap {
          margin-top: 20px;
          padding: 18px;
          background: #fff9ec;
          border: 1.5px dashed var(--highlight-border);
          border-radius: 4px;
        }
        .manual-instructions {
          margin: 0 0 14px;
          font-size: 0.9rem;
          color: var(--ink-soft);
          line-height: 1.5;
        }
        .manual-frame {
          position: relative;
          width: 100%;
          cursor: crosshair;
          border: 1px solid var(--rule);
          user-select: none;
          touch-action: none;
        }
        .manual-frame img {
          display: block;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .drag-rect {
          position: absolute;
          border: 1.5px dashed var(--ledger-green);
          background: rgba(45, 95, 76, 0.1);
        }
        .pending-rect {
          position: absolute;
          border: 2px solid var(--stamp-red);
          background: rgba(181, 72, 42, 0.12);
        }
        .assign-panel {
          margin-top: 12px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        select,
        input {
          font-family: var(--font-body);
          padding: 8px 10px;
          border: 1.5px solid var(--rule);
          border-radius: 3px;
          font-size: 0.9rem;
          flex: 1 1 160px;
          min-width: 0;
        }
        button {
          background: var(--ledger-green);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 3px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        button.cancel {
          background: transparent;
          color: var(--ink-soft);
          border: 1.5px solid var(--rule);
        }
      `}</style>
    </div>
  );
}
