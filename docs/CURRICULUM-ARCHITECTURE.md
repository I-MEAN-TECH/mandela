# Curriculum Architecture — any school, any curriculum

> Research note (2026-09-10) in the Admin-dashboard series. Question: can the
> platform serve every school in Kenya — CBC/CBE, the 8-4-4 tail, British
> (IGCSE/A-level), American, IB, Montessori, ACE, madrasa-integrated, and the
> many hybrids — without forking the product?

---

## 1. What Kenya actually runs (sourced, 2026)

**The national transition is a live overlap, not a switch.** 8-4-4 is being
phased out as CBE (Competency Based Education) arrives: in the same year a
school can hold Form 4 candidates sitting the final KCSE *and* Grade 10
pioneers in Senior School (reported Jan 12, 2026). KNEC still administers
KCSE in 2026 while KJSEA (Grade 9, Oct 26–Nov 20, 2026) and KPSEA run under
the new system. **Conclusion: "curriculum" cannot be a global constant — a
school legitimately runs two at once, by grade.**

**CBE structure (KICD/KNEC):**
- Ladder: PP1–PP2 → Grade 1–9 (Junior School) → Grade 10–12 (Senior School)
- Senior School pathways: STEM, Social Sciences, Arts & Sports (a pathway is
  a grouping of learning areas, chosen per learner)
- Assessment: Competency-Based Assessment (CBA) — 4 performance levels
  (**BE / AE / ME / EE** — Below, Approaching, Meeting, Exceeding
  Expectations) in day-to-day SBA; national grading uses AL1–AL8 scales;
  KNEC weighting blends SBA + national exams (60% / 40% patterns at KJSEA)
- Curriculum content is organized **Strand → Sub-strand → learning outcome**,
  published per grade per learning area in KICD curriculum designs
- National checkpoints: KEYA (G3), KPSEA (G6), KMYA (G9 pre-KJSEA basis)

**The private sector is genuinely multi-curricular:**
- British National Curriculum / Cambridge / Edexcel IGCSE + A-levels
  (Hillcrest, Rusinga, Kitengela IS, …), often KES 100k–4.5M/yr band
- American, IB, Montessori, Waldorf, ACE (Accelerated Christian Education),
  madrasa-integrated academies
- **Hybrids are a mainstream segment** — schools advertising "CBE + Cambridge
  side by side" (Rusinga and others). Dual-curriculum is a market feature,
  not an edge case.

**Implication:** exam-entry obligations are curriculum-specific too — KEMIS
ULI registration for national-curve candidates, Cambridge/Edexcel candidate
registration for British-curve candidates. The Admin's "KEMIS Check" must
generalize to **"Exam Entries"**: one completeness meter per exam body.

---

## 2. Design: curriculum as configuration, not code

Four data tables (migrations 008 + 009 + 010, seeded packs per curriculum)
and two column additions. Nothing else moves.

