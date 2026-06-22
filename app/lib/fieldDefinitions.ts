import { FieldDefinition } from "./types";

// Patterns are matched against a normalized label string (lowercased,
// punctuation/extra-whitespace collapsed). Order within each pattern list
// doesn't matter; order of FIELD_DEFINITIONS controls scan priority when
// two labels could plausibly overlap (e.g. "Roll No" appearing inside an
// "Enrollment / Roll No" combined label - we want enrollment to claim it
// first only if "enrollment" literally appears, otherwise rollNo wins).
export const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    key: "name",
    label: "Name of Student",
    patterns: [
      /\bname\s*of\s*(the\s*)?student\b/i,
      /\bstudent('?s)?\s*name\b/i,
      /\bcandidate('?s)?\s*name\b/i,
      /^name\s*[:\-]?$/i,
      /\bname\b(?!\s*of\s*(college|institute|subject|guide|hod|teacher|faculty|examiner))/i,
    ],
  },
  {
    key: "enrollment",
    label: "Enrollment / Student ID",
    patterns: [
      /\benrol+ment\s*(no\.?|number|id)?\b/i,
      /\bstudent\s*id\b/i,
      /\bregistration\s*(no\.?|number)?\b/i,
      /\bprn\b/i,
      /\bseat\s*no\.?\b/i,
    ],
  },
  {
    key: "rollNo",
    label: "Roll Number",
    patterns: [/\broll\s*(no\.?|number)\b/i],
  },
  {
    key: "academicYear",
    label: "Academic Year",
    patterns: [
      /\bacademic\s*year\b/i,
      /\bsession\b/i,
      /^year\s*[:\-]?$/i,
    ],
  },
  {
    key: "semester",
    label: "Semester",
    patterns: [/\bsemester\b/i, /\bsem\.?\s*[:\-]?\b/i, /\bterm\b/i],
  },
  {
    key: "branch",
    label: "Class / Branch",
    patterns: [
      /\bclass\s*\/\s*branch\b/i,
      /\bbranch\b/i,
      /\bdivision\b/i,
      /\bclass\b/i,
      /\bcourse\b/i,
      // Deliberately NOT matching a bare /\bdepartment\b/ — institutional
      // headers like "DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING" are
      // extremely common on Indian college cover pages and are NOT the
      // personal "Class/Branch" field; matching them caused the detector
      // to grab a department heading instead of the actual branch value.
      // Only match "department" when it's phrased as an actual field
      // label, i.e. immediately followed by a colon/dash.
      /\bdepartment\s*[:\-]/i,
    ],
  },
  {
    key: "subject",
    label: "Subject",
    patterns: [
      /\bsubject\s*name\b/i,
      /\bsubject\b/i,
      /\bpaper\b/i,
    ],
  },
  {
    key: "date",
    label: "Date of Submission",
    patterns: [
      /\bdate\s*of\s*submission\b/i,
      /\bsubmission\s*date\b/i,
      /^date\s*[:\-]?$/i,
      /\bdate\b/i,
    ],
  },
];

/** Lowercase, trim, collapse whitespace, drop trailing colons/dashes for matching. */
export function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
