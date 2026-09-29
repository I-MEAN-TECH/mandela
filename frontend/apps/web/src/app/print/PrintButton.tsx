"use client";

/**
 * PrintButton — the print/save-as-PDF trigger on /print/* document pages.
 * Client-side by necessity (window.print); the document itself stays a
 * server-rendered sheet.
 */
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <div className="mt-6 flex justify-center print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="h-11 rounded-sm bg-pine-700 px-6 text-[13.5px] font-semibold text-white hover:bg-pine-800"
      >
        {label}
      </button>
    </div>
  );
}
