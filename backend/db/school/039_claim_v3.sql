-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 039: CLAIM v3 (safe adopt + guard escape)
-- Phase 1 (docs/DEV-PHASES.md). Two fixes over 038, learned from E2E:
--   1. "Unclaimed" now means every staff row is still password-less (the
--      provisioner seed state). Seeded rows that already have passwords are
--      a claimed school -> friendly refusal, never a silent takeover.
--   2. The last-active-principal guard (011) is the lockout protector, but
--      it fired when adopting a seed principal into the admin role. A claim
--      on a ONE-staff school cannot lock anyone out, so the guard yields
--      when app.claiming is set (transaction-local, set only by this
--      function) and the school has exactly one staff row.
-- ============================================================================

-- 1. Guard escape for the single-staff claim moment ---------------------------
CREATE OR REPLACE FUNCTION prevent_last_principal_demotion() RETURNS trigger AS $$
BEGIN
  -- Claim adopt: one staff row total, mid-claim (GUC is transaction-local,
  -- set only by app_claim_school). Leadership passes intact to the claimer,
  -- so the lockout concern does not apply.
  IF current_setting('app.claiming', true) = 'on'
     AND (SELECT count(*) FROM staff) = 1 THEN
    RETURN NEW;
  END IF;
  IF (NEW.role <> 'principal' OR NEW.active = false)
     AND (OLD.role = 'principal' AND OLD.active) THEN
    IF (SELECT count(*) FROM staff
        WHERE role = 'principal' AND active AND id <> NEW.id) = 0 THEN
      RAISE EXCEPTION 'cannot demote or deactivate the last active principal';
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 2. Claim, v3 ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_claim_school(
  p_full_name text, p_school_name text, p_email text,
  p_phone text, p_password_hash text, p_also_principal boolean
)
RETURNS TABLE (staff_id uuid, join_code text, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_code text;
  v_seed uuid;
  v_claimed uuid;
BEGIN
  -- A school is claimable only while EVERY staff row is still a
  -- password-less provisioner seed. Any real (passworded) row = claimed.
  SELECT id INTO v_claimed FROM staff
   WHERE NOT (auth_user_id LIKE 'seed_%' AND login_hash IS NULL)
   LIMIT 1;
  IF v_claimed IS NOT NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'School already claimed'::text;
    RETURN;
  END IF;

  SELECT id INTO v_seed FROM staff
   WHERE auth_user_id LIKE 'seed_%' AND login_hash IS NULL
   ORDER BY created_at LIMIT 1;

  -- Transaction-local flag: lets the 011 guard allow this one adopt.
  PERFORM set_config('app.claiming', 'on', true);

  IF v_seed IS NOT NULL THEN
    UPDATE staff
    SET full_name = p_full_name, email = lower(trim(p_email)), phone = p_phone,
        role = 'admin', login_hash = p_password_hash,
        auth_user_id = 'reg_' || gen_random_uuid()::text
    WHERE id = v_seed
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO staff (auth_user_id, full_name, email, phone, role, classes,
                       active, login_hash)
    VALUES ('reg_' || gen_random_uuid()::text, p_full_name, lower(trim(p_email)),
            p_phone, 'admin', '{}', true, p_password_hash)
    RETURNING id INTO v_id;
  END IF;

  PERFORM set_config('app.claiming', 'off', true);

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
                             'also_principal', p_also_principal,
                             'adopted_seed', v_seed IS NOT NULL));

  RETURN QUERY SELECT v_id, v_code, NULL::text;
END;
$$;
