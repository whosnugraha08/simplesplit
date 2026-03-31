-- SimpleSplit Migration 002: Add payment_methods table
-- Run this if you already have the old schema (with bank fields on friends table)
-- This adds the new payment_methods table for multiple bank accounts per friend

-- ============================================
-- TABLE: payment_methods (1 friend → many payment methods)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  friend_id UUID NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT,
  qris_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- INDEX
CREATE INDEX IF NOT EXISTS idx_payment_methods_friend ON payment_methods(friend_id);

-- RLS
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on payment_methods" ON payment_methods FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- MIGRATE existing bank data from friends → payment_methods
-- ============================================
INSERT INTO payment_methods (friend_id, label, bank_name, account_number, qris_image_url)
SELECT
  id,
  COALESCE(bank_name, 'Rekening'),
  COALESCE(bank_name, 'Unknown'),
  bank_account_number,
  qris_image_url
FROM friends
WHERE bank_name IS NOT NULL OR bank_account_number IS NOT NULL OR qris_image_url IS NOT NULL;

-- NOTE: Old columns (bank_name, bank_account_number, qris_image_url) are kept
-- on the friends table for backward compatibility. They won't be used by the app anymore.
