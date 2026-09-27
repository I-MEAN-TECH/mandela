/**
 * Shared types for the /print/* documents — mirrors of the API payloads.
 * Kept separate so the print pages never import server-only modules.
 */
export interface ReportCardPrint {
  card_id: string;
  learner: string;
  admission_no: string | null;
  class_name: string | null;
  term: string;
  state: string;
  generated_on: string;
  payload: {
    vocab: { learner: string; class: string; subject: string } | null;
    scale: { k: string; name?: string }[] | null;
    curriculum: { code: string; name: string } | null;
    rows: { subject: string; strand: string | null; score: string | null; grade: string | null; exam_type: string }[];
    attendance: { present: number; total: number };
  };
  school: { name: string; contact_phone: string | null; contact_email: string | null; contact_address: string | null };
}
