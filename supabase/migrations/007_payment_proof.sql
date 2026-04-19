-- Add proof_image_url to debts table for payment proof screenshots
ALTER TABLE debts ADD COLUMN IF NOT EXISTS proof_image_url TEXT;
