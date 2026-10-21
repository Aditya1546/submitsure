// HTTP layer: plain node:http, no dependencies. NDJSON streaming for events.
import http from "node:http";
import { ApiError, Store } from "./store.js";

const MAX_BODY = 10 * 1024 * 1024;

export function createApp({ store = new Store(), allowedOrigin = "*", heartbeatMs = 15000 } = {}) {
  const cors = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Client-Event-Id,X-Client-Seq,X-Expected-Packet-Version",
    "Access-Control-Expose-Headers": "X-Server-Epoch",
  };
  const send = (res, status, body) => {
    res.writeHead(status, { ...cors, "Content-Type": "application/json", "X-Server-Epoch": store.epoch });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
      const url = new URL(req.url, "http://x");
      const parts = url.pathname.split("/").filter(Boolean);

      if (req.method === "GET" && url.pathname === "/health")
        return send(res, 200, { ok: true, server_epoch: store.epoch, sessions: store.sessions.size });

      if (parts[0] !== "sessions") throw new ApiError(404, "NOT_FOUND");

      if (parts.length === 1 && req.method === "POST") {
        const s = store.create(await readJson(req));
        return send(res, 201, store.summary(s));
      }

      const id = parts[1];
      const action = parts[2];

      if (!action && req.method === "GET") return send(res, 200, store.snapshot(store.get(id)));
      if (action === "events" && req.method === "GET") return streamEvents(req, res, url, id);
      if (action === "report" && req.method === "GET") {
        const s = store.get(id);
        if (!s.report) throw new ApiError(404, "NO_REPORT");
        return send(res, 200, { ...s.report, current_packet_version: s.packet_version });
      }

      const meta = {
        client_event_id: req.headers["x-client-event-id"],
        client_seq: toInt(req.headers["x-client-seq"]),
        expected_packet_version: req.headers["x-expected-packet-version"] === undefined ? undefined : toInt(req.headers["x-expected-packet-version"]),
      };

      if (action === "documents" && req.method === "POST") {
        const bytes = await readBody(req);
        const out = store.command(id, meta, (s) =>
          store.uploadDocument(s, { requirement_id: url.searchParams.get("requirement_id"), filename: url.searchParams.get("filename"), bytes }),
        );
        return send(res, out.duplicate ? 200 : 201, out);
      }

      const handlers = {
        "POST extraction": (s, b) => store.submitExtraction(s, b),
        "POST confirm": (s, b) => store.confirmFields(s, b),
        "PATCH fields": (s, b) => store.editFields(s, b),
        "PUT requirements": (s, b) => store.updateRequirements(s, b),
        "POST report": (s) => store.generateReport(s),
      };
      const h = handlers[`${req.method} ${action}`];
      if (!h) throw new ApiError(404, "NOT_FOUND");
      const body = await readJson(req);
      return send(res, 200, store.command(id, meta, (s) => h(s, body)));
    } catch (err) {
      if (err instanceof ApiError) return send(res, err.status, { error: err.code, ...err.detail });
      console.error(err);
      return send(res, 500, { error: "INTERNAL" });
    }
  });

  function streamEvents(req, res, url, id) {
    const s = store.get(id);
    const lastSeen = toInt(url.searchParams.get("last_seen_sequence") ?? "0");
    const backlog = store.replay(s, lastSeen);
    res.writeHead(200, {
      ...cors,
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Server-Epoch": store.epoch,
      Connection: "keep-alive",
    });
    const write = (obj) => res.write(JSON.stringify(obj) + "\n");
    let sent = lastSeen;
    for (const ev of backlog) { write(ev); sent = ev.sequence; }
    if (url.searchParams.get("follow") === "false") return res.end();
    write({ type: "REPLAY_COMPLETE", last_sequence: sent, server_epoch: store.epoch });
    const unsub = store.subscribe(s, (ev, final) => {
      if (!final && ev.sequence <= sent) return; // never send a duplicate
      if (!final) sent = ev.sequence;
      write(ev);
      if (final) cleanup(true);
    });
    const hb = setInterval(() => write({ type: "HEARTBEAT", last_sequence: sent }), heartbeatMs);
    function cleanup(end) { clearInterval(hb); unsub(); if (end) res.end(); }
    req.on("close", () => cleanup(false));
  }

  const sweeper = setInterval(() => store.sweep(), 60000);
  sweeper.unref();
  server.on("close", () => clearInterval(sweeper));
  return { server, store };
}

function toInt(v) {
  if (v === undefined || v === null || !/^-?\d+$/.test(String(v))) return NaN;
  return Number(v);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new ApiError(413, "PAYLOAD_TOO_LARGE")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (buf.length === 0) return {};
  try { return JSON.parse(buf.toString("utf8")); } catch { throw new ApiError(400, "INVALID_JSON"); }
}
