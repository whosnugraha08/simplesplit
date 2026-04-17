-- ============================================
-- SimpleSplit v2 — Migrate Existing Friends to Users
-- Default PIN: 1234
-- ============================================

-- Enable pgcrypto for SHA-256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a user account for each existing friend that doesn't have one yet
-- PIN default: "1234" (hashed with same method as JS: SHA-256 of "pin_simplesplit_salt_2024")
DO $$
DECLARE
  friend_row RECORD;
  new_user_id UUID;
  default_pin_hash TEXT;
  base_username TEXT;
  final_username TEXT;
  counter INTEGER;
BEGIN
  -- Compute hash of default PIN "1234" with the same salt as the JS code
  default_pin_hash := encode(digest('1234_simplesplit_salt_2024', 'sha256'), 'hex');

  FOR friend_row IN 
    SELECT id, name FROM friends WHERE user_id IS NULL
  LOOP
    -- Generate username from name: lowercase, remove spaces, append number if duplicate
    base_username := lower(regexp_replace(friend_row.name, '[^a-zA-Z0-9]', '', 'g'));
    
    -- Handle empty username
    IF base_username = '' OR base_username IS NULL THEN
      base_username := 'user';
    END IF;
    
    final_username := base_username;
    counter := 1;
    
    -- Ensure unique username
    WHILE EXISTS (SELECT 1 FROM users WHERE username = final_username) LOOP
      final_username := base_username || counter::TEXT;
      counter := counter + 1;
    END LOOP;

    -- Create user
    new_user_id := gen_random_uuid();
    INSERT INTO users (id, username, pin_hash, display_name)
    VALUES (new_user_id, final_username, default_pin_hash, friend_row.name);

    -- Link friend to user
    UPDATE friends SET user_id = new_user_id WHERE id = friend_row.id;

    RAISE NOTICE 'Created user: % (username: %, friend: %)', friend_row.name, final_username, friend_row.id;
  END LOOP;
END $$;
