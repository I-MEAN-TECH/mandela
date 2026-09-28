"use client";

import { Check } from "lucide-react";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, SelectMenu, StatusPill } from "@mandela/ui";
import type { SelectOption } from "@mandela/ui";
import {
  assignDutyAction,
  changeUserRoleAction,
  endDutyAction,
  regenerateJoinCodeAction,
  setPermCellAction,
  type DutyRow,
  type PermMatrixData,
  type TeamOverviewData,
  type UsersRolesData,
} from "@/lib/api";

/**
 * Governance screens (33/34/35) — Users & Roles, Permissions Matrix,
 * Duties & Appointments. The matrix shapes nav/prompts ONLY; the hardcoded
 * role checks stay as the security floor (the matrix cannot grant the DB
 * anything RLS doesn't).
 *
 * Dropdowns are SelectMenu (portal popup, 44px touch rows) — native <select>
 * popups were unreachable/unreliable on phones, and inside the users table
 * the ROLE column sat off-screen behind a horizontal swipe. The table keeps
 * the desktop layout but users also render as stacked cards below md so the
 * role picker is always on screen.
 */

// Phase 6 — all 12 roles (§5 roster) in the pickers and the matrix.
const ROLES = [
  "admin", "principal", "teacher", "bursar", "counter", "driver",
  "dorm_parent", "janitor", "librarian", "patron", "hod",
] as const;
const ROLE_OPTIONS: SelectOption[] = ROLES.map((r) => ({ value: r, label: r }));

/**
 * Team card (§7.7): the join code (display side of the Phase-1 regen
 * endpoint) and who is still pending their start screen (staff.joined).
 * Regen is rate-limited server-side (10/hour) — the UI only forwards.
 */
