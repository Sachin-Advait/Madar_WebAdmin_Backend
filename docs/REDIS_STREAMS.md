# Redis Streams delivery — MADAR 2.1

Production uses Redis Streams consumer groups for per-TV delivery. PostgreSQL remains the transactional outbox, release store and authoritative device acknowledgement ledger. TVs connect to the Node API and Socket.IO, never directly to Redis.

## Processing and acknowledgement

1. Publication saves an immutable release and a delivery row for every assigned TV in one PostgreSQL transaction. No Redis operation occurs inside the publication request.
2. The relay locks unqueued rows with FOR UPDATE SKIP LOCKED, writes one XADD entry per delivery, and records its stream ID in SQL. A crash between XADD and the SQL commit can produce a duplicate; delivery identity and conditional SQL updates make that safe.
3. Workers use XREADGROUP with unique consumer names and send sync-required to the correct TV. The Socket.IO Redis adapter still distributes notification hints between API nodes.
4. TVs fetch /api/app/sync, verify the content, and call /api/app/ack. Received and Downloaded leave the Redis message pending.
5. After Applied commits to PostgreSQL, a worker retires the entry using XACK and XDEL in one Lua operation, normally on the next worker cycle. Redis retirement is separate from the TV HTTP response transaction.

| SQL/device state | Redis treatment |
|---|---|
| Pending, Received, Downloaded, Failed | Keep pending and retry according to SQL backoff |
| Applied | XACK and remove the completed entry |
| Superseded, disabled TV, assignment replaced | XACK and remove as cancellation; never mark the TV Applied |
| Invalid envelope or mismatched delivery identity | Add a bounded dead-letter diagnostic, then XACK and remove |

Each entry includes schemaVersion, deliveryId, screenId and releaseId. It contains no device credential or media URL. Workers consume on behalf of TVs; one TV's acknowledgement cannot complete another TV's work.

## Recovery

- Retry delays are 5, 10, 20, 40, 80, 160 and then 300 seconds. A valid offline TV's update is not discarded after a fixed retry count.
- XAUTOCLAIM recovers entries idle for at least 60 seconds, including stopped-worker work. Own pending scans use a cursor so an offline device cannot starve later acknowledgements.
- If Redis is unavailable while the API is running, publication and TV ACKs can still commit to PostgreSQL. TVs also poll every 30 seconds. Redis retirement resumes after recovery.
- Lost streams/groups are recreated and pending SQL work is replayed. Reconciliation checks missing individual entries in bounded pages of 100 per cycle, repeating a complete scan every 30 seconds.
- Active entries are never truncated with MAXLEN. Terminal entries are removed individually. The diagnostic dead-letter stream is bounded to approximately 1,000 entries.
- Duplicate ACKs and duplicate stream deliveries are safe. Superseded release acknowledgements are rejected.

The guarantee is retry and eventual reconciliation when the services, network and compatible TV recover. Applied confirms the TV application's renderer callback, not independent physical-panel output.

## Configuration and migration

- Production requires REDIS_URL and fails startup explicitly if it is absent. Redis 6.2+ is required for XAUTOCLAIM; Compose uses Redis 8.
- The dedicated default stream is `madar:{delivery}:updates`; its single consumer group is `madar-dispatchers`. REDIS_DELIVERY_STREAM may override the key. All API nodes must agree. Retain a hash tag for Redis Cluster so the stream and its `:dead` key share a slot.
- Do not add another group to this dedicated stream: terminal cleanup removes entries. Changing the stream requires draining or intentionally retiring the old stream and redeploying nodes consistently.
- Compose enables AOF, appendfsync everysec, a persistent volume and noeviction. SQL reconciliation recovers missing pending work after Redis data loss. Keep Redis private and size memory for the fleet and outage duration.
- Migration 002_redis_delivery_stream.sql adds stream_id and stream_enqueued_at while preserving delivery history. Existing pending rows are queued automatically. Device API and bundle schema remain version 1.
- Development without REDIS_URL retains the SQL-only demo worker. Health explicitly reports sql-development or redis-streams. Production never silently selects the development worker.

## Tests and operations

Run `npm test`, then set TEST_REDIS_URL to a dedicated test Redis service and run `npm run test:redis`. The integration suite fails explicitly if TEST_REDIS_URL is missing. Set TEST_DATABASE_URL to a dedicated PostgreSQL test database to exercise PostgreSQL instead of PGlite; tests create and remove only generated schemas. Redis cleanup touches only random test keys.

PowerShell example: `$env:TEST_REDIS_URL='redis://127.0.0.1:6379/15'`, followed by `npm run test:redis`.

The 15 Redis integration cases cover per-TV pending entries, ACK stage ordering and identity, duplicate ACKs, failed delivery, stopped-worker reclaim, XADD/SQL crash recovery, ACK recovery after Redis outage, stream loss, missing entries, superseded releases, revoked/re-enabled screens, pagination fairness, quarantine, publication rollback and notification failure.

Inspect XPENDING, XINFO GROUPS and XINFO CONSUMERS for the stream/group above. Monitor pending age, retry attempts, failed TVs, Redis memory/AOF health and worker errors. Remove old consumers only when they have zero pending work. SQL delivery and acknowledgement history remains after Redis entries are removed.

Local verification used a checksum-verified Redis 8.10.3 Windows community build from https://github.com/redis-windows/redis-windows/releases/tag/8.10.3 and PGlite for SQL. A separate actual Redis stop/start check verified AOF pending-entry recovery, reclaim and XACK. CI includes Redis 8 and PostgreSQL 18; that Linux workflow and the full production deployment have not been executed here.
