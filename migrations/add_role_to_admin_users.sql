-- Drop the old table and recreate cleanly.
-- Run this in your Neon SQL Editor (console.neon.tech → SQL Editor)

DROP TABLE IF EXISTS admin_users;

CREATE TABLE admin_users (
  id                   SERIAL PRIMARY KEY,
  owner_clerk_user_id  TEXT NOT NULL,
  invited_email        TEXT NOT NULL,
  role                 VARCHAR(20) NOT NULL DEFAULT 'viewer'
                         CHECK (role IN ('editor', 'viewer')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_clerk_user_id, invited_email)
);

CREATE INDEX admin_users_email_idx ON admin_users (invited_email);
