-- Full-screen TV notifications (send now, target screens, auto-dismiss, cancel)
CREATE TABLE IF NOT EXISTS tv_notifications(
  id text PRIMARY KEY,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  category text NOT NULL,
  duration_seconds integer NOT NULL,
  play_sound boolean NOT NULL DEFAULT true,
  screen_ids jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'sent',
  alert_id text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  cancelled_by text,
  cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS tv_notifications_active ON tv_notifications(expires_at DESC) WHERE status='sent';
-- Breaking news: saved RSS/Atom feeds and the headlines shown in the TV ticker
CREATE TABLE IF NOT EXISTS news_feeds(
  id text PRIMARY KEY,
  url text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_fetched_at timestamptz
);
CREATE TABLE IF NOT EXISTS news_items(
  id text PRIMARY KEY,
  title text NOT NULL,
  source text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
INSERT INTO schema_migrations(version) VALUES(7) ON CONFLICT DO NOTHING;
