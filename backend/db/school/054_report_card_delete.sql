-- 054: report_card DELETE for draft cancellation.
-- 022 gave report_card SELECT/INSERT/UPDATE policies but no DELETE, so the
-- draft-cancel flow (mandatory typed reason, audited) silently matched zero
-- rows under RLS. Drafts carry no official weight; leaders (admin/principal)
-- and a teacher's own generated drafts may be removed. The app layer already
-- refuses anything but state='draft' and demands the reason — this is the
-- database floor for the same rule.

DROP POLICY IF EXISTS rc_leader_del ON report_card;
CREATE POLICY rc_leader_del ON report_card
  FOR DELETE
  USING (
    current_setting('app.role', true) IN ('admin', 'principal')
    OR (
      current_setting('app.role', true) = 'teacher'
      AND generated_by::text = current_setting('app.staff_id', true)
    )
  );
