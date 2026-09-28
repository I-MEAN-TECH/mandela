"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Button } from "@mandela/ui";

export function LaundryMoveForm({
  action,
}: {
  action: (input: { learnerId: string; direction: "out" | "in"; items?: string | null; bagRef?: string | null }) => Promise<unknown>;
}) {
  const router = useRouter();
  const [learnerId, setLearnerId] = useState("");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [items, setItems] = useState("");
  const [bagRef, setBagRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!learnerId.trim()) {
      setError("Please enter a Learner ID");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = (await action({
        learnerId: learnerId.trim(),
        direction,
        items: items.trim() || undefined,
        bagRef: bagRef.trim() || undefined,
      })) as { ok?: boolean; error?: string };

      if (res && res.error) {
        setError(res.error);
      } else {
        setLearnerId("");
        setItems("");
        setBagRef("");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record laundry handover");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHead title="Record Garment Handover" sub="Send garments out to wash or return clean items to learner" />
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {error && (
          <div className="rounded bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">Handover Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection("out")}
                className={`flex-1 rounded px-3 py-2 text-xs font-semibold border transition-colors ${
                  direction === "out" ? "bg-amber-100 border-amber-300 text-amber-900" : "bg-paper-100 border-border text-ink-700"
                }`}
              >
                Send Out (Wash)
              </button>
              <button
                type="button"
                onClick={() => setDirection("in")}
                className={`flex-1 rounded px-3 py-2 text-xs font-semibold border transition-colors ${
                  direction === "in" ? "bg-pine-100 border-pine-300 text-pine-900" : "bg-paper-100 border-border text-ink-700"
                }`}
              >
                Return In (Clean)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">Learner ID / Code</label>
            <input
              type="text"
              value={learnerId}
              onChange={(e) => setLearnerId(e.target.value)}
              placeholder="e.g. LRN-1042"
              className="w-full rounded border border-border bg-surface px-3 py-2 text-xs text-ink-950 focus:border-pine-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">Bag / Tag Ref</label>
            <input
              type="text"
              value={bagRef}
              onChange={(e) => setBagRef(e.target.value)}
              placeholder="e.g. BAG-04"
              className="w-full rounded border border-border bg-surface px-3 py-2 text-xs text-ink-950 focus:border-pine-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">Garment Description</label>
            <input
              type="text"
              value={items}
              onChange={(e) => setItems(e.target.value)}
              placeholder="e.g. 2 shirts, 1 trouser, 2 socks"
              className="w-full rounded border border-border bg-surface px-3 py-2 text-xs text-ink-950 focus:border-pine-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : direction === "out" ? "Record Handover to Wash" : "Confirm Return to Student"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
