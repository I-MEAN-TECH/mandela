"use client";

import { useRef, useState } from "react";
import { Button } from "@mandela/ui";

/**
 * CsvFilePicker — the shared "submit a CSV file" drop-zone. Click to browse
 * or drop a file onto it; the file is read as text and handed to onFile with
 * its name. Shows the picked filename so the user can confirm what they just
 * submitted. Optional template download lives inside the zone (one place,
 * every importer).
 */
export function CsvFilePicker({
  onFile,
  loading,
  templateText,
  templateName = "import-template.csv",
  label = "Upload a CSV file",
  sub = "Click to browse, or drop the file here",
  className,
}: {
  onFile: (text: string, filename: string) => void;
  loading?: boolean;
  templateText?: string;
  templateName?: string;
  label?: string;
  sub?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setPicked(file.name);
    onFile(text, file.name);
  }

  function downloadTemplate() {
    if (!templateText) return;
    const url = URL.createObjectURL(new Blob([templateText], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = templateName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!loading) void handle(e.dataTransfer.files?.[0]);
      }}
      className={`rounded-sm border border-dashed px-4 py-4 text-center transition-colors ${
        drag ? "border-primary bg-primary-soft" : "border-paper-300 bg-paper-50"
      } ${className ?? ""}`}
    >
      <input
        ref={ref}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        className="sr-only"
        onChange={(e) => {
          void handle(e.target.files?.[0]);
          e.target.value = "";
        }}
        aria-label={label}
      />
      <p className="text-[13px] font-semibold text-ink-950">{label}</p>
      <p className="mt-0.5 text-[12px] text-muted">{picked ? `Submitted: ${picked}` : sub}</p>
      <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" variant="secondary" loading={loading} onClick={() => ref.current?.click()}>
          Choose file
        </Button>
        {templateText ? (
          <Button size="sm" variant="ghost" onClick={downloadTemplate}>
            Download template
          </Button>
        ) : null}
      </div>
    </div>
  );
}
