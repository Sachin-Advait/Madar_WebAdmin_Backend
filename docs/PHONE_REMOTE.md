# Phone remote (MADAR Control Centre)

Staff phones control a TV with eight keys: up, down, left, right, ok, back, home, playPause.
Everything runs inside the MADAR API; there is no separate relay server.

## Pairing

1. Show a code on the TV: Admin Studio → Phone Remotes → Show code on TV (`POST /api/admin/screens/:id/remote-code`, also returns the code to the admin), or press Menu on the TV's own remote. The TV calls `POST /api/app/remote/code` (X-Screen-Key) and shows a 6-digit code for 120 s. A new code replaces the old one; codes are single-use.
2. Phone: enters the code. `POST /api/remote/pair {code, label}` returns `{token, pairingId, status, tvId, tvName, expiresAt, online}`. The token is secret; the phone keeps it in secure storage. Wrong codes are rate-limited (10 per minute per IP).
3. Admin Studio → Phone Remotes: approve or reject (pending requests expire after 5 minutes). Approved phones work for `MADAR_REMOTE_GRANT_HOURS` (default 12), then pair again. Revoke at any time.
   Set `MADAR_REMOTE_APPROVAL=0` to skip approval (a correct code activates the phone at once).

Phone REST helpers: `GET /api/remote/session` and `POST /api/remote/unpair` with `Authorization: Bearer <token>`.

## Sockets (Socket.IO, websocket transport)

Phone → namespace `/remote`, `auth: {token}`.
- Server → phone `status`: `{pairingId, status: pending|active|ended, reason, tvId, tvName, label, expiresAt, online}` on connect, on approval/rejection/revocation and when the TV goes on- or offline. After `ended` the socket is closed.
- Phone → server `command` `{id, action}` with ack → `{id, applied, blocked, unavailable, total}` or `{error}`. Max 35 per second.
- Phone → server `unpair` with ack.

TV → default namespace (`auth: {deviceKey}`, as for `sync-required`).
- Server → TV `remote-command` `{id, action, expiresAt}` with ack. The TV ignores it after `expiresAt` (2.5 s) and answers `{outcome: "applied"|"blocked"}`.
- Server → TV `remote-code` `{code, ttl}` when an admin shows a code from Admin Studio.
- Server → TV `remote-paired` `{approvalPending, label}` when a phone used the TV's code (the TV hides the code).

Admin: `GET /api/admin/remote-pairings`, `POST /api/admin/remote-pairings/:id/approve|reject|revoke` (admin role).

Tables: `remote_codes`, `remote_pairings` (migration 008). Tests: `services/api/tests/remote-control.test.mjs`.
