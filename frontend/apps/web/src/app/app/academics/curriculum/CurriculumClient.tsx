"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead } from "@mandela/ui";
import {
  setCurriculumPackAction,
  attachClassLevelAction,
  getCurriculumContext,
  type CurriculumSetupData,
  type CurriculumContext,
  type CurriculumPackRow,
} from "@/lib/api";

/**
 * Curriculum Setup ⑯ — the client surfaces (docs/BUILD-PHASES.md Phase 1).
 * The pack stays DATA (migrations 008-010); this screen only flips the
 * school's switches: which packs run, which is default, where each class
 * sits on the ladder — and SHOWS the resolver so the adaptivity contract
 * (CURRICULUM-ARCHITECTURE §4) is visible, not believed.
 * Forms follow docs/FORM-STANDARDS.md: one column, labels above inputs,
 * inline validation, no surprises.
 */

export function PackToggles({ packs }: { packs: CurriculumPackRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error ?? "Failed" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card>
      <CardHead title="Curriculum packs" sub="What the school runs. Everything else hides." />
      <div className="flex flex-col divide-y divide-paper-200">
        {packs.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-[220px] flex-1">
              <p className="text-[14px] font-semibold text-ink-950">
                {p.name}
                {p.is_default ? (
                  <span className="ml-2 rounded-pill bg-pine-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pine-800">Default</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-500">
                {p.level_count} {p.level_count === 1 ? "level" : "levels"} · {p.area_count} areas · {p.class_count} {p.class_count === 1 ? "class" : "classes"}
                {p.scheme ? ` · ${p.scheme}` : ""}
              </p>
            </div>
            <Button
              variant={p.enabled ? "ghost" : "secondary"}
              disabled={pending || (p.enabled && p.class_count > 0)}
              title={p.enabled && p.class_count > 0 ? "Move its classes to another pack first" : undefined}
              onClick={() => run(() => setCurriculumPackAction({ code: p.code, enabled: !p.enabled }))}
            >
              {p.enabled ? "Disable" : "Enable"}
            </Button>
            {!p.is_default ? (
              <Button variant="ghost" disabled={pending} onClick={() => run(() => setCurriculumPackAction({ code: p.code, makeDefault: true }))}>
                Make default
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {msg ? (
        <p className={msg.ok ? "mt-2 text-[12.5px] text-pine-700" : "mt-2 text-[12.5px] text-danger"} role="status">
          {msg.text}
        </p>
      ) : null}
    </Card>
  );
}

export function ClassLadder({ data }: { data: CurriculumSetupData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <Card>
      <CardHead title="Class ladder" sub="Every class sits on ONE position of ONE pack's ladder." />
      <div className="flex flex-col divide-y divide-paper-200">
        {data.classes.map((cl) => (
          <div key={cl.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-[14px] font-semibold text-ink-950">{cl.name}</p>
              <p className="mt-0.5 text-[12px] text-ink-500">
                {cl.curriculum_code ? `${cl.curriculum_code.toUpperCase()} · ${cl.level_code ?? "no level"}` : "Not attached to any curriculum"}
              </p>
            </div>
            <LadderSelect
              classId={cl.id}
              current={cl.level_code}
              currentPack={cl.curriculum_code}
              ladder={data.ladder}
              disabled={pending}
              onMove={(levelId) =>
                start(async () => {
                  const r = await attachClassLevelAction({ classId: cl.id, levelId });
                  setMsg(r.ok ? { ok: true, text: `${cl.name} moved` } : { ok: false, text: r.error ?? "Failed" });
                  if (r.ok) router.refresh();
                })
              }
            />
          </div>
        ))}
      </div>
      {msg ? (
        <p className={msg.ok ? "mt-2 text-[12.5px] text-pine-700" : "mt-2 text-[12.5px] text-danger"} role="status">
          {msg.text}
        </p>
      ) : null}
    </Card>
  );
}

function LadderSelect({
  current,
  currentPack,
  ladder,
  disabled,
  onMove,
}: {
  classId: number;
  current: string | null;
  currentPack: string | null;
  ladder: Record<string, { label: string; levels: { id: number; code: string; label: string }[] }>;
  disabled: boolean;
  onMove: (levelId: number) => void;
}) {
  const [pack, setPack] = useState(currentPack ?? "");
  const [levelId, setLevelId] = useState("");
  const opts = pack ? (ladder[pack]?.levels ?? []) : [];
  return (
    <div className="flex items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Pack</span>
        <select
          value={pack}
          onChange={(e) => {
            setPack(e.target.value);
            setLevelId("");
          }}
          className="h-9 min-w-[120px] rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px] text-ink-950"
        >
          <option value="">choose…</option>
          {Object.entries(ladder).map(([code, v]) => (
            <option key={code} value={code}>{v.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">{current ? "Move to" : "Attach"}</span>
        <select
          value={levelId}
          onChange={(e) => setLevelId(e.target.value)}
          disabled={!pack}
          className="h-9 min-w-[120px] rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px] text-ink-950 disabled:opacity-50"
        >
          <option value="">choose…</option>
          {opts.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </label>
      <Button variant="secondary" disabled={disabled || !levelId} onClick={() => onMove(Number(levelId))}>
        Move
      </Button>
    </div>
  );
}

export function ResolverProbe({ classIds }: { classIds: { id: number; name: string }[] }) {
  const [classId, setClassId] = useState<number | "">(classIds[0]?.id ?? "");
  const [ctx, setCtx] = useState<CurriculumContext | null>(null);
  const [loading, setLoading] = useState(false);

  async function probe(id: number) {
    setLoading(true);
    try {
      const r = await getCurriculumContext(id);
      if ("context" in r) setCtx(r.context);
      else setCtx(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHead
        title="The resolver — what every form will see"
        sub="One context per class: vocabulary, grading scale, capability flags, area tree."
      />
      <label className="flex max-w-xs flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Class</span>
        <select
          value={classId}
          onChange={(e) => {
            const v = Number(e.target.value);
            setClassId(v);
            if (v) void probe(v);
          }}
          className="h-9 rounded-sm border border-paper-300 bg-surface px-2.5 text-[13px] text-ink-950"
        >
          {classIds.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      {loading ? <p className="mt-3 text-[12.5px] text-ink-500">Resolving…</p> : null}
      {ctx ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-sm border border-paper-200 bg-paper-50 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Vocabulary</p>
            <ul className="mt-2 space-y-1 text-[13px] text-ink-900">
              <li>{ctx.vocab.learner_label}s study here</li>
              <li>Levels say “{ctx.vocab.level_label}”</li>
              <li>Subjects say “{ctx.vocab.area_label}”</li>
              {ctx.vocab.unit_label ? <li>Units are “{ctx.vocab.unit_label}s”{ctx.vocab.subunit_label ? ` with ${ctx.vocab.subunit_label}s` : ""}</li> : null}
            </ul>
          </div>
          <div className="rounded-sm border border-paper-200 bg-paper-50 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Flags</p>
            <ul className="mt-2 space-y-1 text-[13px] text-ink-900">
              <li>{ctx.flags.has_strands ? "strands/sub-strands picker" : "No: no strands UI"}</li>
              <li>{ctx.flags.has_pathways ? "pathway chooser" : "No: no pathways UI"}</li>
              <li>{ctx.flags.marks_range ? `marks ${ctx.flags.marks_range[0]}–${ctx.flags.marks_range[1]}` : "No: no marks — grade keys only"}</li>
              <li>{ctx.flags.has_coursework ? "coursework/exam split" : "No: single component"}</li>
            </ul>
          </div>
          <div className="rounded-sm border border-paper-200 bg-paper-50 p-3 sm:col-span-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Grading scale · {ctx.scheme_name}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ctx.scale.map((s) => (
                <span key={s.k} className="rounded-pill bg-surface px-2.5 py-1 text-[12px] font-semibold text-ink-900 shadow-1">
                  {s.k}{typeof s.min === "number" ? ` · ${s.min}+` : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-sm border border-paper-200 bg-paper-50 p-3 sm:col-span-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">Areas tree</p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-900">
              {ctx.areas.map((a) => (
                <li key={a.id}>
                  {a.name}
                  {a.pathway ? <span className="ml-1 text-[11px] text-ink-500">({a.pathway})</span> : null}
                  {a.children.length > 0 ? <span className="text-ink-500"> · {a.children.length} strands</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
