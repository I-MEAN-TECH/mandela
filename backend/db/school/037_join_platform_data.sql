-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 037: JOIN PLATFORM (code, registration, seeds)
-- Split from 036 because new enum values cannot be USED in the transaction
-- that ADD VALUEs them; the migrator applies each file in its own txn.
-- ============================================================================

-- 1. Join code on the school row (school_settings carries school identity)
-- ---------------------------------------------------------------------------
ALTER TABLE school_settings
  ADD COLUMN IF NOT EXISTS join_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS join_code_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Registration plumbing (public, no session)
-- ---------------------------------------------------------------------------

-- Crockford base32: no I, L, O, U — unambiguous read-aloud codes.
-- 8 chars of 32-symbol entropy (~40 bits) is enough for a school invite.
CREATE OR REPLACE FUNCTION app_generate_join_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'MANDELA-' || string_agg(ch, '')
  FROM (
    SELECT substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
                  floor(random() * 32 + 1)::int, 1) AS ch
    FROM generate_series(1, 8)
  ) t;
$$;

-- Backfill every existing school so Team has something to show on day one.
UPDATE school_settings
SET join_code = app_generate_join_code()
WHERE join_code IS NULL;

-- Registration: create a staff row from a validated join code.
-- Returns NULL-able row: (staff_id, full_name, role). No row = invalid code
-- or duplicate email (message column explains). SECURITY DEFINER, writable
-- only through this narrow function; the audit row lands in the same txn.
CREATE OR REPLACE FUNCTION app_register_staff(
  p_code text, p_full_name text, p_email text,
  p_phone text, p_role text, p_password_hash text
)
RETURNS TABLE (staff_id uuid, full_name text, role text, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school text;
  v_id uuid;
BEGIN
  SELECT join_code INTO v_school FROM school_settings WHERE id = 'default';
  IF v_school IS NULL OR upper(trim(p_code)) <> v_school THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'Unknown school code'::text;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM staff WHERE email = lower(trim(p_email))) THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 'That email is already on the staff roll'::text;
    RETURN;
  END IF;

  INSERT INTO staff (auth_user_id, full_name, email, phone, role, classes,
                     active, login_hash)
  VALUES ('reg_' || gen_random_uuid()::text, p_full_name, lower(trim(p_email)),
          p_phone, p_role::user_role, '{}', true, p_password_hash)
  RETURNING id INTO v_id;

  INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
  VALUES (v_id, 'staff', 'staff.register', 'staff', v_id,
          jsonb_build_object('full_name', p_full_name, 'role', p_role,
                             'via', 'join_code'));

  RETURN QUERY SELECT v_id, p_full_name, p_role, NULL::text;
END;
$$;

-- School self-registration (admin path): sets the school name and returns
-- a fresh join code. Called after the school DB exists (provisioner ran),
-- from a provisioning-authenticated context — guarded by a provisioning
-- token check done at the API layer, not here.
CREATE OR REPLACE FUNCTION app_claim_school(
  p_full_name text, p_school_name text, p_email text,
  p_phone text, p_password_hash text, p_also_principal boolean
)
RETURNS TABLE (staff_id uuid, join_code text, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_code text;
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM staff LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'School already claimed'::text;
    RETURN;
  END IF;

  INSERT INTO staff (auth_user_id, full_name, email, phone, role, classes,
                     active, login_hash)
  VALUES ('reg_' || gen_random_uuid()::text, p_full_name, lower(trim(p_email)),
          p_phone, 'admin', '{}', true, p_password_hash)
  RETURNING id INTO v_id;

  IF p_also_principal THEN
    INSERT INTO staff_duty (staff_id, duty_key, label, appointed_by)
    VALUES (v_id, 'principal', 'Principal', v_id);
  END IF;

  UPDATE school_settings
  SET name = p_school_name, join_code = app_generate_join_code(),
      join_code_updated_at = now()
  WHERE id = 'default'
  RETURNING join_code INTO v_code;

  INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
  VALUES (v_id, 'staff', 'school.claimed', 'school_settings', 'default',
          jsonb_build_object('school_name', p_school_name,
                             'also_principal', p_also_principal));

  RETURN QUERY SELECT v_id, v_code, NULL::text;
END;
$$;

-- Resolve a join code to the school name (code-entry UX shows where you're
-- joining). Definer read, one column, no enumeration surface beyond yes/no.
CREATE OR REPLACE FUNCTION app_school_by_code(p_code text)
RETURNS TABLE (school_name text, error text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN upper(trim(p_code)) = join_code THEN name END,
         CASE WHEN upper(trim(p_code)) = join_code THEN NULL
              ELSE 'Unknown school code'::text END
  FROM school_settings WHERE id = 'default';
$$;

-- ---------------------------------------------------------------------------
-- 3. perm_matrix seeds for the new roles (defaults per PLATFORM-PLAN §5;
--    editable per school in Settings -> Permissions Matrix, as always).
--    Admin/principal keep their 022 seeds untouched.
-- ---------------------------------------------------------------------------
INSERT INTO perm_matrix (module_key, role, owns, sees, landing) VALUES
  -- dorm parent: hostel-first
  ('operations', 'dorm_parent', true,  true,  true ),
  ('people',     'dorm_parent', false, true,  false),
  ('today',      'dorm_parent', false, true,  false),
  -- janitor: facilities-first
  ('operations', 'janitor',     true,  true,  true ),
  ('today',      'janitor',     false, true,  false),
  -- librarian: library-first
  ('operations', 'librarian',   true,  true,  true ),
  ('people',     'librarian',   false, true,  false),
  ('today',      'librarian',   false, true,  false),
  -- patron: sections/houses-first
  ('operations', 'patron',      true,  true,  true ),
  ('people',     'patron',      false, true,  false),
  ('today',      'patron',      false, true,  false),
  -- HOD: academic oversight on a teacher base
  ('academics',  'hod',         true,  true,  true ),
  ('people',     'hod',         false, true,  false),
  ('today',      'hod',         false, true,  false)
ON CONFLICT (module_key, role) DO NOTHING;
