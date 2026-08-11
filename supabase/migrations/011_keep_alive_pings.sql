-- Keep-alive pings table for preventing Supabase project pause
-- This table stores periodic ping records to maintain write activity
CREATE TABLE IF NOT EXISTS keep_alive_pings (
  id TEXT PRIMARY KEY,
  pinged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow anon users to insert/select/delete (needed for the keep-alive endpoint)
ALTER TABLE keep_alive_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert on keep_alive_pings"
  ON keep_alive_pings FOR INSERT
  TO anon WITH CHECK (true);

CREATE POLICY "Allow anon select on keep_alive_pings"
  ON keep_alive_pings FOR SELECT
  TO anon USING (true);

CREATE POLICY "Allow anon delete on keep_alive_pings"
  ON keep_alive_pings FOR DELETE
  TO anon USING (true);
