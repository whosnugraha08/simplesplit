-- ============================================
-- SimpleSplit v2 Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- TABLE: users (custom auth with username + PIN)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Trigger for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MODIFY: friends — link to users
-- ============================================
ALTER TABLE friends ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE friends ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);

-- ============================================
-- MODIFY: bills — track creator
-- ============================================
ALTER TABLE bills ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ============================================
-- MODIFY: item_assignments — flexible per-item qty
-- ============================================
ALTER TABLE item_assignments ADD COLUMN IF NOT EXISTS assigned_qty INTEGER DEFAULT 1;

-- ============================================
-- MODIFY: debts — add notes for detail
-- ============================================
ALTER TABLE debts ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- TABLE: users — RLS
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on users" ON users FOR ALL USING (true) WITH CHECK (true);
