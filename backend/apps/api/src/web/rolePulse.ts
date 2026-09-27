import { withSession, latestStaffNotice, type Principal } from "./queries.js";

/**
 * RolePulse — Phase 5 (docs/DEV-PHASES.md): teacher, bursar, principal,
 * counter, driver each get their "Today" (PLATFORM-PLAN §6.2–6.6). One query
 * block per role, same shape discipline as adminPulse: numbers + LIMIT-capped
 * lists only, every read inside the session's RLS context.
 *
 * Teacher (§6.3) is the activation role: the state drives "Today IS the mark
 * screen" on first run. Driver (§6.6) is text-first: a route strip of stops
 * with states, no chart.
 */

export interface TeacherPulse {
  staff_notice: { title: string; body: string; urgency: string; created_at: string } | null;
  role: "teacher";
  class_id: number | null;
  class_name: string | null;
  marked_today: boolean;
  present: number;
  expected: number;
  homework_due_week: number;
  unmarked_assessments: number;
  messages_today: number;
  slots_today: { period: number; starts_at: string | null; area_name: string | null }[];
  duty_today: string[];
  heatmap: { learner_id: string; name: string; marks: (string | null)[] }[];
  days: string[];
}

/** Teacher reads on an existing session client — shared by teacherPulse + hodPulse. */
async function teacherPulseInner(
  c: Parameters<Parameters<typeof withSession>[2]>[0],
  principal: Extract<Principal, { kind: "staff" }>,
  dbName: string,
): Promise<TeacherPulse> {
  const notice = await latestStaffNotice(c);
    // The teacher's class: the timetable's most frequent class_id, else the
    // provisioner's Demo A. Kept deterministic so the strip is stable.
    const mine = await c.query<{ class_id: number; name: string }>(
      `SELECT ts.class_id, c.name
       FROM timetable_slot ts JOIN class c ON c.id = ts.class_id
       WHERE ts.teacher_id = $1
       GROUP BY ts.class_id, c.name
       ORDER BY COUNT(*) DESC LIMIT 1`,
      [principal.userId],
    );
    const classId = mine.rows[0]?.class_id ?? (await c.query<{ id: number }>(`SELECT id FROM class ORDER BY id LIMIT 1`)).rows[0]?.id;

    const att = classId
      ? await c.query<{ present: string; expected: string }>(
          `SELECT COUNT(*) FILTER (WHERE a.mark = 'present')::text AS present,
                  (SELECT COUNT(*) FROM learner WHERE status = 'active' AND class_id = $1)::text AS expected
           FROM attendance a JOIN learner l ON l.id = a.learner_id
           WHERE a.day = CURRENT_DATE AND l.class_id = $1`,
          [classId],
        )
      : { rows: [{ present: "0", expected: "0" }] };
    const present = Number(att.rows[0]?.present ?? 0);
    const expected = Number(att.rows[0]?.expected ?? 0);
    const markedToday = expected > 0 &&
      (await c.query(
        `SELECT 1 FROM attendance a JOIN learner l ON l.id = a.learner_id
         WHERE a.day = CURRENT_DATE AND l.class_id = $1 LIMIT 1`,
        [classId],
      )).rowCount! > 0;

    const homework = classId
      ? await c.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM homework
           WHERE class_id = $1 AND due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 6`,
          [classId],
        )
      : { rows: [{ n: "0" }] };
    const assessments = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM assessment
       WHERE recorded_by = $1 AND term_id = (SELECT id FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)`,
      [principal.userId],
    );
    // "Messages unread" (§6.3) has no read-state model yet — the honest
    // signal is WhatsApp volume to my class's guardians today.
    const unread = classId
      ? await c.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM message m
           JOIN learner l ON l.id = m.learner_id
           WHERE l.class_id = $1 AND m.created_at::date = CURRENT_DATE`,
          [classId],
        )
      : { rows: [{ n: "0" }] };

    const slots = classId
      ? await c.query<{ period: number; starts_at: string | null; area_name: string | null }>(
          `SELECT period, starts_at, area_name FROM timetable_slot
           WHERE class_id = $1 AND day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE)
           ORDER BY period LIMIT 9`,
          [classId],
        )
      : { rows: [] };

    const duty = await c.query<{ duty: string }>(
      `SELECT duty FROM duty_roster WHERE staff_id = $1 AND weekday = EXTRACT(DOW FROM CURRENT_DATE) LIMIT 3`,
      [principal.userId],
    );

    // Weekday heatmap (§6.3): my class, last 10 marked days, rows = learners.
    const days = await c.query<{ d: string }>(
      `SELECT a.day::text AS d FROM attendance a JOIN learner l ON l.id = a.learner_id
       WHERE l.class_id = $1 GROUP BY a.day ORDER BY a.day DESC LIMIT 10`,
      [classId],
    );
    const dayList = days.rows.map((r) => r.d).reverse();
    const grid = classId
      ? await c.query<{ learner_id: string; name: string; day: string; mark: string | null }>(
          `SELECT l.id AS learner_id, l.first_name || ' ' || l.last_name AS name,
                  a.day::text AS day, a.mark::text AS mark
           FROM learner l
           LEFT JOIN attendance a ON a.learner_id = l.id AND a.day::text = ANY($2)
           WHERE l.class_id = $1 AND l.status = 'active'
           ORDER BY name LIMIT 60`,
          [classId, dayList.length ? dayList : ["__none__"]],
        )
      : { rows: [] };
    const byLearner = new Map<string, { name: string; marks: Map<string, string> }>();
    for (const r of grid.rows) {
      if (!byLearner.has(r.learner_id)) byLearner.set(r.learner_id, { name: r.name, marks: new Map() });
      if (r.mark) byLearner.get(r.learner_id)!.marks.set(r.day, r.mark);
    }
    const heatmap = [...byLearner.entries()].slice(0, 40).map(([learner_id, v]) => ({
      learner_id,
      name: v.name,
      marks: dayList.map((d) => v.marks.get(d) ?? null),
    }));

    return {
      staff_notice: notice,
      role: "teacher",
      class_id: classId ?? null,
      class_name: mine.rows[0]?.name ?? null,
      marked_today: markedToday,
      present,
      expected,
      homework_due_week: Number(homework.rows[0]?.n ?? 0),
      unmarked_assessments: Number(assessments.rows[0]?.n ?? 0),
      messages_today: Number(unread.rows[0]?.n ?? 0),
      slots_today: slots.rows,
      duty_today: duty.rows.map((d) => d.duty),
      heatmap,
      days: dayList,
    };
}

export async function teacherPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<TeacherPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, (c) => teacherPulseInner(c, principal, dbName));
}

export interface BursarPulse {
  staff_notice: { title: string; body: string; urgency: string; created_at: string } | null;
  role: "bursar";
  collected_today_cents: string;
  collected_term_cents: string;
  billed_term_cents: string;
  pending_confirmations: number;
  top_arrears_class: { class: string; arrears_cents: string } | null;
  confirmations: { receipt_no: string; learner: string; amount_cents: string; method: string; paid_at: string }[];
  rails_suggestions: { payer_name: string | null; amount_cents: string; source: string }[];
  arrears: { learner: string; class: string; balance_cents: string }[];
  week: { day: string; collected_cents: string }[];
}

export async function bursarPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<BursarPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const notice = await latestStaffNotice(c);
    const collectedToday = await c.query<{ n: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS n FROM payments WHERE state = 'confirmed' AND paid_at::date = CURRENT_DATE`,
    );
    // C10 — term-scoped: only confirmed payments inside the current term.
    const term = await c.query<{ collected: string; billed: string }>(
      `SELECT COALESCE((SELECT SUM(p.amount) FROM payments p
                        WHERE p.state = 'confirmed'
                          AND p.paid_at >= (SELECT starts_on FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)
                          AND p.paid_at <= (SELECT ends_on   FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)), 0)::text AS collected,
              COALESCE(SUM(fi.amount) FILTER (WHERE fi.is_optional = false), 0)::text AS billed
       FROM fee_item fi`,
    );
    const pending = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM payments WHERE state = 'pending'`,
    );
    const confirmations = await c.query<{
      receipt_no: string; learner: string; amount_cents: string; method: string; paid_at: string;
    }>(
      `SELECT p.receipt_no, l.first_name || ' ' || l.last_name AS learner,
              p.amount::text AS amount_cents, p.method::text AS method, p.paid_at::text
       FROM payments p JOIN learner l ON l.id = p.learner_id
       WHERE p.state = 'pending' ORDER BY p.paid_at ASC LIMIT 6`,
    );
    const rails = await c.query<{ payer_name: string | null; amount_cents: string; source: string }>(
      `SELECT m.payer_name, m.amount_cents::text, m.source FROM rails_match m
       WHERE m.state = 'suggested' ORDER BY m.created_at DESC LIMIT 4`,
    );
    const arrears = await c.query<{ learner: string; class: string; balance_cents: string }>(
      `SELECT l.first_name || ' ' || l.last_name AS learner, COALESCE(cl.name, '—') AS class,
              (COALESCE(b.due_cents, 0) - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.learner_id = l.id AND p.state = 'confirmed'), 0))::text AS balance_cents
       FROM learner l
       LEFT JOIN v_fee_balance b ON b.learner_id = l.id
       LEFT JOIN class cl ON cl.id = l.class_id
       WHERE l.status = 'active'
       ORDER BY 3::bigint DESC LIMIT 5`,
    );
    const topClass = await c.query<{ class: string; arrears_cents: string }>(
      `SELECT COALESCE(cl.name, '—') AS class,
              SUM(COALESCE(b.due_cents, 0) - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.learner_id = l.id AND p.state = 'confirmed'), 0))::text AS arrears_cents
       FROM learner l
       LEFT JOIN v_fee_balance b ON b.learner_id = l.id
       LEFT JOIN class cl ON cl.id = l.class_id
       WHERE l.status = 'active'
       GROUP BY cl.name ORDER BY 2::bigint DESC LIMIT 1`,
    );
    const week = await c.query<{ day: string; collected_cents: string }>(
      `SELECT to_char(d, 'Dy') AS day,
              COALESCE((SELECT SUM(amount) FROM payments WHERE state = 'confirmed' AND paid_at::date = d), 0)::text AS collected_cents
       FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, INTERVAL '1 day') d`,
    );
    return {
      staff_notice: notice,
      role: "bursar",
      collected_today_cents: collectedToday.rows[0]?.n ?? "0",
      collected_term_cents: term.rows[0]?.collected ?? "0",
      billed_term_cents: term.rows[0]?.billed ?? "0",
      pending_confirmations: Number(pending.rows[0]?.n ?? 0),
      top_arrears_class: topClass.rows[0] ?? null,
      confirmations: confirmations.rows,
      rails_suggestions: rails.rows,
      arrears: arrears.rows,
      week: week.rows,
    };
  });
}

export interface PrincipalPulse {
  staff_notice: { title: string; body: string; urgency: string; created_at: string } | null;
  role: "principal";
  attendance_pct: number | null;
  incidents_7d: number;
  approvals_pending: number;
  collection_pct: number | null;
  approvals_feed: { id: string; request_type: string; requester: string; at: string }[];
  absences_by_class: { class: string; absent: number }[];
  duty_today: { staff: string; duty: string }[];
  attendance_trend: { day: string; pct: number }[];
  incidents_by_class: { class: string; n: number }[];
}

export async function principalPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<PrincipalPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const notice = await latestStaffNotice(c);
    const att = await c.query<{ present: string; expected: string }>(
      `SELECT (SELECT COUNT(*) FROM attendance WHERE day = CURRENT_DATE AND mark = 'present')::text AS present,
              (SELECT COUNT(*) FROM learner WHERE status = 'active')::text AS expected`,
    );
    const present = Number(att.rows[0]?.present ?? 0);
    const expected = Number(att.rows[0]?.expected ?? 0);
    const incidents = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM discipline_incident WHERE occurred_on >= CURRENT_DATE - 7`,
    );
    const approvals = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM approval_request WHERE state = 'pending'`,
    );
    // C10 — collection % reads the current term, not all time.
    const money = await c.query<{ collected: string; billed: string }>(
      `SELECT COALESCE((SELECT SUM(p.amount) FROM payments p
                        WHERE p.state = 'confirmed'
                          AND p.paid_at >= (SELECT starts_on FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)
                          AND p.paid_at <= (SELECT ends_on   FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)), 0)::text AS collected,
              COALESCE((SELECT SUM(amount) FROM fee_item WHERE is_optional = false), 0)::text AS billed`,
    );
    const feed = await c.query<{ id: string; request_type: string; requester: string; at: string }>(
      `SELECT a.id::text, a.request_type, s.full_name AS requester, a.created_at::text AS at
       FROM approval_request a JOIN staff s ON s.id = a.requester_id
       WHERE a.state = 'pending' ORDER BY a.created_at ASC LIMIT 5`,
    );
    const absences = await c.query<{ class: string; absent: string }>(
      `SELECT COALESCE(cl.name, '—') AS class, COUNT(*)::text AS absent
       FROM attendance a JOIN learner l ON l.id = a.learner_id LEFT JOIN class cl ON cl.id = l.class_id
       WHERE a.day = CURRENT_DATE AND a.mark = 'absent' GROUP BY cl.name ORDER BY 2 DESC LIMIT 6`,
    );
    const duty = await c.query<{ staff: string; duty: string }>(
      `SELECT s.full_name AS staff, r.duty FROM duty_roster r JOIN staff s ON s.id = r.staff_id
       WHERE r.weekday = EXTRACT(DOW FROM CURRENT_DATE) ORDER BY r.slot LIMIT 6`,
    );
    const trend = await c.query<{ day: string; pct: string }>(
      `SELECT d.day::text, CASE WHEN d.expected > 0 THEN ROUND(100.0 * d.present / d.expected)::text ELSE '0' END AS pct
       FROM (
         SELECT d::date AS day,
                (SELECT COUNT(*) FROM attendance a WHERE a.day = d::date AND a.mark = 'present')::float AS present,
                (SELECT COUNT(*) FROM learner WHERE status = 'active')::float AS expected
         FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') d
       ) d`,
    );
    const incByClass = await c.query<{ class: string; n: string }>(
      `SELECT COALESCE(cl.name, '—') AS class, COUNT(*)::text AS n
       FROM discipline_incident di LEFT JOIN class cl ON cl.id = di.class_id
       WHERE di.occurred_on >= CURRENT_DATE - 7
       GROUP BY cl.name ORDER BY 2 DESC LIMIT 6`,
    );
    return {
      staff_notice: notice,
      role: "principal",
      attendance_pct: expected > 0 ? Math.round((present / expected) * 100) : null,
      incidents_7d: Number(incidents.rows[0]?.n ?? 0),
      approvals_pending: Number(approvals.rows[0]?.n ?? 0),
      collection_pct: Number(money.rows[0]?.billed ?? 0) > 0
        ? Math.round((Number(money.rows[0]?.collected ?? 0) / Number(money.rows[0]!.billed)) * 100)
        : null,
      approvals_feed: feed.rows,
      absences_by_class: absences.rows.map((r) => ({ class: r.class, absent: Number(r.absent) })),
      duty_today: duty.rows,
      attendance_trend: trend.rows.map((r) => ({ day: r.day, pct: Number(r.pct) })),
      incidents_by_class: incByClass.rows.map((r) => ({ class: r.class, n: Number(r.n) })),
    };
  });
}

export interface CounterPulse {
  staff_notice: { title: string; body: string; urgency: string; created_at: string } | null;
  role: "counter";
  visitors_on_site: number;
  calls_today: number;
  open_inquiries: number;
  fee_inquiries_today: number;
  awaiting_checkout: { visitor: string; visiting: string; time_in: string }[];
  new_inquiries: { child: string; parent: string; stage: string }[];
  events_today: { title: string; kind: string }[];
  funnel: { stage: string; n: number }[];
}

export async function counterPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<CounterPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const notice = await latestStaffNotice(c);
    const onSite = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security_visitor WHERE time_in::date = CURRENT_DATE AND time_out IS NULL`,
    );
    const calls = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM security_visitor WHERE time_in::date = CURRENT_DATE AND purpose ILIKE '%call%'`,
    );
    const open = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM admission_inquiry WHERE stage NOT IN ('enrolled','lost')`,
    );
    const feeInq = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM admission_inquiry WHERE created_at::date = CURRENT_DATE AND level_interest ILIKE '%fee%'`,
    );
    const checkout = await c.query<{ visitor: string; visiting: string; time_in: string }>(
      `SELECT visitor, visiting, time_in::text FROM security_visitor
       WHERE time_out IS NULL AND time_in::date = CURRENT_DATE ORDER BY time_in ASC LIMIT 5`,
    );
    const newInq = await c.query<{ child: string; parent: string; stage: string }>(
      `SELECT child_first || ' ' || child_last AS child, parent_name AS parent, stage::text AS stage
       FROM admission_inquiry WHERE stage NOT IN ('enrolled','lost') ORDER BY created_at DESC LIMIT 5`,
    );
    const events = await c.query<{ title: string; kind: string }>(
      `SELECT title, kind FROM school_event WHERE CURRENT_DATE BETWEEN starts_on AND COALESCE(ends_on, starts_on) LIMIT 4`,
    );
    const funnel = await c.query<{ stage: string; n: string }>(
      `SELECT stage::text AS stage, COUNT(*)::text AS n FROM admission_inquiry
       WHERE stage NOT IN ('lost') GROUP BY stage`,
    );
    const ORDER = ["inquiry", "visit", "assessment", "offered", "enrolled"];
    const rows = funnel.rows.map((r) => ({ stage: r.stage, n: Number(r.n) }));
    rows.sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage));
    return {
      staff_notice: notice,
      role: "counter",
      visitors_on_site: Number(onSite.rows[0]?.n ?? 0),
      calls_today: Number(calls.rows[0]?.n ?? 0),
      open_inquiries: Number(open.rows[0]?.n ?? 0),
      fee_inquiries_today: Number(feeInq.rows[0]?.n ?? 0),
      awaiting_checkout: checkout.rows,
      new_inquiries: newInq.rows,
      events_today: events.rows,
      funnel: rows,
    };
  });
}

export interface DriverPulse {
  staff_notice: { title: string; body: string; urgency: string; created_at: string } | null;
  role: "driver";
  trips_today: number;
  on_manifest: number;
  not_picked_up: number;
  bus_status: string | null;
  route_stops: { point: string; pickup_at: string | null; learners: number; ticked: boolean }[];
  manifest: { learner: string; stop: string | null; ticked: boolean }[];
  route_affecting_events: { title: string; kind: string }[];
}

export async function driverPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<DriverPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const notice = await latestStaffNotice(c);
    // The driver's route: the first active route (a school runs few; the
    // Route tab owns switching). Text-first — no chart by spec.
    const route = await c.query<{ id: string; name: string }>(
      `SELECT id::text, name FROM transport_route WHERE active ORDER BY name LIMIT 1`,
    );
    const routeId = route.rows[0]?.id ?? null;

    const trips = routeId
      ? await c.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM transport_trip WHERE route_id = $1 AND ran_on = CURRENT_DATE`,
          [routeId],
        )
      : { rows: [{ n: "0" }] };
    const manifestCount = routeId
      ? await c.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM transport_manifest WHERE route_id = $1 AND term_active`,
          [routeId],
        )
      : { rows: [{ n: "0" }] };
    const tripToday = routeId
      ? await c.query<{ done: boolean }>(
          `SELECT done FROM transport_trip WHERE route_id = $1 AND ran_on = CURRENT_DATE ORDER BY id LIMIT 1`,
          [routeId],
        )
      : { rows: [] };

    const stops = routeId
      ? await c.query<{ point: string; pickup_at: string | null; learners: string; ticked: boolean }>(
          `SELECT COALESCE(p.name, 'Unassigned') AS point, p.pickup_at,
                  COUNT(m.id)::text AS learners,
                  EXISTS (SELECT 1 FROM transport_trip t WHERE t.route_id = $1 AND t.ran_on = CURRENT_DATE AND t.done) AS ticked
           FROM transport_manifest m LEFT JOIN transport_point p ON p.id = m.point_id
           WHERE m.route_id = $1 AND m.term_active
           GROUP BY p.name, p.pickup_at ORDER BY p.pickup_at NULLS LAST LIMIT 12`,
          [routeId],
        )
      : { rows: [] };

    const manifest = routeId
      ? await c.query<{ learner: string; stop: string | null }>(
          `SELECT l.first_name || ' ' || l.last_name AS learner, p.name AS stop
           FROM transport_manifest m JOIN learner l ON l.id = m.learner_id
           LEFT JOIN transport_point p ON p.id = m.point_id
           WHERE m.route_id = $1 AND m.term_active ORDER BY p.name NULLS LAST, learner LIMIT 40`,
          [routeId],
        )
      : { rows: [] };

    const bus = routeId
      ? await c.query<{ reg_no: string }>(
          `SELECT b.reg_no FROM transport_bus b WHERE b.route_id = $1 AND b.active LIMIT 1`,
          [routeId],
        )
      : { rows: [] };

    const events = await c.query<{ title: string; kind: string }>(
      `SELECT title, kind FROM school_event WHERE CURRENT_DATE BETWEEN starts_on AND COALESCE(ends_on, starts_on) LIMIT 3`,
    );

    return {
      staff_notice: notice,
      role: "driver",
      trips_today: Number(trips.rows[0]?.n ?? 0),
      on_manifest: Number(manifestCount.rows[0]?.n ?? 0),
      not_picked_up: tripToday.rows[0]?.done ? 0 : Number(manifestCount.rows[0]?.n ?? 0),
      bus_status: bus.rows[0]?.reg_no ?? null,
      route_stops: stops.rows.map((r) => ({
        point: r.point, pickup_at: r.pickup_at, learners: Number(r.learners), ticked: r.ticked,
      })),
      manifest: manifest.rows.map((m) => ({ learner: m.learner, stop: m.stop, ticked: Boolean(tripToday.rows[0]?.done) })),
      route_affecting_events: events.rows,
    };
  });
}

/* ============================ PHASE 6 (§6.7–6.11) ========================= */

export interface DormParentPulse {
  staff_notice: { title: string; body: string; urgency: string; created_at: string } | null;
  role: "dorm_parent";
  dorms: { id: string; name: string; capacity: number; occupied: number }[];
  occupied: number;
  beds: number;
  exeats_out: number;
  laundry_in_custody: number;
  incidents_7d: number;
  rollcall_taken: boolean;
  rollcall: { learner_id: string; name: string; bed_label: string | null; present: boolean | null }[];
  pending_exeats: { learner: string; reason: string; state: string; created_at: string }[];
  laundry_today: { learner: string; items: string; direction: string; created_at: string }[];
}

export async function dormParentPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<DormParentPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const notice = await latestStaffNotice(c);
    // My dorms: the dorm rows that name me (041's dorm-parent hat as data).
    const mine = await c.query<{ id: string; name: string; capacity: number; occupied: string }>(
      `SELECT d.id::text, d.name, d.capacity,
              (SELECT COUNT(*) FROM dorm_allocation da WHERE da.dorm_id = d.id AND da.active)::text AS occupied
       FROM dorm d WHERE d.dorm_parent = $1 ORDER BY d.name LIMIT 3`,
      [principal.userId],
    );
    const dormIds = mine.rows.map((d) => d.id);
    const hasDorms = dormIds.length > 0;
    const anyOf = (sql: string) =>
      hasDorms ? c.query(sql, [dormIds]) : Promise.resolve({ rows: [], rowCount: 0 });

    const exeats = await anyOf(
      `SELECT COUNT(*)::text AS n FROM exeat_pass
       WHERE learner_id IN (SELECT learner_id FROM dorm_allocation WHERE dorm_id = ANY($1) AND active)
         AND state = 'out'`,
    );
    const laundry = await anyOf(
      `SELECT COUNT(*)::text AS n FROM laundry_custody lc
       WHERE lc.direction = 'out'
         AND lc.learner_id IN (SELECT learner_id FROM dorm_allocation WHERE dorm_id = ANY($1) AND active)
         AND NOT EXISTS (SELECT 1 FROM laundry_custody back
                         WHERE back.learner_id = lc.learner_id AND back.direction = 'in'
                           AND back.created_at > lc.created_at)`,
    );
    const incidents = await anyOf(
      `SELECT COUNT(*)::text AS n FROM discipline_incident
       WHERE learner_id IN (SELECT learner_id FROM dorm_allocation WHERE dorm_id = ANY($1) AND active)
         AND occurred_on >= CURRENT_DATE - 7`,
    );
    const rollcall = await anyOf(
      `SELECT l.id::text AS learner_id, l.first_name || ' ' || l.last_name AS name, da.bed_label,
              rc.present
       FROM dorm_allocation da
       JOIN learner l ON l.id = da.learner_id
       LEFT JOIN hostel_rollcall rc ON rc.dorm_id = da.dorm_id AND rc.night = CURRENT_DATE AND rc.learner_id = da.learner_id
       WHERE da.dorm_id = ANY($1) AND da.active
       ORDER BY l.first_name, l.last_name LIMIT 40`,
    );
    const pending = await anyOf(
      `SELECT l.first_name || ' ' || l.last_name AS learner, e.reason, e.state::text AS state, e.created_at::text
       FROM exeat_pass e JOIN learner l ON l.id = e.learner_id
       WHERE e.learner_id IN (SELECT learner_id FROM dorm_allocation WHERE dorm_id = ANY($1) AND active)
         AND e.state IN ('requested','approved')
       ORDER BY e.created_at ASC LIMIT 6`,
    );
    const laundryMoves = await anyOf(
      `SELECT l.first_name || ' ' || l.last_name AS learner, lc.items, lc.direction, lc.created_at::text
       FROM laundry_custody lc JOIN learner l ON l.id = lc.learner_id
       WHERE lc.learner_id IN (SELECT learner_id FROM dorm_allocation WHERE dorm_id = ANY($1) AND active)
         AND lc.created_at::date = CURRENT_DATE
       ORDER BY lc.created_at DESC LIMIT 6`,
    );
    const rollcallTaken = (rollcall.rowCount ?? 0) > 0;
    return {
      staff_notice: notice,
      role: "dorm_parent",
      dorms: mine.rows.map((d) => ({ id: d.id, name: d.name, capacity: d.capacity, occupied: Number(d.occupied) })),
      occupied: mine.rows.reduce((a, d) => a + Number(d.occupied), 0),
      beds: mine.rows.reduce((a, d) => a + d.capacity, 0),
      exeats_out: Number(exeats.rows[0]?.n ?? 0),
      laundry_in_custody: Number(laundry.rows[0]?.n ?? 0),
      incidents_7d: Number(incidents.rows[0]?.n ?? 0),
      rollcall_taken: rollcallTaken,
      rollcall: rollcall.rows,
      pending_exeats: pending.rows,
      laundry_today: laundryMoves.rows,
    };
  });
}

export interface JanitorPulse {
  staff_notice: { title: string; body: string; urgency: string; created_at: string } | null;
  role: "janitor";
  open_repairs: number;
  done_7d: number;
  structural_open: number;
  est_cost_open_cents: string;
  supplies_low: number;
  queue: { room: string; item: string; condition: string; state: string; qty: number; est_cost_cents: string; created_at: string }[];
  supplies: { name: string; qty_on_hand: number; low_stock_threshold: number; location: string | null }[];
}

export async function janitorPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<JanitorPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const notice = await latestStaffNotice(c);
    const open = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM repair_report WHERE state = 'open'`,
    );
    const done = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM repair_report WHERE state = 'done' AND resolved_at >= CURRENT_DATE - 7`,
    );
    const structural = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM repair_report WHERE state NOT IN ('done','out-of-service') AND condition = 'structural'`,
    );
    const est = await c.query<{ n: string | null }>(
      `SELECT SUM(est_cost_cents)::text AS n FROM repair_report WHERE state = 'open'`,
    );
    const suppliesLow = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM stock_item WHERE category = 'store' AND qty_on_hand <= low_stock_threshold`,
    );
    const queue = await c.query<JanitorPulse["queue"][number]>(
      `SELECT room, item, condition, state::text AS state, qty, est_cost_cents::text, created_at::text
       FROM repair_report
       WHERE state IN ('open','in-repair')
       ORDER BY CASE condition WHEN 'structural' THEN 0 WHEN 'broken' THEN 1 ELSE 2 END, created_at ASC
       LIMIT 8`,
    );
    const supplies = await c.query<JanitorPulse["supplies"][number]>(
      `SELECT name, qty_on_hand, low_stock_threshold, location FROM stock_item
       WHERE category = 'store' AND qty_on_hand <= low_stock_threshold
       ORDER BY (qty_on_hand::float / GREATEST(low_stock_threshold, 1)) ASC LIMIT 6`,
    );
    return {
      staff_notice: notice,
      role: "janitor",
      open_repairs: Number(open.rows[0]?.n ?? 0),
      done_7d: Number(done.rows[0]?.n ?? 0),
      structural_open: Number(structural.rows[0]?.n ?? 0),
      est_cost_open_cents: est.rows[0]?.n ?? "0",
      supplies_low: Number(suppliesLow.rows[0]?.n ?? 0),
      queue: queue.rows,
      supplies: supplies.rows,
    };
  });
}

export interface LibrarianPulse {
  staff_notice: { title: string; body: string; urgency: string; created_at: string } | null;
  role: "librarian";
  copies_out: number;
  due_today: number;
  overdue: number;
  new_titles_term: number;
  due_feed: { title: string; barcode: string; learner: string; due_on: string; overdue: boolean }[];
  by_class_30d: { class: string; n: number }[];
  new_titles: { title: string; author: string | null; copies_total: number }[];
}

export async function librarianPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<LibrarianPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const notice = await latestStaffNotice(c);
    const out = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM library_copy WHERE with_learner IS NOT NULL`,
    );
    const dueToday = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM library_copy WHERE with_learner IS NOT NULL AND due_on = CURRENT_DATE`,
    );
    const overdue = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM library_copy WHERE with_learner IS NOT NULL AND due_on < CURRENT_DATE`,
    );
    const newTitles = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM library_item
       WHERE created_at >= COALESCE((SELECT starts_on FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1), CURRENT_DATE - 90)`,
    );
    const feed = await c.query<LibrarianPulse["due_feed"][number]>(
      `SELECT i.title, lc.barcode, l.first_name || ' ' || l.last_name AS learner,
              lc.due_on::text AS due_on, (lc.due_on < CURRENT_DATE) AS overdue
       FROM library_copy lc
       JOIN library_item i ON i.id = lc.item_id
       JOIN learner l ON l.id = lc.with_learner
       WHERE lc.with_learner IS NOT NULL AND lc.due_on <= CURRENT_DATE
       ORDER BY lc.due_on ASC LIMIT 8`,
    );
    const byClass = await c.query<{ class: string; n: string }>(
      `SELECT COALESCE(cl.name, '—') AS class, COUNT(*)::text AS n
       FROM library_loan lo
       JOIN learner l ON l.id = lo.learner_id
       LEFT JOIN class cl ON cl.id = l.class_id
       WHERE lo.issued_at >= CURRENT_DATE - 30
       GROUP BY cl.name ORDER BY 2 DESC LIMIT 8`,
    );
    const titles = await c.query<LibrarianPulse["new_titles"][number]>(
      `SELECT title, author, copies_total FROM library_item ORDER BY created_at DESC LIMIT 4`,
    );
    return {
      staff_notice: notice,
      role: "librarian",
      copies_out: Number(out.rows[0]?.n ?? 0),
      due_today: Number(dueToday.rows[0]?.n ?? 0),
      overdue: Number(overdue.rows[0]?.n ?? 0),
      new_titles_term: Number(newTitles.rows[0]?.n ?? 0),
      due_feed: feed.rows.map((r) => ({ ...r, overdue: Boolean(r.overdue) })),
      by_class_30d: byClass.rows.map((r) => ({ class: r.class, n: Number(r.n) })),
      new_titles: titles.rows,
    };
  });
}

export interface PatronPulse {
  staff_notice: { title: string; body: string; urgency: string; created_at: string } | null;
  role: "patron";
  leader_house: string | null;
  leader_points: string | null;
  events_week: number;
  kit_low: number;
  sessions_7d: number;
  standings: { house: string; points: string }[];
  my_sections: { id: string; name: string; kind: string; members: number }[];
  sessions: { section: string; held_on: string; topic: string | null }[];
  kit_requests: { section: string; item: string; qty: number; min_qty: number }[];
  events: { title: string; kind: string; starts_on: string }[];
}

export async function patronPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<PatronPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const notice = await latestStaffNotice(c);
    // House standings — §6.10 chart in list form; the UI renders the bars.
    const standings = await c.query<{ house: string; points: string }>(
      `SELECT s.name AS house, COALESCE(SUM(hp.points), 0)::text AS points
       FROM section s LEFT JOIN house_points hp ON hp.house_id = s.id
       WHERE s.kind = 'house'
       GROUP BY s.name ORDER BY 2::bigint DESC, s.name LIMIT 6`,
    );
    const mine = await c.query<{ id: string; name: string; kind: string; members: string }>(
      `SELECT s.id::text, s.name, s.kind::text AS kind,
              (SELECT COUNT(*) FROM section_member sm WHERE sm.section_id = s.id AND sm.active)::text AS members
       FROM section s WHERE s.head_staff_id = $1 AND s.enabled ORDER BY s.name LIMIT 5`,
      [principal.userId],
    );
    const sectionIds = mine.rows.map((r) => r.id);
    const sessions = sectionIds.length
      ? await c.query<PatronPulse["sessions"][number]>(
          `SELECT ss.section_id::text AS section_id, sec.name AS section, ss.held_on::text AS held_on, ss.topic
           FROM section_session ss JOIN section sec ON sec.id = ss.section_id
           WHERE ss.section_id = ANY($1) AND ss.held_on >= CURRENT_DATE - 7
           ORDER BY ss.held_on DESC LIMIT 6`,
          [sectionIds],
        )
      : { rows: [] as PatronPulse["sessions"] };
    const kit = sectionIds.length
      ? await c.query<PatronPulse["kit_requests"][number]>(
          `SELECT sec.name AS section, i.name AS item, sk.qty, sk.min_qty
           FROM section_kit sk
           JOIN stock_item i ON i.id = sk.item_id
           JOIN section sec ON sec.id = sk.section_id
           WHERE sk.section_id = ANY($1) AND sk.qty <= sk.min_qty
           ORDER BY (sk.qty::float / GREATEST(sk.min_qty, 1)) ASC LIMIT 5`,
          [sectionIds],
        )
      : { rows: [] as PatronPulse["kit_requests"] };
    const events = await c.query<PatronPulse["events"][number]>(
      `SELECT title, kind, starts_on::text FROM school_event
       WHERE starts_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
       ORDER BY starts_on LIMIT 5`,
    );
    const sessions7d = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM section_session WHERE held_on >= CURRENT_DATE - 7`,
    );
    return {
      staff_notice: notice,
      role: "patron",
      leader_house: standings.rows[0]?.house ?? null,
      leader_points: standings.rows[0]?.points ?? null,
      events_week: events.rowCount ?? 0,
      kit_low: kit.rows.length,
      sessions_7d: Number(sessions7d.rows[0]?.n ?? 0),
      standings: standings.rows,
      my_sections: mine.rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, members: Number(r.members) })),
      sessions: sessions.rows,
      kit_requests: kit.rows,
      events: events.rows,
    };
  });
}

