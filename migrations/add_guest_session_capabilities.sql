ALTER TABLE chat_sessions
  ADD COLUMN guest_capability_hash CHAR(64),
  ADD COLUMN guest_capability_expires_at TIMESTAMPTZ,
  ADD COLUMN guest_capability_revoked_at TIMESTAMPTZ;

ALTER TABLE chat_sessions
  ADD CONSTRAINT chat_sessions_guest_capability_hash_format
    CHECK (guest_capability_hash IS NULL OR guest_capability_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT chat_sessions_guest_capability_expiry_pair
    CHECK (
      (guest_capability_hash IS NULL AND guest_capability_expires_at IS NULL)
      OR (guest_capability_hash IS NOT NULL AND guest_capability_expires_at IS NOT NULL)
    );
