# SubmitSure verification server

Single-process Node.js server (no dependencies). Holds every session and its append-only event log **in process memory only** — nothing is written to disk or a database. Must run as **exactly one instance** that does not sleep.

## Run / test
```
npm start          # PORT (default 8787), SESSION_TTL_MINUTES (30), ALLOWED_ORIGIN (*)
npm test
```

## Deploy (Railway)
New project → Deploy from GitHub repo → Root directory `server` → Start command `npm start`.
Set `ALLOWED_ORIGIN` to the Lovable app URL. Keep replicas = 1. Check `GET /health`.

## API
Mutating calls require headers `X-Client-Event-Id` (dedupe) and `X-Client-Seq` (1,2,3… per session).
Optional `X-Expected-Packet-Version` for stale-write protection.

| Method | Path | Effect |
|---|---|---|
| POST | /sessions | `{application_name, requirement_set}` → create |
| GET | /sessions/:id | snapshot (no field values, no document bytes) |
| POST | /sessions/:id/documents?requirement_id=…&filename=… | raw bytes → hashed, discarded → UPLOADED |
| POST | /sessions/:id/extraction | `{fields, source}` → EXTRACTED → AWAITING_CONFIRMATION |
| POST | /sessions/:id/confirm | `{fields?}` → VERIFIED |
| PATCH | /sessions/:id/fields | edit confirmed fields → report invalidated → AWAITING_CONFIRMATION |
| PUT | /sessions/:id/requirements | new requirement-set version, report invalidated |
| POST | /sessions/:id/report | VERIFIED → REPORT_READY |
| GET | /sessions/:id/report | report with packet + requirement-set versions |
| GET | /sessions/:id/events?last_seen_sequence=N[&follow=false] | NDJSON replay then live stream |

Errors: `410 SESSION_EXPIRED` (unknown, idle past TTL, or `last_seen_sequence` ahead of server = restart),
`409 ILLEGAL_TRANSITION | OUT_OF_ORDER | STALE_CLIENT_SEQ | STALE_PACKET_VERSION`.
Every logged event carries `event_id`, `sequence_number`, `event_type`, and `timestamp`, plus the legacy aliases `sequence`, `type`, and `at`. Events also carry `server_epoch`; a changed epoch means the server restarted.
