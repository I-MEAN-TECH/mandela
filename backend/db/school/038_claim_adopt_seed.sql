-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 038: CLAIM ADOPTS THE PROVISIONER SEED
-- Phase 1 (docs/DEV-PHASES.md). The provisioner seeds a password-less staff
-- row (auth_user_id LIKE 'seed_%') so the DB verifies healthy. Claiming the
-- school must ADOPT that row (fill name/email/password/admin role) rather
-- than refuse. Replaces app_claim_school from 037 — additive, 037 untouched.
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
  v_any uuid;
BEGIN
  -- Adopt the provisioner seed if present; otherwise only the truly-empty
  -- school may be claimed (fresh DBs provisioned without a seed row).
  SELECT id INTO v_seed FROM staff WHERE auth_user_id LIKE 'seed_%' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_any FROM staff WHERE auth_user_id NOT LIKE 'seed_%' LIMIT 1;

  IF v_any IS NOT NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'School already claimed'::text;
    RETURN;
  END IF;

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
