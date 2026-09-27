import Link from "next/link";
import { Button } from "@mandela/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-s5 text-center">
      <div className="max-w-md">
        <p className="microlabel">Page not found</p>
        <h1 className="display mt-s3 text-[32px] text-ink-950">
          Nothing lives here.
        </h1>
        <p className="mt-s3 text-sm leading-relaxed text-muted">
          The page you're after doesn't exist — it may have moved, or the address is mistyped.
        </p>
        <div className="mt-s5 flex justify-center">
          <Link href="/">
            <Button variant="primary" size="lg">
              Back to the start
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
