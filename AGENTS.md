# AGENTS.md — Skills Policy (always on)

Every agent working in this repo loads and obeys the skills installed in
`~/.agents/skills/` (global, 42) and `.agents/skills/` (project, 37). Skills are
not optional garnish: **check the relevant SKILL.md before writing code, plans,
copy, or migrations — every task, every time.**

## Skill libraries on this machine

| Library | Location | Size | How to use |
|---|---|---|---|
| Global skills | `~/.agents/skills/` | 42 | installed for all agents |
| Project skills | `.agents/skills/` | 37 | committed to the repo workflow |
| **Antigravity library** | `C:\Users\lewis\Desktop\antigravity-skills-repo\skills\` | **1,462** | curated copy lives in project; pull more with `fs.cpSync(src/<skill>, .agents/skills/<skill>, {recursive:true})` — every skill there has a SKILL.md |

Curated from the library into the project (2026-09-25): expo-api-routes,
expo-cicd-workflows, expo-deployment, expo-dev-client, expo-tailwind-setup,
upgrading-expo, react-native-architecture, nestjs-expert,
postgres-best-practices, postgresql-optimization, progressive-web-app,
whatsapp-cloud-api, payment-integration, saas-multi-tenant, i18n-localization,
schema-markup, seo-technical, web-performance-optimization, k6-load-testing,
zod-validation-expert.

## Always-on core (every task, no exceptions)

| Skill | Why |
|---|---|
| `ponytail` | Lazy-senior-dev efficiency ladder before any code: reuse > stdlib > installed dep > minimal new code. Fix root causes, not symptoms. |
| `caveman` | Terse, substance-only replies; loaded every session and applied whenever the user wants brevity or tokens are burning. |
| `verification-before-completion` | Never claim done without running the gates (typecheck, RLS, browser pass). |
| `planning-with-files` | Any task needing 5+ tool calls: keep the plan on disk, survive context loss. |

## Routing table (pick by task type)

| Task | Skills to load |
|---|---|
| Internet research / URLs / platforms | `agent-reach` (Exa + Jina via mcporter; doctor first for socials) |
| New feature design, UX flows | `brainstorming`, `product-design`, `frontend-design`, `high-end-visual-design` |
| UI implementation (web) | `frontend-developer`, `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `vercel-react-best-practices`, `web-design-guidelines`, `accessibility` |
| Brand website copy / SEO (Phase 2) | `copywriting`, `seo-audit` |
| Next.js / React architecture | `vercel-composition-patterns`, `nextjs-app-router-patterns` |
| Mobile app (Phase 8, Expo RN) | `mobile-design`, `vercel-react-native-skills` + Expo cluster: `expo-dev-client`, `expo-tailwind-setup`, `expo-deployment`, `expo-cicd-workflows`, `expo-api-routes`, `upgrading-expo`, `react-native-architecture` |
| Backend API work (NestJS) | `nodejs-backend-patterns`, `nestjs-expert`, `zod-validation-expert` |
| Database work (migrations, indexes, RLS) | `database-design`, `supabase-postgres-best-practices`, `postgres-best-practices`, `postgresql-optimization` |
| Guardian PWA (Phase 7) | `progressive-web-app`, `web-performance-optimization` |
| WhatsApp/messaging & money flows | `whatsapp-cloud-api`, `payment-integration` |
| Multi-tenancy & auth design | `saas-multi-tenant`, `security-auditor` |
| Site i18n (EN/SW) & SEO schema | `i18n-localization`, `schema-markup`, `seo-technical` |
| Auth, permissions, security review | `security-auditor`, `requesting-code-review` |
| Performance work (Phases 9, budgets) | `performance-engineer`, `performance`, `k6-load-testing` |
| Tests / debugging | `tdd`, `test-driven-development`, `systematic-debugging` |
| Plans & specs | `writing-plans`, `executing-plans` (dev queue: `docs/DEV-PHASES.md`) |
| Design-system extraction / image-to-code | `extract-design-system`, `image-to-code` |
| Extending the agent itself | `skill-creator`, `mcp-builder`, `find-skills` (install new skills with `npx skills add <pkg> -y`) |
| Redesigning existing screens | `redesign-existing-projects` |
| Video (🔮 future marketing) | `remotion-best-practices` |

## Rules

1. **SKILL.md is law** for how work is done; project docs
   (`docs/SIMPLICITY.md`, `docs/PLATFORM-PLAN.md`, `docs/DEV-PHASES.md`) are law
   for what is built. Where they conflict, project docs win and the conflict is
   flagged to the user.
2. When several skills match, load them all — they compose (e.g. `ponytail` +
   `database-design` + `supabase-postgres-best-practices` for a migration task).
3. Nothing gets built that isn't a line in `docs/DEV-PHASES.md` (or the line is
   added first).
4. Missing a skill for a recurring need? Two sources: `find-skills`
   (`npx skills add <pkg> -y`) or browse the **Antigravity library**
   (`C:\Users\lewis\Desktop\antigravity-skills-repo\skills\`, 1,462 skills —
   list the dir, pick by name, copy into `.agents/skills/`). Then record it in
   this file's routing table.
5. `theme never changes`: all UI work uses `@mandela/ui` tokens/components only.
