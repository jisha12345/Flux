"use client";

import { Download } from "lucide-react";

/** Screen-only "Download PDF" button — opens the browser print dialog, where
 *  report.css takes over (US Letter, exact colors, per-section page breaks). */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="hyr-print-btn inline-flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold text-white"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Download PDF
    </button>
  );
}