export interface HodPulse {
  staff_notice: { title: string; body: string; urgency: string; created_at: string } | null;
  role: "hod";
  /** Teacher base (§6.11: HOD view = teacher Today + department overlay). */
  teacher: TeacherPulse;
  dept_area: string | null;
  coverage_pct: number | null;
  unmarked_dept: number;
  dept_mean: number | null;
  school_mean: number | null;
  dept_teachers: number;
  unmarked_by_teacher: { teacher: string; n: number }[];
  subject_means: { subject: string; mean: number }[];
  gaps_today: { class: string; period: number; area_name: string | null }[];
}

export async function hodPulse(dbName: string, principal: Extract<Principal, { kind: "staff" }>): Promise<HodPulse> {
  return withSession(dbName, { userId: principal.userId, role: principal.role }, async (c) => {
    const notice = await latestStaffNotice(c);
    // Teacher base runs inside the same RLS session (no second login context).
    const teacher = await teacherPulseInner(c, principal, dbName);
    // Department proxy (no dept entity exists): the learning area this HOD
    // teaches most. Overlay hides when they teach nothing.
    const dept = await c.query<{ area_name: string }>(
      `SELECT area_name FROM timetable_slot
       WHERE teacher_id = $1 AND area_name IS NOT NULL
       GROUP BY area_name ORDER BY COUNT(*) DESC LIMIT 1`,
      [principal.userId],
    );
    const deptArea = dept.rows[0]?.area_name ?? null;
    const empty = {
      staff_notice: notice,
      dept_area: deptArea,
      coverage_pct: null,
      unmarked_dept: 0,
      dept_mean: null,
      school_mean: null,
      dept_teachers: 0,
      unmarked_by_teacher: [],
      subject_means: [],
      gaps_today: [],
    };
    if (!deptArea) return { role: "hod", teacher, ...empty };

    const coverage = await c.query<{ total: string; covered: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE teacher_id IS NOT NULL)::text AS covered
       FROM timetable_slot WHERE area_name = $1 AND active`,
      [deptArea],
    );
    const total = Number(coverage.rows[0]?.total ?? 0);
    const coveredN = Number(coverage.rows[0]?.covered ?? 0);
    const termCte = `(SELECT id FROM term WHERE CURRENT_DATE BETWEEN starts_on AND ends_on LIMIT 1)`;
    const unmarked = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM assessment WHERE subject = $1 AND score IS NULL AND term_id = ${termCte}`,
      [deptArea],
    );
    const means = await c.query<{ subject: string; mean: string }>(
      `SELECT subject, ROUND(AVG(score)::numeric, 1)::text AS mean
       FROM assessment WHERE score IS NOT NULL AND term_id = ${termCte}
       GROUP BY subject ORDER BY 2::numeric DESC LIMIT 8`,
    );
    const byTeacher = await c.query<{ teacher: string; n: string }>(
      `SELECT s.full_name AS teacher, COUNT(*)::text AS n
       FROM assessment a JOIN staff s ON s.id = a.recorded_by
       WHERE a.subject = $1 AND a.score IS NULL AND a.term_id = ${termCte}
       GROUP BY s.full_name ORDER BY 2 DESC LIMIT 6`,
      [deptArea],
    );
    const gaps = await c.query<HodPulse["gaps_today"][number]>(
      `SELECT cl.name AS class, ts.period, ts.area_name
       FROM timetable_slot ts JOIN class cl ON cl.id = ts.class_id
       WHERE ts.area_name = $1 AND ts.active AND ts.day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE) AND ts.teacher_id IS NULL
       ORDER BY ts.period LIMIT 5`,
      [deptArea],
    );
    const meansRows = means.rows.map((r) => ({ subject: r.subject, mean: Number(r.mean) }));
    const deptRow = meansRows.find((m) => m.subject === deptArea);
    const schoolMean = meansRows.length
      ? Math.round((meansRows.reduce((a, m) => a + m.mean, 0) / meansRows.length) * 10) / 10
      : null;
    const deptTeachers = await c.query<{ n: string }>(
      `SELECT COUNT(DISTINCT teacher_id)::text AS n FROM timetable_slot WHERE area_name = $1 AND teacher_id IS NOT NULL`,
      [deptArea],
    );
    return {
      staff_notice: notice,
      role: "hod",
      teacher,
      dept_area: deptArea,
      coverage_pct: total > 0 ? Math.round((coveredN / total) * 100) : null,
      unmarked_dept: Number(unmarked.rows[0]?.n ?? 0),
      dept_mean: deptRow?.mean ?? null,
      school_mean: schoolMean,
      dept_teachers: Number(deptTeachers.rows[0]?.n ?? 0),
      unmarked_by_teacher: byTeacher.rows.map((r) => ({ teacher: r.teacher, n: Number(r.n) })),
      subject_means: meansRows,
      gaps_today: gaps.rows,
    };
  });
}
