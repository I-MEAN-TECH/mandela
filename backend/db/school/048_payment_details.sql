-- 048_payment_details.sql — method-specific capture on a payment.
-- The ledger row keeps method + reference; `details` holds what the method
-- demands: M-Pesa (code, phone, time), bank (slip no, bank, time), cheque
-- (cheque no, bank, date). One jsonb — no new tables, no new math.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS details jsonb;
