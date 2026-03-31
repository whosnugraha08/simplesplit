-- SimpleSplit Database Schema
-- Run this in your Supabase SQL Editor

-- ============================================
-- TABLE: friends
-- ============================================
CREATE TABLE IF NOT EXISTS friends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

-- ============================================
-- TABLE: bills
-- ============================================
CREATE TABLE IF NOT EXISTS bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  paid_by UUID NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  receipt_image_url TEXT,
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  service_charge_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'assigned', 'settled')),
  bill_date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TABLE: bill_items
-- ============================================
CREATE TABLE IF NOT EXISTS bill_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  item_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TABLE: item_assignments
-- ============================================
CREATE TABLE IF NOT EXISTS item_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_item_id UUID NOT NULL REFERENCES bill_items(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  share_amount DECIMAL(15,2) DEFAULT 0,
  UNIQUE(bill_item_id, friend_id)
);

-- ============================================
-- TABLE: debts
-- ============================================
CREATE TABLE IF NOT EXISTS debts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  debtor_id UUID NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  creditor_id UUID NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_bills_paid_by ON bills(paid_by);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_item_assignments_bill_item ON item_assignments(bill_item_id);
CREATE INDEX IF NOT EXISTS idx_item_assignments_friend ON item_assignments(friend_id);
CREATE INDEX IF NOT EXISTS idx_debts_bill ON debts(bill_id);
CREATE INDEX IF NOT EXISTS idx_debts_debtor ON debts(debtor_id);
CREATE INDEX IF NOT EXISTS idx_debts_creditor ON debts(creditor_id);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
CREATE INDEX IF NOT EXISTS idx_payment_methods_friend ON payment_methods(friend_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_friends_updated_at
  BEFORE UPDATE ON friends
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STORAGE BUCKETS (run separately in Supabase Dashboard > Storage)
-- Or use the Supabase Management API
-- ============================================
-- CREATE POLICY for storage:
-- Bucket: receipts (public read)
-- Bucket: qris (public read)

-- RLS POLICIES (disabled for single-admin simplicity)
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single admin, no auth required for now)
CREATE POLICY "Allow all on friends" ON friends FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on bills" ON bills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on bill_items" ON bill_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on item_assignments" ON item_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on debts" ON debts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on payment_methods" ON payment_methods FOR ALL USING (true) WITH CHECK (true);
