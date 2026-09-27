-- 031_hardening_auth_rails.sql - hardening slice (owner push 2026-09-24).
-- ASCII only (embedded Postgres runs client_encoding WIN1252).
--
--   1. STAFF PASSWORDS: staff.login_hash holds a scrypt digest in the
--      format "scrypt$<salt-hex>$<hash-hex>" (N=16384, r=8, p=1, 64-byte
--      key). Password auth REPLACES email-match; demo emails keep working
--      in dev only - seed:demo re-run grants each demo staff the password
--      "demo" (CHANGE BEFORE REAL SCHOOLS).
--   2. login_throttle: per (ip + email) failure counter with a 15-minute
--      window, enforced API-side before any password check.
--   3. PROVIDER FIELDS on message: provider message id + last error, so
--      the Talk worker can record real WhatsApp delivery attempts and
--      failures. Signature verification and replay defense for the Daraja
--      C2B callback are implemented API-side (no DDL needed - the UNIQUE
--      constraints on mpesa_txn already give callback idempotency).
-- ============================================================================

-- 1. staff password digest ----------------------------------------------------
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS login_hash text;

-- 2. login throttle -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_throttle (
  key          text PRIMARY KEY,          -- ip + '|' + lower(email)
  fails        int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

-- 3. provider fields on message ---------------------------------------------------
ALTER TABLE message
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS provider_note text;

ANALYZE staff;

-- 4. the pre-session login helper must surface the digest. The 007 version
--    returns (id, full_name, role); widen it (drop + recreate is required
--    when the return shape changes). Callers selecting fewer columns are
--    unaffected; RLS-bypass semantics stay exactly as before.
DROP FUNCTION IF EXISTS app_login_staff(text);
CREATE FUNCTION app_login_staff(p_email text)
RETURNS TABLE (id uuid, full_name text, role text, login_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.full_name, s.role::text, s.login_hash
  FROM staff s WHERE s.email = p_email AND s.active = true
  LIMIT 1
$$;
