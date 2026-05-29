-- WA Group connection + app settings
CREATE TABLE IF NOT EXISTS wa_group_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_jid TEXT UNIQUE,
  group_name TEXT,
  reminder_frequency TEXT DEFAULT 'off' CHECK (reminder_frequency IN ('daily', 'weekly', 'off')),
  is_active BOOLEAN DEFAULT true,
  linked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bill category column
ALTER TABLE bills ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'lainnya';

-- Payment confirmation pending state
ALTER TABLE debts ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'pending_confirmation', 'paid'));

COMMENT ON COLUMN debts.payment_status IS 'Two-way confirmation: pending_confirmation until creditor approves';
