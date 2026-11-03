CREATE TABLE IF NOT EXISTS content_types(kind text PRIMARY KEY,fields jsonb NOT NULL DEFAULT '[]',revision integer NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS masters(kind text NOT NULL,id text NOT NULL,payload jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS favourites(screen_id text NOT NULL REFERENCES screens(id) ON DELETE CASCADE,kind text NOT NULL,resource_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(screen_id,kind,resource_id),FOREIGN KEY(kind,resource_id) REFERENCES resources(kind,id) ON DELETE CASCADE);
INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
