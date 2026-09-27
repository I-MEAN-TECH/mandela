-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 040: CLAIM FIX (ambiguous OUT column)
-- plpgsql OUT parameters (RETURNS TABLE) share the name-space with columns:
-- `RETURNING join_code` inside app_claim_school resolved ambiguously at
-- runtime. Qualify the column with its table. First exercised by the
-- fresh-school claim E2E; the bug existed since 037 (creation succeeded,
-- execution had never run).
-- ============================================================================

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
  RETURNING school_settings.join_code INTO v_code;

  INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
  VALUES (v_id, 'staff', 'school.claimed', 'school_settings', 'default',
          jsonb_build_object('school_name', p_school_name,
                             'also_principal', p_also_principal,
                             'adopted_seed', v_seed IS NOT NULL));

  RETURN QUERY SELECT v_id, v_code, NULL::text;
END;
$$;
