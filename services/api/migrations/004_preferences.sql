ALTER TABLE screens ADD COLUMN IF NOT EXISTS preferences_epoch bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS device_progress (
 screen_id text NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('videos','replay')),
 resource_id text NOT NULL,
 media_revision text NOT NULL,
 position_seconds double precision NOT NULL DEFAULT 0 CHECK(position_seconds>=0),
 duration_seconds double precision NOT NULL DEFAULT 0 CHECK(duration_seconds>=0),
 watched_seconds double precision NOT NULL DEFAULT 0 CHECK(watched_seconds>=0),
 completed boolean NOT NULL DEFAULT false,
 session_id text NOT NULL,
 session_version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(screen_id,kind,resource_id,media_revision),
 FOREIGN KEY(kind,resource_id) REFERENCES resources(kind,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS device_progress_retention ON device_progress(updated_at);
CREATE TABLE IF NOT EXISTS playback_sessions (
 id text PRIMARY KEY,
 screen_id text NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('videos','replay')),
 resource_id text NOT NULL,
 media_revision text NOT NULL,
 session_version integer NOT NULL,
 last_sequence integer NOT NULL DEFAULT 0,
 last_payload jsonb,
 last_position double precision,
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '8 hours',
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(kind,resource_id) REFERENCES resources(kind,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS playback_sessions_device ON playback_sessions(screen_id,created_at DESC);
CREATE INDEX IF NOT EXISTS playback_sessions_expiry ON playback_sessions(expires_at);
INSERT INTO schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
