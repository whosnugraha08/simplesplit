-- Add wa_lid column for storing WhatsApp Linked Device ID separately from phone number
ALTER TABLE friends ADD COLUMN IF NOT EXISTS wa_lid TEXT;

-- Restore correct phone numbers (previously overwritten by !idku with LID)
-- AL: 081214019594
UPDATE friends SET whatsapp_number = '081214019594' WHERE LOWER(name) = 'al';
-- Mikael: 081285090185
UPDATE friends SET whatsapp_number = '081285090185' WHERE LOWER(name) = 'mikael';
-- Rizky: 089619849672
UPDATE friends SET whatsapp_number = '089619849672' WHERE LOWER(name) = 'rizky';
-- Faiz: 088983447063
UPDATE friends SET whatsapp_number = '088983447063' WHERE LOWER(name) = 'faiz';

-- If AL's whatsapp_number was overwritten with LID, move it to wa_lid
UPDATE friends SET wa_lid = '60142544502993@lid' WHERE LOWER(name) = 'al';

COMMENT ON COLUMN friends.wa_lid IS 'WhatsApp Linked Device ID (e.g. 60142544502993@lid). Terpisah dari whatsapp_number agar tag WA tetap pakai nomor HP.';
