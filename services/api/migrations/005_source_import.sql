CREATE TABLE IF NOT EXISTS source_imports (
  id text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS source_bindings (
  source_id text NOT NULL REFERENCES source_imports(id),
  kind text NOT NULL,
  external_id text NOT NULL,
  resource_id text NOT NULL,
  last_imported jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY(source_id,kind,external_id),
  FOREIGN KEY(kind,resource_id) REFERENCES resources(kind,id) ON DELETE CASCADE,
  UNIQUE(kind,resource_id)
);
-- References are immutable hashes of source + URL. A draft refresh cannot silently
-- redirect an already published stream. URLs are never included in TV releases.
CREATE TABLE IF NOT EXISTS source_media (
  reference text PRIMARY KEY,
  source_id text NOT NULL REFERENCES source_imports(id),
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS source_media_source ON source_media(source_id);
INSERT INTO schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
