"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead, Money, StatusPill, EmptyState } from "@mandela/ui";
import {
  upsertSectionAction,
  toggleSectionAction,
  deleteSectionAction,
  getSectionDetail,
  addSectionMembersAction,
  removeSectionMemberAction,
  holdSectionSessionAction,
  type SectionRow,
  type SectionDetail,
  type StaffRow,
} from "@/lib/api";

/**
 * Sections & Patrons client — the register of sections plus a drawer that
 * loads the section's four capabilities. Every write is a real endpoint;
 * errors surface inline (docs/FORM-STANDARDS.md).
 */

const KINDS = ["lab", "sports", "drama", "music", "club", "mess", "security", "infirmary", "library", "store", "transport", "house"] as const;

export function SectionsClient({ rows, staff, canManage = true }: { rows: SectionRow[]; staff: StaffRow[]; canManage?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("sports");
  const [head, setHead] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const openCreate = () => {
    setEditId(null); setName(""); setKind("sports"); setHead(""); setErr(null);
    setShowForm((v) => !v);
  };

  const openEdit = (s: SectionRow) => {
    setEditId(s.id); setName(s.name); setKind(s.kind); setHead(s.head_staff_id ?? ""); setErr(null);
    setShowForm(true);
  };

  const save = () => {
    setErr(null);
    if (name.trim().length < 2) return setErr("Give the section a name (2+ characters).");
    start(async () => {
      const r = await upsertSectionAction({ id: editId ?? undefined, name: name.trim(), kind, headStaffId: head || null });
      if (!r.ok) { setErr(r.error ?? "Could not save the section"); return; }
      setName(""); setHead(""); setEditId(null);
      setShowForm(false);
      router.refresh();
    });
  };

  const remove = (s: SectionRow) => {
    const members = s.members > 0 ? ` It has ${s.members} member${s.members > 1 ? "s" : ""} — they will be removed from the register.` : "";
    if (!confirm(`Delete “${s.name}” permanently?${members} Its sessions are deleted; kit and events are detached. This cannot be undone.`)) return;
    start(async () => {
      const r = await deleteSectionAction({ id: s.id });
      if (!r.ok) { setErr(r.error ?? "Could not delete the section"); setShowForm(true); return; }
      router.refresh();
    });
  };

  const toggle = (id: string, enabled: boolean) => {
    start(async () => {
      await toggleSectionAction({ id, enabled });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-s4">
      <Card>
        <CardHead
          title="The register"
          sub="Every section is a row — same engine, same four capabilities. Tap a section to open its register, sessions and kit."
          action={canManage ? (
            <Button variant="primary" onClick={openCreate}>
              {showForm ? "Close" : "+ New section"}
            </Button>
          ) : undefined}
        />

        {showForm ? (
          <div className="mb-s5 flex max-w-xl flex-col gap-s3 rounded-lg border border-border bg-surface p-s4">
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">Name</span>
              <input
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
                placeholder="U16 Football"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">Kind</span>
              <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-s1 text-sm">
              <span className="font-medium">Patron (head)</span>
              <select className="rounded-md border border-border bg-surface px-3 py-2 text-sm" value={head} onChange={(e) => setHead(e.target.value)}>
                <option value="">— appoint later —</option>
                {staff.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </label>
            {err ? <p className="text-sm text-danger">{err}</p> : null}
            <div>
              <Button variant="primary" disabled={pending} onClick={save}>{editId ? "Save changes" : "Create section"}</Button>
              <span className="ml-s3 text-xs text-muted">Appointing a patron writes the audited hat to Duties.</span>
            </div>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            title="No sections yet"
            body="Create the school's first section — a lab, a sports team, the drama club. Each gets a patron, a register, sessions and kit."
          />
        ) : (
          <div className="grid gap-s4">
            {rows.map((s) => (
              <div key={s.id} className="flex flex-col gap-s2 rounded-lg border border-border bg-surface p-s4">
                <button type="button" onClick={() => setOpenId(s.id)} className="flex flex-col gap-s2 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold text-text">{s.name}</span>
                    <StatusPill tone={s.enabled ? "ok" : "neutral"}>{s.enabled ? "enabled" : "off"}</StatusPill>
                  </div>
                  <p className="text-xs uppercase tracking-wide text-muted">{s.kind}</p>
                  <p className="text-sm text-muted">
                    Patron: {s.head_name ?? <span className="text-warn">not appointed</span>}
                  </p>
                  <div className="flex items-center justify-between pt-s2 text-xs text-muted">
                    <span>{s.members} members · {s.kit_items} kit items</span>
                    <Money cents={s.kit_value_cents} className="text-[13px]" />
                  </div>
                </button>
                {canManage ? (
                  <div className="flex flex-wrap items-center gap-s2 pt-s1" role="group" aria-label={`Manage ${s.name}`}>
                    <Button size="sm" disabled={pending} onClick={() => openEdit(s)}>Edit</Button>
                    <Button size="sm" disabled={pending} onClick={() => toggle(s.id, !s.enabled)}>
                      {s.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="danger" disabled={pending} onClick={() => remove(s)}>
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {openId ? (
        <SectionDrawer sectionId={openId} staff={staff} onClose={() => setOpenId(null)} onChanged={() => router.refresh()} />
      ) : null}
    </div>
  );
}

function SectionDrawer({
  sectionId,
  staff,
  onClose,
  onChanged,
}: {
  sectionId: string;
  staff: StaffRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const [detail, setDetail] = useState<SectionDetail | null>(null);
  const [topic, setTopic] = useState("");
  const [pickName, setPickName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    start(async () => {
      const d = await getSectionDetail(sectionId);
      if (d && "section" in (d as SectionDetail)) setDetail(d as SectionDetail);
    });
  };

  useEffect(load, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hold = () => {
    if (!detail) return;
    const present = detail.members.map((m) => m.learner_id);
    if (present.length === 0) return setMsg("Add members before holding a session.");
    start(async () => {
      const r = await holdSectionSessionAction({ sectionId: detail.section.id, topic: topic || null, present, absent: [] });
      if (!r.ok) { setMsg(r.error ?? "could not hold the session"); return; }
      setMsg(`Session held — all ${present.length} present by default.`);
      setTopic("");
      onChanged();
      const d = await getSectionDetail(detail.section.id);
      if (d && "section" in (d as SectionDetail)) setDetail(d as SectionDetail);
    });
  };

  const addMember = () => {
    if (!detail || !pickName.trim()) return;
    const match = staff.find((s) => s.full_name.toLowerCase() === pickName.trim().toLowerCase());
    setMsg(match ? "That name matches a staff member — members are learners. Use the learner's admission name." : null);
    start(async () => {
      const r = await addSectionMembersAction({ sectionId: detail.section.id, learnerIds: [pickName.trim()] });
      if (!r.ok) { setMsg(r.error ?? "could not add the member"); return; }
      setPickName(""); setMsg("Member added.");
      const d = await getSectionDetail(detail.section.id);
      if (d && "section" in (d as SectionDetail)) setDetail(d as SectionDetail);
    });
  };

  const removeMember = (learnerId: string) => {
    if (!detail) return;
    start(async () => {
      await removeSectionMemberAction({ sectionId: detail.section.id, learnerId });
      const d = await getSectionDetail(detail.section.id);
      if (d && "section" in (d as SectionDetail)) setDetail(d as SectionDetail);
    });
  };

  if (!detail) {
    return (
      <Card>
        <CardHead title="Loading section…" />
        <p className="p-s4 text-sm text-muted">Reading the register…</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-s4">
      <Card>
        <CardHead
          title={`${detail.section.name} · ${detail.section.kind}`}
          sub={`Patron: ${detail.section.head_name ?? "not appointed"} · ${detail.section.enabled ? "enabled" : "disabled"}`}
          action={<Button onClick={onClose}>Close</Button>}
        />
        {msg ? <p className="px-s5 pb-s2 text-sm text-ok">{msg}</p> : null}
        <div className="grid gap-s5 p-s5 lg:grid-cols-2">
          <div className="flex flex-col gap-s3">
            <h4 className="text-sm font-semibold text-text">Register — {detail.members.length} members</h4>
            {detail.members.length === 0 ? (
              <p className="text-sm text-muted">Paste a learner id below (from the Learners screen) to add the first member.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {detail.members.map((m) => (
                  <div key={m.learner_id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span className="font-medium text-text">{m.learner}</span>
                      <span className="ml-s2 text-xs text-muted">{m.admission_no}{m.class_name ? ` · ${m.class_name}` : ""}</span>
                    </span>
                    <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => removeMember(m.learner_id)}>
                      retire
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-s2">
              <input
                className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                placeholder="Learner id (uuid from Learners)"
                value={pickName}
                onChange={(e) => setPickName(e.target.value)}
              />
              <Button disabled={pending || !pickName.trim()} onClick={addMember}>Add</Button>
            </div>
          </div>

          <div className="flex flex-col gap-s3">
            <h4 className="text-sm font-semibold text-text">Sessions</h4>
            {detail.sessions.length === 0 ? (
              <p className="text-sm text-muted">No sessions yet — hold the first one.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {detail.sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{s.held_on}{s.topic ? ` · ${s.topic}` : ""}</span>
                    <span className="text-xs text-muted">{s.present}/{s.total} present</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-s2">
              <input
                className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                placeholder="Topic (optional)"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <Button variant="primary" disabled={pending} onClick={hold}>Hold session</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Kit tagged to this section" sub="Reuses the store's stock tables — no separate inventory." />
        {detail.kit.length === 0 ? (
          <p className="p-s5 text-sm text-muted">No kit tagged yet. Tag stock items to this section from the Store module.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border px-s5 pb-s4">
            {detail.kit.map((k) => (
              <div key={k.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-text">
                  {k.name} {k.low ? <span className="ml-s2 text-xs text-warn">low stock</span> : null}
                </span>
                <span className="text-muted">×{k.qty_on_hand} · <Money cents={k.unit_price} className="text-[13px]" /></span>
              </div>
            ))}
          </div>
        )}
        <p className="px-s5 pb-s4 text-xs text-muted">{staff.filter((s) => s.active).length} staff available for patron appointments.</p>
      </Card>
    </div>
  );
}
