import { requireSession, getLaundryCustody, recordLaundryMoveAction } from "@/lib/api";
import { SerifHeader, Card, CardHead, EmptyState, StatusPill, Reveal } from "@mandela/ui";
import { AppLiveBar } from "../LiveBar";
import { LaundryMoveForm } from "@/app/app/laundry/LaundryMoveForm";

export default async function LaundryPage() {
  await requireSession();
  const res = await getLaundryCustody();
  const rows = "rows" in res ? res.rows : [];

  return (
    <div>
      <SerifHeader
        crumb="Boarding · Laundry"
        title="Laundry Custody & Garment Handover"
        sub="Track boarder laundry bags sent out to wash and items returned to students."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s5">
        <LaundryMoveForm action={recordLaundryMoveAction} />

        <Reveal delay={60}>
          <Card>
            <CardHead
              title="Garments Currently Out in Laundry"
              sub={`${rows.length} boarder ${rows.length === 1 ? "bag" : "bags"} in wash custody`}
            />
            {rows.length === 0 ? (
              <EmptyState
                title="All laundry returned"
                body="No laundry bags or garments are currently out at the wash."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted">
                      <th className="px-4 py-3">Learner</th>
                      <th className="px-4 py-3">Class</th>
                      <th className="px-4 py-3">Items Out</th>
                      <th className="px-4 py-3">Bag Ref</th>
                      <th className="px-4 py-3">Sent At</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                      <tr key={row.learner_id} className="hover:bg-paper-50">
                        <td className="px-4 py-3 font-semibold text-ink-950">{row.learner}</td>
                        <td className="px-4 py-3 text-ink-600">{row.class_name ?? "—"}</td>
                        <td className="px-4 py-3 text-ink-800">{row.out_items || "Uniform set"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-600">{row.bag_ref ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-ink-500">
                          {row.out_at ? new Date(row.out_at).toLocaleDateString("en-KE") : "Today"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill tone="warn">In Wash</StatusPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Reveal>
      </div>
    </div>
  );
}
