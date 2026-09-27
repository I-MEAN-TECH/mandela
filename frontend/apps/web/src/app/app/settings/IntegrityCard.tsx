import { Card, CardHead, StatusPill, EmptyState } from "@mandela/ui";

/**
 * IntegrityCard — the money-lifecycle checks rendered as a health board
 * (docs/ECOSYSTEM-STRATEGY.md §2.3). Server component: static read of the
 * five invariants; the harness fails builds, this card shows the principal.
 */
export function IntegrityCard({
  result,
}: {
  result: { ok: boolean; checks: { name: string; ok: boolean; count: number; detail: string }[] } | { error: string };
}) {
  return (
    <Card>
      <CardHead
        title="Money integrity"
        sub="Five checks over the live ledger — any red means fix before billing day"
        action={<StatusPill tone={"error" in result ? "warn" : result.ok ? "ok" : "danger"}>{"error" in result ? "unavailable" : result.ok ? "all clear" : "attention"}</StatusPill>}
      />
      {"error" in result ? (
        <EmptyState title="Could not run the checks" body={result.error} />
      ) : (
        <ul className="grid gap-2">
          {result.checks.map((k) => (
            <li key={k.name} className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
              <div>
                <p className="text-sm font-semibold">{k.name}</p>
                <p className="mt-0.5 text-xs text-muted">{k.detail}</p>
              </div>
              <StatusPill tone={k.ok ? "ok" : "danger"}>{k.ok ? "pass" : `${k.count} issue${k.count === 1 ? "" : "s"}`}</StatusPill>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
