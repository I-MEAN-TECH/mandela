# Run doc — Mandela dev stack (preview)

This workspace is the main checkout (`C:\Users\lewis\Desktop\mandela`), so there are
no env files or node_modules to reproduce from elsewhere — deps are installed
(pnpm workspace) and `.env`-style values live in `backend/apps/api/src/config.ts`
(embedded PG on `127.0.0.1:54329`, user `mandela`, db `mandela_demo`).

## 1. Reproduce the build artifacts

- `pnpm install` at the repo root (pnpm workspace; nothing else needed).
- **Migrations are NOT applied at API boot.** After pulling new files under
  `backend/db/school/`, run:
  ```
  pnpm --filter @mandela/api migrate
  ```
  (idempotent; tracks applied files in `_mandela_migrations`.)
- Optional gates: `pnpm --filter @mandela/api typecheck && pnpm --filter @mandela/web typecheck`
  and `pnpm --filter @mandela/api test:rls`.

## 2. Run the servers

1. **API first** (it starts the embedded Postgres on port 54329 and listens on 4000):
   ```
   powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory 'C:\Users\lewis\Desktop\mandela\backend\apps\api' -RedirectStandardOutput 'C:\Users\lewis\Desktop\mandela\.freebuff\api.log' -RedirectStandardError 'C:\Users\lewis\Desktop\mandela\.freebuff\api.err.log' -WindowStyle Hidden -PassThru).Id"
   ```
   (The command "times out" in the terminal but the process detaches — verify with
   `netstat -ano | findstr :4000`.)
2. **Web** (Next.js on 3000):
   ```
   powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -WorkingDirectory 'C:\Users\lewis\Desktop\mandela\frontend\apps\web' -RedirectStandardOutput 'C:\Users\lewis\Desktop\mandela\.freebuff\web.log' -RedirectStandardError 'C:\Users\lewis\Desktop\mandela\.freebuff\web.err.log' -WindowStyle Hidden -PassThru).Id"
   ```
3. Wait for `GET / 200` in `web.log`, then register the preview with
   `url: http://localhost:3000/` and the web pid from netstat.

Demo login for the admin surface: `admin@demo.mandela.school` (shown on the login page).
