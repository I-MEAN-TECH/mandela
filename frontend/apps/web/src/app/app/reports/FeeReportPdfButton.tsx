"use client";

import { Button } from "@mandela/ui";

/**
 * Fee report PDF — streams the collections table from the API as A4 bytes
 * (same C13 law as report-card/statement PDFs: session-forwarded proxy,
 * pdfkit server-side). Opens inline so the office can save or email it.
 */
export function FeeReportPdfButton() {
  return (
    <Button
      variant="secondary"
      onClick={() => window.open("/api/pdf?kind=fee-report", "_blank", "noopener")}
    >
      Download PDF
    </Button>
  );
}
