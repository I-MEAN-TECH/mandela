-- ============================================================================
-- MANDELA — SCHOOL DB MIGRATION 041: ONBOARDING & LANDING (Phase 3)
--   1) staff.joined      — "has this person seen their start screen yet?"
--                          Drives the post-login interstitial (/app/start).
--   2) landing hardening — principal had two landing seeds (022); the resolver
--                          picks deterministically, SQL keeps data as data.
--   3) guardian link code— one-time code handed out at admission; the guardian
--                          enters it after OTP login to see their child.
--   4) welcome message   — admission enqueues a WhatsApp via the talk worker
--                          (message row, state 'queued', dedupe-keyed).
-- Register-staff adopts the provisioner's password-less seed row when one
-- exists (joiners keep the seed's admission history instead of dup rows).
-- ============================================================================

-- 1) staff.joined ------------------------------------------------------------
ALTER TABLE staff ADD COLUMN IF NOT EXISTS joined boolean NOT NULL DEFAULT false;

-- Everyone with a password has already been through a start moment (claim or
-- seeded desk) — they must not see the interstitial after this migration.
UPDATE staff SET joined = true
WHERE joined = false AND login_hash IS NOT NULL;

-- 2) One landing per role: 022 seeded principal landing on both 'today' and
--    'people'; keep the data but make resolution deterministic in code.
--    (No SQL change needed — documented constraint: exactly one landing row
--    per role; setPermCell already enforces it going forward.)

-- 3) Guardian link code -------------------------------------------------------
ALTER TABLE guardian
  ADD COLUMN IF NOT EXISTS link_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS link_code_issued_at timestamptz;

-- Same Crockford alphabet as the join code (no I/L/O/U), shorter: a guardian
-- types this once, off a slip from the school office.
CREATE OR REPLACE FUNCTION app_generate_link_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'ML-' || string_agg(ch, '')
  FROM (
    SELECT substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
                  floor(random() * 32 + 1)::int, 1) AS ch
    FROM generate_series(1, 8)
  ) t;
$$;

