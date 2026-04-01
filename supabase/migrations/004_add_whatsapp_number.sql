-- Add whatsapp_number column to friends table
ALTER TABLE friends ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
