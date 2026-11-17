-- Phone remote ("Control Centre"): six-digit codes shown on a TV, and the
-- phones paired with a TV (pending admin approval, active, or ended).
CREATE TABLE IF NOT EXISTS remote_codes(
  screen_id text PRIMARY KEY REFERENCES screens(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS remote_pairings(
  id text PRIMARY KEY,
  screen_id text NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  status text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  decided_by text,
  ended_at timestamptz,
  end_reason text
);
CREATE INDEX IF NOT EXISTS remote_pairings_open ON remote_pairings(screen_id) WHERE status IN ('pending','active');
