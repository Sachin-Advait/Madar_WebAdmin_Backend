-- SQL remains the transactional outbox and the authoritative device-ACK ledger.
-- Redis entries are linked after XADD; a crash in between can create a harmless
-- duplicate, identified by delivery ID. Never use Redis IDs as TV credentials.
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS stream_id text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS stream_enqueued_at timestamptz;
CREATE INDEX IF NOT EXISTS deliveries_stream_outbox ON deliveries(id)
  WHERE stream_id IS NULL AND status IN ('pending','received','downloaded','failed');
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