```sql
-- migrations 008_classroom_curriculum.sql + 009_curriculum_packs.sql
CREATE TABLE curriculum (
  id     serial PRIMARY KEY,
  code   text NOT NULL UNIQUE,      -- 'cbe', '844', 'british', 'american', 'ib', 'ace'
  name   text NOT NULL              -- 'CBE (CBC) — Kenya', 'British National (Cambridge)'
);

CREATE TABLE curriculum_level (
  id             serial PRIMARY KEY,
  curriculum_id  int NOT NULL REFERENCES curriculum(id) ON DELETE CASCADE,
  seq            int  NOT NULL,           -- ordering on the ladder
  code           text NOT NULL,           -- 'PP1','G7','G10','FORM2','Y8'
  label          text NOT NULL,           -- 'Grade 7','Form 2','Year 8'
  UNIQUE (curriculum_id, code)
);

CREATE TABLE learning_area (
  id             serial PRIMARY KEY,
  curriculum_id  int NOT NULL REFERENCES curriculum(id) ON DELETE CASCADE,
  level_id       int NOT NULL REFERENCES curriculum_level(id) ON DELETE CASCADE,
  code           text NOT NULL,           -- 'ENG','MATH','INT-SCI','ENGLISH-LANG'
  name           text NOT NULL,           -- 'English','Mathematics','Integrated Science'
  pathway        text,                    -- 'stem','social','arts-sports' (Senior School)
  parent_id      int REFERENCES learning_area(id),  -- strand -> sub-strand nesting
  UNIQUE (curriculum_id, level_id, code)
);

CREATE TABLE assessment_scheme (
  id            serial PRIMARY KEY,
  curriculum_id int NOT NULL REFERENCES curriculum(id) ON DELETE CASCADE,
  code          text NOT NULL,            -- 'cbc-sba', '844-marks', 'igcse-grades'
  name          text NOT NULL,            -- 'CBC day-to-day (BE/AE/ME/EE)'
  scale         jsonb NOT NULL            -- ordered levels + descriptors + weights
  -- e.g. [{"k":"BE","min":0},{"k":"AE"},{"k":"ME"},{"k":"EE"}]
  --      [{"k":"A","min":75},...%],  [{"k":"9","min":90},..."1"]
);
ALTER TABLE class ADD COLUMN IF NOT EXISTS level_id int REFERENCES curriculum_level(id);
ALTER TABLE assessment ADD COLUMN IF NOT EXISTS scheme_id int REFERENCES assessment_scheme(id);
ALTER TABLE assessment ADD COLUMN IF NOT EXISTS area_id  int REFERENCES learning_area(id);
```

**Rules that fall out of this shape:**

1. **Class is the meeting point.** `class.level_id` + `class.curriculum_id`
   (via level) say which ladder a class sits on; rosters, attendance,
   homework don't change at all.
2. **Subjects become data, not enum** — "Mathematics" is a `learning_area`
   row the school can rename/extend; CBC strands/sub-strands nest under
   areas via `parent_id`. 8-4-4/IGCSE use flat areas with no strands.
3. **The report card is a renderer, not a formula.** It reads the class's
   `assessment_scheme.scale`: CBC report shows strands with BE/AE/ME/EE and
   AL descriptors; 8-4-4-style shows marks, mean grade, rank; IGCSE shows
   grades and examiner codes. One renderer, N schemes, zero hardcoding —
   same spirit as `school_settings` driving the UI.
4. **KNEC weighting / pathway eligibility are report-time computations**
   over scheme data — never write-time mutations of marks.
5. ****Curriculum packs are seeded, versioned data** (provisioner step), like
   migrations for content: `cbe` pack (PP1–G12 + pathways + KNEC scales),
   `844` pack (Form 1–4, A–E marks), `british` pack (Y1–Y13, 9–1/A*–G).
   A school picks its packs at provisioning; Settings can add more later.

**What stays curriculum-agnostic forever:** People, Money, Talk, attendance,
homework, Insights, Settings, Desks, Transport. The curriculum lives only in
the Classroom module's data shape and the report renderer — which is why the
14 Admin modules below are unaffected.

---

## 3. Module naming (plain language, any school)

Naming rules: parent-brief English, no internal jargon, ≤2 words, verbs
where the module is an action, every name true for CBC *and* Cambridge.

| # | Module (was) | Name | Why |
|---|---|---|---|
| ① | staff register | **Staff Register** | every school office says "register" |
| ② | learner register & enrolment | **Learners** | admit/edit/transfer live inside |
| ③ | guardians & families | **Guardians & Parents** | every school form says "parent/guardian"; covers both |
| ④ | KEMIS readiness | **Exam Entries** | generalizes: KEMIS ULI (national) *and* Cambridge/Edexcel candidate registration |
| ⑤ | fee structures & billing | **Fee Structure** | the exact phrase schools publish |
| ⑥ | collect | **Collect** | keep — the verb bursars live by |
| ⑦ | reconcile | **Confirm** | plainer than "Reconcile"; route stays `/reconcile` |
| ⑧ | levies & consent | **Levies** | keep — universally understood |
| ⑨ | reports (money) | **Fee Reports** | kills the collision with learner report cards |
| ⑩–⑫ | insights cards | **Collections · Attendance · Parent Reach** | three plain analytics cards |
| ⑬ | school identity | **School Profile** | plain; the "as data" poetry lives in the subtitle |
| ⑭ | terms & audit | **Terms & Calendar** · **Audit Trail** | calendar is universal; audit trail = the owner's proof |

