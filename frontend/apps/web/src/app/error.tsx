"use client";

import { Button } from "@mandela/ui";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-s5 text-center">
      <div className="max-w-md">
        <p className="microlabel">Something broke</p>
        <h1 className="display mt-s3 text-[32px] text-ink-950">
          The page hit a snag.
        </h1>
        <p className="mt-s3 text-sm leading-relaxed text-muted">
          Nothing was lost — your data is safe in the school database. Try again, and if it keeps
          happening, tell the school office.
        </p>
        <div className="mt-s5 flex justify-center">
          <Button variant="primary" size="lg" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
