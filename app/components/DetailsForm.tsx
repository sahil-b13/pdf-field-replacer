"use client";

import type { DetectedField, FieldKey, FormValues } from "../lib/types";

interface DetailsFormProps {
  fields: DetectedField[];
  values: FormValues;
  onChange: (key: FieldKey, value: string) => void;
}

export default function DetailsForm({ fields, values, onChange }: DetailsFormProps) {
  return (
    <div className="form-grid">
      {fields.map((field) => {
        const isDetected = !!field.valueBox;
        return (
          <div className="field" key={field.key}>
            <label htmlFor={`field-${field.key}`}>
              {field.label}
              {!isDetected && <span className="undetected-tag">not auto-detected</span>}
            </label>
            <input
              id={`field-${field.key}`}
              type="text"
              value={values[field.key] ?? ""}
              placeholder={isDetected ? field.detectedValue || "Enter value" : "Enter value manually"}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          </div>
        );
      })}

      <style jsx>{`
        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          width: 100%;
        }
        @media (max-width: 520px) {
          .form-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }
        label {
          font-family: var(--font-mono);
          font-size: 0.78rem;
          letter-spacing: 0.02em;
          color: var(--ink-soft);
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .undetected-tag {
          text-transform: none;
          background: #fde9e2;
          color: var(--stamp-red);
          font-size: 0.68rem;
          padding: 1px 6px;
          border-radius: 2px;
          letter-spacing: 0;
        }
        input {
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          font-family: var(--font-body);
          font-size: 1rem;
          padding: 10px 12px;
          border: 1.5px solid var(--rule);
          border-radius: 3px;
          background: var(--paper-raised);
          color: var(--ink);
        }
        input:focus {
          border-color: var(--ledger-green);
        }
      `}</style>
    </div>
  );
}