**Tab names stay: Today · People · Money · Insights · Settings.** And
because nav labels come from `school_settings.nav_json`, any school can
rename a tab ("People" → "Staff & Students") in Settings — a data edit, not
a release. (Learner-side future modules keep the same discipline: Report
Cards, Homework, Messages, Transport.)

---

## 4. Curriculum-adaptive forms & flows (2026-09-12 deep research)

> The requirement: **"I select CBE → every form and flow speaks CBE and I
> never see what I don't need; the same for any other curriculum."**
> This section specifies the mechanism and catalogs every form it changes.

### 4.0 The rule: curriculum is a *context*, not a toggle

A school can run CBE and Cambridge **side by side** (dual-curriculum is a
mainstream Kenyan segment — §1). So "selecting a curriculum" never flips one
school-wide switch; it means: **enable the pack → new classes attach to its
levels → every form resolves its curriculum from the class in scope.** A
class-level context gives both correctness (a G7 Maths capture is CBE, a Y10
Physics capture is IGCSE, in the same school, same week) and simplicity (a
pure-CBE school's context is always CBE — they experience it exactly as the
user described).

### 4.1 The three curves, side by side (what the forms must speak)

| | **CBE (KICD/KNEC)** | **8-4-4 (KCSE tail)** | **British (Cambridge/Edexcel)** |
|---|---|---|---|
| Ladder & labels | PP1–PP2, Grade 1–9, Grade 10–12 | Form 1–4 | Year 1–13 (Primary / Lower Sec / IGCSE / AS–A) |
| Unit hierarchy | Learning Area → **Strand → Sub-strand** → Specific Learning Outcomes ("topic" is retired vocabulary — never show it) | Subject → Topic (flat) | Subject → Unit/Topic (flat) |
| Assessment entry | Rubric levels **BE/AE/ME/EE** per sub-strand (+ AL1–AL8 national scales at KJSEA/KCSE reporting) | Raw marks % → mean grade | Grade **A*–G / 9–1** per subject; **coursework/practical component split** (20–30% of science marks are school-assessed) |
| Senior subject choice | **Pathways**: STEM / Social Sciences / Arts & Sports (per learner, G10–12) | Fixed subject groups | Free subject choice, 7–10 IGCSEs |
| Exam body & entries | KNEC: KEMIS ULI/ULI per candidate, KPSEA/KJSEA/KCSE registration | KNEC: KCSE candidates | Cambridge/Edexcel: candidate number per syllabus component |
| Report card reads | "What the learner can do" — strands with rubric levels + descriptors | Marks, mean grade, rank | Grades + component marks, no rank |
| Checkpoints | KEYA (G3), KPSEA (G6), KMYA/KJSEA (G9) | KCSE (F4) | Cambridge Checkpoint (Y6, Y9) |

### 4.2 The mechanism — five parts, zero per-curriculum components

1. **Vocabulary is pack data.** `curriculum` gains a `vocab jsonb` column
   (migration 016): `{ "learner_label": "Learner"|"Student"|"Pupil",
   "level_label": "Grade"|"Form"|"Year", "area_label": "Learning
   Area"|"Subject", "unit_label": "Strand"|null, "subunit_label":
   "Sub-strand"|"Topic"|null }`. Every classroom label renders from vocab —
   a CBE school sees "Learning Areas · Strands", a British school sees
   "Subjects · Topics", from the same component.

