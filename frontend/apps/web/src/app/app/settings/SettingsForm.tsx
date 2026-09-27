"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHead } from "@mandela/ui";
import type { SettingsData } from "@/lib/api";

/**
 * SettingsForm — edits school_settings via the server action. Tagline
 * lines map to the landing hero (line 1 normal, line 2 italic); modules
 * map to the bento. Saving refreshes every RSC surface.
 */
export function SettingsForm({
  settings,
  canEdit,
  heroLines,
}: {
  settings: SettingsData;
  canEdit: boolean;
  heroLines: string[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [name, setName] = useState(settings.name);
  const [hero1, setHero1] = useState(heroLines[0] ?? "");
  const [hero2, setHero2] = useState(heroLines[1] ?? "");
  const [motto, setMotto] = useState(settings.motto ?? "");
  const [phone, setPhone] = useState(settings.contact_phone ?? "");
  const [email, setEmail] = useState(settings.contact_email ?? "");
  const [address, setAddress] = useState(settings.contact_address ?? "");
  const [quote, setQuote] = useState(settings.quote_text ?? "");
  const [quoteAuthor, setQuoteAuthor] = useState(settings.quote_author ?? "");
  const [modules, setModules] = useState(settings.modules.map((m) => ({ ...m })));

  const inputCls =
    "mt-1.5 h-12 w-full rounded-sm border border-border bg-surface px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-paper-100 disabled:text-muted";
  const labelCls = "block text-[13px] font-semibold";

  function save() {
    start(async () => {
      const { updateSettingsAction } = await import("@/lib/api");
      const res = await updateSettingsAction({
        name,
        tagline: [hero1, hero2].filter(Boolean).join("\n"),
        motto: motto || null,
        contact_phone: phone || null,
        contact_email: email || null,
        contact_address: address || null,
        quote_text: quote || null,
        quote_author: quoteAuthor || null,
        modules: modules.filter((m) => m.title && m.body),
      });
      if (res.ok) {
        setMsg("Saved — every screen updates — done");
        router.refresh();
      } else {
        setMsg(res.error ?? "Failed to save");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-s3h lg:grid-cols-2"
    >
      <Card>
        <CardHead title="Identity" sub="Name shown everywhere, the sidebar, the login half" />
        <div className="grid gap-s3h">
          <label className={labelCls}>
            School name
            <input value={name} onChange={(e) => setName(e.target.value)} required disabled={!canEdit} className={inputCls} />
          </label>
          <label className={labelCls}>
            Motto
            <input value={motto} onChange={(e) => setMotto(e.target.value)} disabled={!canEdit} className={inputCls} />
          </label>
        </div>
      </Card>

      <Card>
        <CardHead title="Landing hero" sub="Line 1 is normal, line 2 renders italic serif" />
        <div className="grid gap-s3h">
          <label className={labelCls}>
            Line 1
            <input value={hero1} onChange={(e) => setHero1(e.target.value)} disabled={!canEdit} className={inputCls} />
          </label>
          <label className={labelCls}>
            Line 2 (italic)
            <input value={hero2} onChange={(e) => setHero2(e.target.value)} disabled={!canEdit} className={inputCls} />
          </label>
        </div>
      </Card>

      <Card>
        <CardHead title="Contacts" sub="Footer + login surfaces" />
        <div className="grid gap-s3h">
          <label className={labelCls}>
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canEdit} className={inputCls} />
          </label>
          <label className={labelCls}>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEdit} className={inputCls} />
          </label>
          <label className={labelCls}>
            Address
            <input value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canEdit} className={inputCls} />
          </label>
        </div>
      </Card>

      <Card>
        <CardHead title="Quote band" sub="The ink band on the landing — school-chosen words" />
        <div className="grid gap-s3h">
          <label className={labelCls}>
            Quote
            <textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              rows={3}
              disabled={!canEdit}
              className="mt-1.5 w-full rounded-sm border border-border bg-surface px-3.5 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-paper-100 disabled:text-muted"
            />
          </label>
          <label className={labelCls}>
            Author
            <input value={quoteAuthor} onChange={(e) => setQuoteAuthor(e.target.value)} disabled={!canEdit} className={inputCls} />
          </label>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHead title="Module cards" sub="The landing bento — five cards, each title + body" />
        <div className="grid gap-s3 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m, i) => (
            <div key={i} className="grid gap-2 rounded-sm border border-paper-200 p-s3">
              <span className="font-mono text-[11px] text-ink-400">{String(i + 1).padStart(2, "0")}</span>
              <label className="block text-xs font-semibold text-muted">
                Card title
                <input
                  value={m.title}
                  onChange={(e) => setModules((arr) => arr.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  disabled={!canEdit}
                  className="mt-1 h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-paper-100"
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Card body
                <textarea
                  value={m.body}
                  onChange={(e) => setModules((arr) => arr.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                  rows={2}
                  disabled={!canEdit}
                  className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-paper-100"
                />
              </label>
            </div>
          ))}
        </div>
      </Card>

      {canEdit ? (
        <div className="flex items-center gap-s3 lg:col-span-2">
          <Button variant="primary" size="lg" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save school settings"}
          </Button>
          {msg ? (
            <span className={`text-sm font-semibold ${msg.endsWith(" — done") ? "text-ok" : "text-danger"}`} role="status">
              {msg}
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
