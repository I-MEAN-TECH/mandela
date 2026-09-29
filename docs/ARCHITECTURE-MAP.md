# Mandela architecture map

```mermaid
flowchart TB
  Users["Staff, guardians, school leaders\nBrowsers and installed PWA"]
  Edge["Caddy edge\nTLS, host routing, security headers"]
  Web["Next.js web app\nReact Server Components\nRoute-handler API proxy"]
  API["NestJS API\nZod input validation\nRole checks and audit writes"]
  Control[("PostgreSQL control DB\nSchool registry, domains, join codes")]
  SchoolA[("School DB: mandela_school_a\nRLS policies, school data, audit log")]
  SchoolB[("School DB: mandela_school_b\nRLS policies, school data, audit log")]
  Workers["API workers\nRole-pulse rollups\nTalk delivery outbox"]
  MPesa["Safaricom Daraja\nPayment callbacks"]
  WhatsApp["Meta WhatsApp Cloud API\nGuardian messages"]

  Users -->|HTTPS| Edge
  Edge -->|Public traffic| Web
  Web -->|Internal HTTP\nTenant host + HttpOnly session| API
  API -->|Resolve tenant| Control
  API -->|Tenant-bound RLS session| SchoolA
  API -->|Tenant-bound RLS session| SchoolB
  API <--> Workers
  API <-->|Validated callbacks| MPesa
  Workers -->|Queued delivery| WhatsApp

  style Edge fill:#e8edf4,stroke:#334155,color:#0f172a
  style Web fill:#e8edf4,stroke:#334155,color:#0f172a
  style API fill:#dcefe5,stroke:#166534,color:#052e16
  style Control fill:#fdf2d0,stroke:#a16207,color:#422006
  style SchoolA fill:#fdf2d0,stroke:#a16207,color:#422006
  style SchoolB fill:#fdf2d0,stroke:#a16207,color:#422006
  style Workers fill:#f3e8ff,stroke:#7e22ce,color:#3b0764
```

## Request path

1. Browser reaches Caddy over HTTPS.
2. Caddy forwards public traffic only to Next.js; public direct API hostname returns 404.
3. Next.js proxies data requests to the API with a resolved tenant host and browser session cookie.
4. API resolves tenant in the control database, validates the tenant-bound session, then opens the matching school database.
5. PostgreSQL row-level security limits each request to its permitted rows.
6. API writes audit records and workers process rollups or queued outbound messages.

## Isolation boundary

- Control DB holds platform registry only. It does not hold school operational data.
- Each school has its own database and migration history.
- A session issued for one tenant fails validation for every other tenant.
- RLS is a second boundary inside each school database.

## Deployment shape

```mermaid
flowchart LR
  Internet[Internet] --> Caddy
  subgraph VPS_or_dedicated_school_server["VPS or dedicated school server"]
    Caddy[Caddy :443] --> Web[Web container :3000]
    Web --> API[API container :4000 internal only]
    API --> DB[(Postgres 17 volume)]
  end
```

## Current gaps

- Sessions expire after 12 hours but are not yet server-side revocable.
- Production OTP transport must be completed before guardian OTP login can ship.