2. **One context resolver.** `curriculumContext(classId)` in
   `web/queries.ts`: a single join (class → level → curriculum → scheme →
   areas) returning `{ curriculum, vocab, scheme_scale, areas_tree,
   flags }` where `flags = { has_strands, has_pathways, has_coursework,
   marks_range, exam_bodies[] }`. **Every classroom form/report calls this**
   — there is no other source of curriculum truth in the UI.

3. **Forms render from context flags.** The assessment-capture form, for
   example: renders the strand→sub-strand picker only when `has_strands`
   (CBE); renders a marks input bounded by `marks_range` when the scheme is
   marks-based (8-4-4); renders grade dropdowns from `scheme_scale` and the
   **coursework/exam component split** only when `has_coursework`
   (Cambridge sciences). Same component, different shape — exactly how
   `assessment_scheme.scale` already drives the grade keys (migration 008).

4. **The report card is a renderer** (§2 rule 3, unchanged): one renderer,
   N schemes. CBE → strands × levels grid with descriptors; 8-4-4 → marks,
   mean, rank; IGCSE → grades + component marks. Weights (KNEC 60/40 SBA
   blends) are report-time computations over scheme data, never write-time.

5. **Visibility follows the context, school-wide.** The onboarding wizard
   (blueprint §6.3) and Curriculum Setup ⑯ control which packs are enabled;
   capability flags hide what's unused: **no national-curve classes → no
   KEMIS surfaces anywhere; no CBE classes → no pathways/strands/rubric UI;
   no British classes → no candidate-registration fields.** The Exam Entries
   screen (⑤) renders one completeness meter per enabled exam body.

### 4.3 Form-flow catalog — what changes, per form

| Form / flow | Curriculum-adaptive parts | Never changes |
|---|---|---|
| **Enrol learner** | class picker lists only enabled packs' levels; **pathway picker (STEM/Social/Arts-Sports)** only for CBE G10–12; candidate-no fields per enabled exam bodies | names, DOB, guardian link, admission no |
| **Create/edit class** | curriculum → level ladder cascade from enabled packs; vocab labels on the ladder | seat count, class teacher |
| **Assessment capture** | full §4.2(3) behavior — the most adaptive form in the product | learner picker, term, audit-logged upsert |
| **Report card** | renderer reads scheme (§4.2(4)) | attendance summary, header from `school_settings` |
| **Homework** | area/unit picker from the class's ladder (CBE picks sub-strand; others pick subject) | title/body/due/submissions |
| **Exam Entries ⑤** | one meter per enabled exam body (KEMIS ↔ Cambridge) | gap list UX, CSV export |
| **Insights classroom cards** | attendance/coverage identical; assessment analytics vocabulary from vocab; no mean-grade widgets outside 8-4-4 classes | attendance trend, collection tables |
| **Timetable 🔮** | grid periods identical; area labels from vocab | periods, rooms, clash rules |

### 4.4 The boundary — what never adapts

People, Money, Talk, attendance, homework core, Sections (㊸), Settings.
The curriculum lives **only** in classroom data shapes and rendering. This
is deliberate: it keeps the adaptive surface small, testable, and true to
"no hardcoding" — a new curriculum (American, IB, ACE, madrasa-integrated,
§1) is a **new seeded pack + vocab, never a code branch**.

### 4.5 Build order for this section

1. Migration 016: `vocab jsonb` on `curriculum` + seed vocab into the three
   packs (`cbe`, `844`, `british`) + form-hint fields on `assessment_scheme`
   (`marks_min/max`, `components jsonb`).
2. `curriculumContext()` resolver + tests (dual-curve school fixture).
3. Re-render assessment capture + enrol + exam entries from context.
4. Report-card renderer (⑱ depends on this).
5. Curriculum Setup ⑯ UI: enable packs, set school default, attach classes —
   the screen where "I select CBE…" actually happens.
