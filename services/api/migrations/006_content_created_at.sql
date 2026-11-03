-- Preserve insertion time for Recently added; updating a title must not reorder it.
ALTER TABLE resources ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE resources SET created_at=updated_at WHERE created_at IS NULL;
ALTER TABLE resources ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE resources ALTER COLUMN created_at SET NOT NULL;
INSERT INTO schema_migrations(version) VALUES(6) ON CONFLICT DO NOTHING;