-- 4) Registration adopts the password-less seed row ----------------------------
-- Joining staff: if the provisioner seeded a placeholder row, the joiner
-- BECOMES it (keeps ids/audit trail coherent) instead of adding a duplicate.
-- joined stays FALSE: the first /app visit shows the confirm-role interstitial
-- (spec §4.2), then perm_matrix.landing takes over. Only the claiming admin
-- (who named the school) lands directly.
CREATE OR REPLACE FUNCTION app_register_staff(
  p_code text, p_full_name text, p_email text,
  p_phone text, p_role text, p_password_hash text
)
RETURNS TABLE (staff_id uuid, full_name text, role text, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school text;
  v_id uuid;
  v_seed uuid;
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

  SELECT id INTO v_seed FROM staff
   WHERE auth_user_id LIKE 'seed_%' AND login_hash IS NULL
   ORDER BY created_at LIMIT 1;

  IF v_seed IS NOT NULL THEN
    UPDATE staff
    SET full_name = p_full_name, email = lower(trim(p_email)), phone = p_phone,
        role = p_role::user_role, login_hash = p_password_hash, joined = false,
        auth_user_id = 'reg_' || gen_random_uuid()::text
    WHERE id = v_seed
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO staff (auth_user_id, full_name, email, phone, role, classes,
                       active, login_hash, joined)
    VALUES ('reg_' || gen_random_uuid()::text, p_full_name, lower(trim(p_email)),
            p_phone, p_role::user_role, '{}', true, p_password_hash, false)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
  VALUES (v_id, 'staff', 'staff.register', 'staff', v_id,
          jsonb_build_object('full_name', p_full_name, 'role', p_role,
                             'via', 'join_code',
                             'adopted_seed', v_seed IS NOT NULL));

  RETURN QUERY SELECT v_id, p_full_name, p_role, NULL::text;
END;
$$;

-- Claiming admin: joined = true (they land straight on the Pulse).
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

  PERFORM set_config('app.claiming', 'on', true);

  IF v_seed IS NOT NULL THEN
    UPDATE staff
    SET full_name = p_full_name, email = lower(trim(p_email)), phone = p_phone,
        role = 'admin', login_hash = p_password_hash, joined = true,
        auth_user_id = 'reg_' || gen_random_uuid()::text
    WHERE id = v_seed
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO staff (auth_user_id, full_name, email, phone, role, classes,
                       active, login_hash, joined)
    VALUES ('reg_' || gen_random_uuid()::text, p_full_name, lower(trim(p_email)),
            p_phone, 'admin', '{}', true, p_password_hash, true)
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

-- 5) Admission with a guardian link code + welcome WhatsApp --------------------
-- One definer call does the whole front-desk moment: learner (adopt-or-create),
-- guardian (adopt-or-create), learner_guardian link, one-time link code on the
-- guardian, and the welcome message queued for the talk worker. Leaders only —
-- the API layer enforces the staff session; this function still re-checks.
CREATE OR REPLACE FUNCTION app_admit_learner(
  p_actor uuid,
  p_first text, p_middle text, p_last text,
  p_dob text, p_gender text, p_class_id int, p_boarding boolean,
  p_guardian_name text, p_guardian_phone text, p_guardian_email text,
  p_app_origin text
)
RETURNS TABLE (learner_id uuid, admission_no text, guardian_id uuid,
               link_code text, error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_role text;
  v_adm text;
  v_learner uuid;
  v_guardian uuid;
  v_code text;
  v_school text;
  v_welcome_body text;
BEGIN
  SELECT role::text INTO v_actor_role FROM staff WHERE id = p_actor AND active;
  IF v_actor_role NOT IN ('admin', 'principal') THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, NULL::text,
                        'Only the admin or principal admit learners'::text;
    RETURN;
  END IF;

  IF p_guardian_phone !~ '^(0|\+?254)?[17][0-9]{8}$' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, NULL::text,
                        'Enter a valid Kenyan guardian phone number'::text;
    RETURN;
  END IF;

  -- Learner: adopt the provisioner seed row when it is still unclaimed.
  DECLARE
    v_seed_learner uuid;
  BEGIN
    SELECT id INTO v_seed_learner FROM learner
     WHERE first_name = 'Seed' AND last_name = 'Learner' AND status = 'active'
     ORDER BY created_at LIMIT 1;

    IF v_seed_learner IS NOT NULL THEN
      UPDATE learner
      SET first_name = p_first, middle_name = p_middle, last_name = p_last,
          date_of_birth = p_dob::date, gender = left(p_gender,1),
          class_id = COALESCE(p_class_id, class_id), boarding = p_boarding
      WHERE id = v_seed_learner
      RETURNING id, learner.admission_no INTO v_learner, v_adm;
    ELSE
      SELECT 'ADM-' || lpad((coalesce(max(nullif(regexp_replace(learner.admission_no, '\D', '', 'g'), '')::bigint), 0::bigint) + 1)::text, 3, '0')
        INTO v_adm FROM learner;
      INSERT INTO learner (admission_no, first_name, middle_name, last_name,
                           gender, date_of_birth, class_id, boarding, status)
      VALUES (v_adm, p_first, p_middle, p_last, left(p_gender,1),
              p_dob::date, p_class_id, p_boarding, 'active')
      RETURNING id INTO v_learner;
    END IF;
  END;

  -- Guardian: adopt by phone (sibling's parent) or create.
  DECLARE
    v_norm text := CASE
      WHEN p_guardian_phone LIKE '+254%' THEN substring(p_guardian_phone from 4)
      WHEN p_guardian_phone LIKE '254%'  THEN substring(p_guardian_phone from 4)
      WHEN p_guardian_phone LIKE '0%'    THEN '254' || substring(p_guardian_phone from 2)
      ELSE '254' || p_guardian_phone END;
    v_existing uuid;
  BEGIN
    SELECT id INTO v_existing FROM guardian WHERE phone = v_norm AND active LIMIT 1;
    IF v_existing IS NOT NULL THEN
      v_guardian := v_existing;
    ELSE
      INSERT INTO guardian (full_name, phone, email, relationship, is_primary, wa_opt_in)
      VALUES (p_guardian_name, v_norm, p_guardian_email, 'guardian', true, true)
      RETURNING id INTO v_guardian;
    END IF;

    INSERT INTO learner_guardian (learner_id, guardian_id, relationship, is_primary)
    VALUES (v_learner, v_guardian, 'guardian',
            NOT EXISTS (SELECT 1 FROM learner_guardian WHERE learner_guardian.learner_id = v_learner))
    ON CONFLICT DO NOTHING;

    -- One-time link code: mint if the guardian has none (reused per guardian,
    -- stays valid until used — the office slips it with the admission pack).
    -- NOTE: OUT-parameter names (link_code, admission_no, …) collide with
    -- column names inside plpgsql — ALWAYS qualify with the table name (040).
    IF (SELECT guardian.link_code FROM guardian WHERE guardian.id = v_guardian) IS NULL THEN
      LOOP
        v_code := app_generate_link_code();
        BEGIN
          UPDATE guardian SET link_code = v_code, link_code_issued_at = now()
          WHERE guardian.id = v_guardian AND guardian.link_code IS NULL;
          EXIT WHEN FOUND;
          -- lost the race on this code: loop for another
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END LOOP;
    ELSE
      SELECT guardian.link_code INTO v_code FROM guardian WHERE guardian.id = v_guardian;
    END IF;
  END;

  -- Welcome WhatsApp — queued; the talk worker sends it (message.kind 'welcome').
  -- Carries the sign-in/install link (PWA) + the family link code.
  SELECT name INTO v_school FROM school_settings WHERE id = 'default';
  v_welcome_body := 'Karibu to ' || COALESCE(v_school, 'school') || ' — ' ||
                    p_first || ' ' || p_last || ' is on the roll. ' ||
                    'Open ' || COALESCE(p_app_origin, '') || '/login on your phone to see fees, homework and updates (Add to Home Screen to install). ' ||
                    'Your family link code: ' || v_code;

  INSERT INTO message (guardian_id, learner_id, channel, kind, state, body, dedupe_key)
  VALUES (v_guardian, v_learner, 'whatsapp', 'welcome', 'queued', v_welcome_body,
          'welcome:' || v_guardian || ':' || v_learner)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  INSERT INTO audit_log (actor_id, actor_kind, action, entity, entity_id, after)
  VALUES (p_actor, 'staff', 'learner.admitted', 'learner', v_learner::text,
          jsonb_build_object('admission_no', v_adm, 'guardian_id', v_guardian,
                             'link_code_issued', (SELECT guardian.link_code IS NOT NULL FROM guardian WHERE guardian.id = v_guardian),
                             'welcome_queued', true));

  RETURN QUERY SELECT v_learner, v_adm, v_guardian, v_code, NULL::text;
END;
$$;
