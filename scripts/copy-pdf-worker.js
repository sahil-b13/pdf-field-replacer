/**
 * Copies the pdf.js worker file from node_modules into /public so it can be
 * served as a static asset at runtime. pdfjs-dist requires the worker to be
 * loaded from a real URL (not bundled through webpack), and this needs to
 * run on every install (including on Vercel) since node_modules isn't
 * committed to the repo.
 */
const fs = require("fs");
const path = require("path");

const src = path.join(
  __dirname,
  "..",
  "node_modules",
  "pdfjs-dist",
  "build",
  "pdf.worker.min.js"
);
const destDir = path.join(__dirname, "..", "public");
const dest = path.join(destDir, "pdf.worker.min.js");

try {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  console.log("[postinstall] Copied pdf.worker.min.js to /public");
} catch (err) {
  console.error("[postinstall] Failed to copy pdf.js worker:", err.message);
  process.exit(1);
}