export function JoinCodeCard({ team }: { team: TeamOverviewData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <Card className="min-w-0">
      <CardHead
        title="Team & join code"
        sub="Staff join with this code at /register. Rotating kills the old code instantly — share the new one."
      />
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-sm border border-border bg-paper-50 px-s3 py-s2 font-mono text-[16px] font-bold tracking-[0.12em] text-ink-950">
          {team.joinCode ?? "—"}
        </span>
        <Button
          variant="ghost"
          disabled={pending || !team.joinCode}
          onClick={() => {
            navigator.clipboard?.writeText(team.joinCode ?? "").then(
              () => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); },
              () => setMsg({ ok: false, text: "Copy failed — select the code manually." }),
            );
          }}
        >
          {copied ? <span className="inline-flex items-center gap-1"><Check aria-hidden size={14} /> Copied</span> : "Copy"}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = (await regenerateJoinCodeAction()) as { ok?: boolean; joinCode?: string; error?: string };
              setMsg(r.ok ? { ok: true, text: `New code: ${r.joinCode}` } : { ok: false, text: r.error ?? "Failed" });
              if (r.ok) router.refresh();
            })
          }
        >
          Regenerate
        </Button>
      </div>
      {msg ? (
        <p className={msg.ok ? "mt-3 text-[12.5px] text-pine-700" : "mt-3 text-[12.5px] text-danger"} role="status">{msg.text}</p>
      ) : null}

      <div className="mt-s3 border-t border-border pt-s3">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          Pending start ({team.pending.length}) — joined the school, hasn't seen their dashboard yet
        </p>
        {team.pending.length === 0 ? (
          <p className="mt-s2 text-[13px] text-ink-500">Everyone on the roster has started. The team is live.</p>
        ) : (
          <ul className="mt-s2 grid gap-s2">
            {team.pending.map((p) => (
              <li key={p.staff_id} className="flex items-center justify-between rounded-sm border border-border bg-paper-50 px-s3 py-s2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink-950">{p.name}</span>
                  <span className="block text-[11.5px] text-muted">{p.role}</span>
                </span>
                <StatusPill tone="warn">not started</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function UsersTable({ users }: { users: UsersRolesData["users"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function changeRole(u: UsersRolesData["users"][number], role: string) {
    start(async () => {
      const r = await changeUserRoleAction({ staffId: u.staff_id, role });
      setMsg(r.ok ? { ok: true, text: `${u.name} → ${role}` } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card className="min-w-0">
      <CardHead
        title="Users & roles"
        sub="Every change is audited before/after. The last active admin can never be demoted."
      />

      {/* Phone — one card per user: role picker always visible, no sideways hunt */}
      <div className="divide-y divide-paper-200 md:hidden">
        {users.map((u) => (
          <div key={u.staff_id} className="py-3 first:pt-1 last:pb-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-ink-950">{u.name}</p>
                <p className="truncate text-[12.5px] text-ink-700">{u.email ?? "—"}</p>
              </div>
              <StatusPill tone={u.active ? "ok" : "neutral"}>{u.active ? "active" : "off"}</StatusPill>
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Role</span>
              <SelectMenu
                value={u.role}
                onChange={(role) => changeRole(u, role)}
                options={ROLE_OPTIONS}
                ariaLabel={`Role for ${u.name}`}
                disabled={pending}
                className="h-10 w-full flex-1"
              />
              {u.duties > 0 ? (
                <span className="shrink-0 rounded-pill bg-paper-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                  {u.duties} hat{u.duties === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* md+ — the dense table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-paper-200">
              <th className="microlabel !mb-0 py-2 pr-3">Name</th>
              <th className="microlabel !mb-0 py-2 pr-3">Email</th>
              <th className="microlabel !mb-0 py-2 pr-3">Hats</th>
              <th className="microlabel !mb-0 py-2 pr-3">Status</th>
              <th className="microlabel !mb-0 py-2">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.staff_id} className="border-b border-paper-200 last:border-b-0">
                <td className="py-2.5 pr-3 font-semibold text-ink-950">{u.name}</td>
                <td className="py-2.5 pr-3 text-[12.5px] text-ink-700">{u.email ?? "—"}</td>
                <td className="numeral py-2.5 pr-3">{u.duties > 0 ? u.duties : "—"}</td>
                <td className="py-2.5 pr-3">
                  <StatusPill tone={u.active ? "ok" : "neutral"}>{u.active ? "active" : "off"}</StatusPill>
                </td>
                <td className="py-2.5">                  <SelectMenu
                    value={u.role}
                    onChange={(role) => changeRole(u, role)}
                    options={ROLE_OPTIONS}
                    ariaLabel={`Role for ${u.name}`}
                    disabled={pending}
                    className="h-9 w-[150px]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {msg ? (
        <p className={msg.ok ? "mt-3 text-[12.5px] text-pine-700" : "mt-3 text-[12.5px] text-danger"} role="status">{msg.text}</p>
      ) : null}
    </Card>
  );
}

export function PermMatrixTable({ rows }: { rows: PermMatrixData["rows"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const modules = [...new Set(rows.map((r) => r.module_key))];
  const cell = (m: string, r: string) => rows.find((x) => x.module_key === m && x.role === r);

  return (
    <Card className="min-w-0">
      <CardHead
        title="Permissions matrix"
        sub="Module × role ownership as data — shapes nav, defaults and prompts. The security floor stays in code; this cannot grant what RLS forbids."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-paper-200">
              <th className="microlabel !mb-0 py-2 pr-3">Module</th>
              {ROLES.map((r) => (
                <th key={r} className="microlabel !mb-0 py-2 pr-2 text-center">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m} className="border-b border-paper-200 last:border-b-0">
                <td className="py-2 pr-3 font-semibold text-ink-950">{m}</td>
                {ROLES.map((r) => {
                  const c = cell(m, r);
                  if (!c) return <td key={r} className="py-2 pr-2 text-center text-ink-300">·</td>;
                  return (
                    <td key={r} className="py-2 pr-2 text-center">
                      <button
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await setPermCellAction({ moduleKey: m, role: r, owns: !c.owns });
                            if (res.ok) router.refresh();
                          })
                        }
                        title={c.landing ? `${r}'s landing tab` : c.owns ? "owns — prompted to act" : "sees only"}
                        className={`h-7 w-7 rounded-pill text-[11px] font-bold transition-colors ${
                          c.landing ? "bg-pine-700 text-white"
                            : c.owns ? "bg-pine-100 text-pine-700"
                            : c.sees ? "bg-paper-100 text-ink-500"
                            : "bg-paper-100 text-ink-300"
                        }`}
                      >
                        {c.landing ? "Landing" : c.owns ? "Owns" : c.sees ? "Sees" : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-500">Landing = landing tab · Owns = acts, prompted · Sees = view only · · hidden</p>
    </Card>
  );
}

const DUTY_PRESETS = [
  { key: "deputy", label: "Deputy Principal" },
  { key: "discipline", label: "Discipline Master" },
  { key: "counselling", label: "Guidance & Counselling" },
  { key: "exams-officer", label: "Exams Officer" },
  { key: "librarian", label: "Librarian" },
  { key: "hod", label: "HOD" },
  { key: "patron-of", label: "Patron (club/sport/house)" },
  { key: "class-teacher-of", label: "Class Teacher" },
  { key: "dorm-parent-of", label: "Dorm Parent" },
];

export function DutiesBoard({ rows, staff }: {
  rows: DutyRow[];
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [staffId, setStaffId] = useState("");
  const [preset, setPreset] = useState(DUTY_PRESETS[0]!.key);
  const [label, setLabel] = useState("");

  const active = rows.filter((r) => r.active);
  const loadPerStaff = new Map<string, number>();
  for (const r of active) loadPerStaff.set(r.staff_id, (loadPerStaff.get(r.staff_id) ?? 0) + 1);
  const multiHat = [...loadPerStaff.entries()].filter(([, n]) => n >= 2);

  return (
    <Card className="min-w-0">
      <CardHead
        title="Duties & appointments"
        sub="Every hat as a scope-carrying row — appointed, audited, endable. Conditional surfaces read their who from here."
      />
      <div className="flex flex-col divide-y divide-paper-200">
        {active.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-[170px] flex-1">
              <p className="text-[13.5px] font-semibold text-ink-950">{d.staff_name}</p>
              <p className="text-[12px] text-ink-500">{d.staff_role}</p>
            </div>
            <div className="min-w-[170px]">
              <p className="text-[13px] text-ink-950">{d.label}</p>
              <p className="text-[11.5px] text-ink-500">from {d.effective_from}{d.scope_id ? ` · scope ${d.scope_id}` : ""}</p>
            </div>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await endDutyAction({ id: d.id });
                  setMsg(r.ok ? { ok: true, text: `${d.label} ended for ${d.staff_name}` } : { ok: false, text: r.error ?? "Failed" });
                  if (r.ok) router.refresh();
                })
              }
            >
              End
            </Button>
          </div>
        ))}
        {active.length === 0 ? (
          <p className="py-4 text-[13px] text-ink-500">No active hats. Appoint the first below.</p>
        ) : null}
      </div>

      {multiHat.length > 0 ? (
        <p className="mt-2 border-t border-paper-200 pt-2 text-[12px] text-ink-700">
          Multi-hat load: {multiHat.map(([id, n]) => {
            const name = rows.find((r) => r.staff_id === id)?.staff_name ?? id.slice(0, 8);
            return `${name} ×${n}`;
          }).join(" · ")}
        </p>
      ) : null}

      <form
        className="mt-3 grid gap-3 border-t border-paper-200 pt-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!staffId || !preset) return;
          const p = DUTY_PRESETS.find((x) => x.key === preset)!;
          start(async () => {
            const r = await assignDutyAction({
              staffId,
              dutyKey: preset,
              label: label.trim() || p.label,
              scopeId: preset.includes("of") ? label.trim() || undefined : undefined,
            });
            setMsg(r.ok ? { ok: true, text: "Hat appointed" } : { ok: false, text: r.error ?? "Failed" });
            if (r.ok) {
              setStaffId("");
              setLabel("");
              router.refresh();
            }
          });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Staff *</span>
          <SelectMenu
            value={staffId}
            onChange={setStaffId}
            options={[{ value: "", label: "Choose…" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]}
            ariaLabel="Staff"
            required={!staffId}
            disabled={pending}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Hat *</span>
          <SelectMenu
            value={preset}
            onChange={setPreset}
            options={DUTY_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
            ariaLabel="Hat"
            disabled={pending}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Detail / scope</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Science, Drama Club, Grade 7 Blue" className="h-11 rounded-sm border border-paper-300 bg-surface px-3 text-[13px] text-ink-950" />
        </label>
        <div className="sm:col-span-3">
          <Button type="submit" variant="secondary" disabled={pending || !staffId}>Appoint</Button>
          {msg ? (
            <span className={msg.ok ? "ml-3 text-[12.5px] text-pine-700" : "ml-3 text-[12.5px] text-danger"} role="status">{msg.text}</span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
