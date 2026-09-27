/**
 * i18n skeleton (DEV-PHASES Phase 2): English first, Kiswahili ready.
 * Pattern per the i18n skill: plain dictionaries, no runtime dependency.
 * The site's launch set ships EN-only copy; SW keys here cover the shared
 * chrome (nav, doors, parent CTA) so the toggle works the moment SW strings
 * land. Anything missing falls back to English — never a raw key.
 */

export type Lang = "en" | "sw";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "sw", label: "SW" },
];

type Dict = Record<string, string>;

const en: Dict = {
  "nav.product": "Product",
  "nav.schools": "Schools",
  "nav.pricing": "Pricing",
  "nav.stories": "Stories",
  "nav.about": "About",
  "nav.signin": "Sign in",
  "nav.start": "Get started",
  "nav.menu": "Menu",

  "door.staff.title": "I work at a school",
  "door.staff.body": "Join with your school's code",
  "door.school.title": "I run a school",
  "door.school.body": "Set up the school and invite your staff",

  "parent.label": "Parents",
  "parent.phone": "Your phone number",
  "parent.cta": "Get my code",
  "parent.sending": "Sending…",
  "parent.sent.title": "Check your phone",
  "parent.sent.body": "We sent a login code to {phone}. Enter it on the next screen to see your children's balances, homework and attendance.",
  "parent.error": "Could not send right now — the school can also help you from the office.",
  "parent.hint": "Your children appear automatically — the school links them. No password to remember.",

  "hero.title1": "Run the school.",
  "hero.title2": "See everything.",
  "footer.tagline": "Learned in a day",
};

const sw: Dict = {
  "nav.product": "Bidhaa",
  "nav.schools": "Shule",
  "nav.pricing": "Bei",
  "nav.stories": "Hadithi",
  "nav.about": "Kutuhusu",
  "nav.signin": "Ingia",
  "nav.start": "Anza",
  "nav.menu": "Menyu",

  "door.staff.title": "Ninafanya kazi shuleni",
  "door.staff.body": "Jiunge kwa msimbo wa shule yako",
  "door.school.title": "Naendesha shule",
  "door.school.body": "Anzisha shule ukaruhusu wafanyakazi wako",

  "parent.label": "Wazazi",
  "parent.phone": "Namba ya simu yako",
  "parent.cta": "Nipe msimbo",
  "parent.sending": "Inatuma…",
  "parent.sent.title": "Angalia simu yako",
  "parent.sent.body": "Tumetuma msimbo wa kuingia kwa {phone}. Ukiuingiza, utaona salio, kazi za nyumbani na mahudhurio ya watoto wako.",
  "parent.error": "Haiwezi kutuma kwa sasa — ofisi ya shule inaweza kukusaidia.",
  "parent.hint": "Watoto wako huonekana wenyewe — shule inawaunganisha. Hakuna nenosiri la kukumbuka.",

  "hero.title1": "Endesha shule.",
  "hero.title2": "Uone kila kitu.",
  "footer.tagline": "Hujifunza kwa siku moja",
};

const DICTS: Record<Lang, Dict> = { en, sw };

/** Translate: falls back to English, then to the key itself. */
export function t(lang: Lang, key: string, vars?: Record<string, string>): string {
  const raw = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
  if (!vars) return raw;
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, v), raw);
}

const STORAGE_KEY = "mandela_site_lang";

export function getStoredLang(): Lang {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "sw" ? "sw" : "en";
}

export function storeLang(lang: Lang): void {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, lang);
}
