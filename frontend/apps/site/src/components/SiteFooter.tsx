import { appLinks } from "@/lib/appLinks";
import Link from "next/link";

/** Footer — the long tail of the sitemap, calm ink on paper. */
export function SiteFooter() {
  return (
    <footer className="border-t border-paper-300 bg-paper-50">
      <div className="mx-auto grid max-w-6xl gap-s6 px-s5 py-s7 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="display text-[17px] text-ink-950">Mandela</p>
          <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-muted">
            The school platform for Kenyan schools. Fees, attendance, messages and operations — one calm place.
          </p>
          <p className="mt-4 font-mono text-[11.5px] uppercase tracking-[0.14em] text-muted">
            Nairobi, Kenya
          </p>
        </div>

        <FooterCol
          title="Product"
          links={[
            { href: "/product", label: "What's inside" },
            { href: "/pricing", label: "Pricing" },
            { href: "/for-schools", label: "For schools" },
            { href: "/for-teachers", label: "For teachers" },
            { href: "/for-parents", label: "For parents" },
          ]}
        />
        <FooterCol
          title="School"
          links={[
            { href: "/about", label: "About us" },
            { href: "/stories", label: "Stories" },
            { href: "/contact", label: "Contact" },
            { href: "/start", label: "Get started" },
          ]}
        />
        <FooterCol
          title="Trust"
          links={[
            { href: "/legal#privacy", label: "Privacy" },
            { href: "/legal#terms", label: "Terms" },
            { href: "/legal#child-data", label: "Learner data" },
            { href: appLinks.login, label: "Sign in" },
          ]}
        />
      </div>
      <div className="border-t border-paper-300">
        <p className="mx-auto max-w-6xl px-s5 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          © {new Date().getFullYear()} Mandela · Learned in a day
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="microlabel">{title}</p>
      <ul className="mt-3 grid gap-2">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="text-[13.5px] text-ink-700 underline-offset-4 hover:text-ink-950 hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
