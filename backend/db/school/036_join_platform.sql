-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 036: JOIN PLATFORM (new roles)
-- Phase 1 of docs/DEV-PHASES.md. user_role grows the staff lattice:
-- dorm_parent, janitor, librarian, patron, hod — TSC-style hats that are
-- also first-class roles (PLATFORM-PLAN §5). Enum ALTERs must own their
-- transaction: new values cannot be USED in the same txn that adds them,
-- so join code/registration/seeds live in 037.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. New roles (enum ALTER TYPE cannot run inside a transaction block with
--    other catalog changes; the migrator wraps files, so keep it clean here).
-- ---------------------------------------------------------------------------
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dorm_parent';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'janitor';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'librarian';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'patron';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'hod';

-- ---------------------------------------------------------------------------

