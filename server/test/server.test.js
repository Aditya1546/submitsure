import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { Store } from "../src/store.js";

let base, app, clock = Date.now();
const store = new Store({ ttlMs: 60_000, now: () => clock });

before(async () => {
  app = createApp({ store, heartbeatMs: 50 });
  await new Promise((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => { app.server.closeAllConnections(); app.server.close(); });

const RS = { id: "merit", name: "Merit", requirements: [{ id: "id-proof", label: "ID" }, { id: "marks", label: "Marksheet" }] };

function client(id) {
  let seq = 0;
  return async (method, path, body, opts = {}) => {
    const s = opts.seq ?? ++seq;
    const headers = { "X-Client-Event-Id": opts.eventId ?? `${id}-${s}-${Math.random()}`, "X-Client-Seq": String(s), ...(opts.headers || {}) };
    const isBytes = body instanceof Uint8Array;
    if (!isBytes) headers["Content-Type"] = "application/json";
    const r = await fetch(`${base}/sessions/${id}${path}`, { method, headers, body: isBytes ? body : JSON.stringify(body ?? {}) });
    return { status: r.status, body: await r.json() };
  };
}
async function newSession() {
  const r = await fetch(`${base}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ application_name: "Test", requirement_set: RS }) });
  const b = await r.json();
  return { id: b.session_id, call: client(b.session_id) };
}
async function readEvents(id, last = 0) {
  const r = await fetch(`${base}/sessions/${id}/events?last_seen_sequence=${last}&follow=false`);
  if (r.status !== 200) return { status: r.status, body: await r.json() };
  return { status: 200, events: (await r.text()).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) };
}
async function toVerified() {
  const s = await newSession();
  await s.call("POST", "/documents?requirement_id=id-proof", new Uint8Array([1, 2, 3]));
  await s.call("POST", "/extraction", { fields: { name: "A" } });
  await s.call("POST", "/confirm", {});
  return s;
}

test("full happy path walks all five states in order across separate requests", async () => {
  const s = await toVerified();
  const r = await s.call("POST", "/report", {});
  assert.equal(r.body.state, "REPORT_READY");
  const { events } = await readEvents(s.id);
  const path = events.filter((e) => e.type === "STATE_TRANSITION").map((e) => e.to);
  assert.deepEqual(path, ["UPLOADED", "EXTRACTED", "AWAITING_CONFIRMATION", "VERIFIED", "REPORT_READY"]);
});

test("illegal transitions are rejected by the server", async () => {
  const s = await newSession();
  assert.equal((await s.call("POST", "/confirm", {})).body.error, "ILLEGAL_TRANSITION");
  const s2 = await newSession();
  assert.equal((await s2.call("POST", "/report", {})).status, 409);
});

test("sequence numbers are strictly increasing with no gaps", async () => {
  const s = await toVerified();
  const { events } = await readEvents(s.id);
  events.forEach((e, i) => assert.equal(e.sequence, i + 1));
});

test("replay returns only events after last_seen_sequence", async () => {
  const s = await toVerified();
  const all = (await readEvents(s.id)).events;
  const tail = (await readEvents(s.id, 3)).events;
  assert.deepEqual(tail, all.slice(3));
});

test("duplicate command (same client_event_id) is applied once", async () => {
  const s = await newSession();
  const a = await s.call("POST", "/documents?requirement_id=id-proof", new Uint8Array([1]), { eventId: "dup-1", seq: 1 });
  const b = await s.call("POST", "/documents?requirement_id=id-proof", new Uint8Array([1]), { eventId: "dup-1", seq: 1 });
  assert.equal(b.body.duplicate, true);
  assert.equal(b.body.sequence, a.body.sequence);
  assert.equal((await readEvents(s.id)).events.filter((e) => e.type === "DOCUMENT_UPLOADED").length, 1);
});

test("out-of-order command is rejected with expected client_seq", async () => {
  const s = await newSession();
  const r = await s.call("POST", "/documents?requirement_id=id-proof", new Uint8Array([1]), { seq: 3 });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "OUT_OF_ORDER");
  assert.equal(r.body.expected_client_seq, 1);
});

test("stale packet version is rejected", async () => {
  const s = await newSession();
  await s.call("POST", "/documents?requirement_id=id-proof", new Uint8Array([1]));
  const r = await s.call("POST", "/extraction", { fields: { a: "b" } }, { headers: { "X-Expected-Packet-Version": "0" } });
  assert.equal(r.body.error, "STALE_PACKET_VERSION");
});

test("editing a confirmed field invalidates the report and bumps packet version", async () => {
  const s = await toVerified();
  const rep = await s.call("POST", "/report", {});
  const edit = await s.call("PATCH", "/fields", { fields: { name: "B" } });
  assert.equal(edit.body.state, "AWAITING_CONFIRMATION");
  assert.ok(edit.body.packet_version > rep.body.packet_version);
  const report = await (await fetch(`${base}/sessions/${s.id}/report`)).json();
  assert.equal(report.valid, false);
  assert.ok((await readEvents(s.id)).events.some((e) => e.type === "REPORT_INVALIDATED"));
});

test("report records requirement-set id and version; updating requirements bumps version", async () => {
  const s = await toVerified();
  await s.call("PUT", "/requirements", { requirement_set: { ...RS, requirements: [RS.requirements[0]] } });
  await s.call("POST", "/report", {});
  const report = await (await fetch(`${base}/sessions/${s.id}/report`)).json();
  assert.equal(report.requirement_set_id, "merit");
  assert.equal(report.requirement_set_version, 2);
});

test("unknown session returns explicit 410 SESSION_EXPIRED", async () => {
  const r = await readEvents("does-not-exist");
  assert.equal(r.status, 410);
  assert.equal(r.body.error, "SESSION_EXPIRED");
});

test("last_seen_sequence ahead of server (restart) returns SESSION_EXPIRED", async () => {
  const s = await newSession();
  const r = await readEvents(s.id, 999);
  assert.equal(r.status, 410);
  assert.equal(r.body.reason, "sequence_ahead");
});

test("idle session expires after TTL", async () => {
  const s = await newSession();
  clock += 61_000;
  assert.equal((await readEvents(s.id)).status, 410);
  clock -= 61_000;
});

test("live stream: disconnect, miss events, reconnect from last_seen gets exactly the missed ones", async () => {
  const s = await newSession();
  const ctrl = new AbortController();
  const r = await fetch(`${base}/sessions/${s.id}/events?last_seen_sequence=0`, { signal: ctrl.signal });
  assert.equal(r.headers.get("content-type"), "application/x-ndjson");
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", got = [];
  while (!got.some((e) => e.type === "REPLAY_COMPLETE")) {
    buf += dec.decode((await reader.read()).value);
    const lines = buf.split("\n"); buf = lines.pop();
    got.push(...lines.map((l) => JSON.parse(l)));
  }
  await s.call("POST", "/documents?requirement_id=id-proof", new Uint8Array([9]));
  while (!got.some((e) => e.type === "DOCUMENT_UPLOADED")) {
    buf += dec.decode((await reader.read()).value);
    const lines = buf.split("\n"); buf = lines.pop();
    got.push(...lines.filter(Boolean).map((l) => JSON.parse(l)));
  }
  const lastSeen = Math.max(...got.filter((e) => e.sequence).map((e) => e.sequence));
  ctrl.abort();
  // events happen while disconnected
  await s.call("POST", "/extraction", { fields: { x: "y" } });
  const missed = (await readEvents(s.id, lastSeen)).events;
  assert.equal(missed[0].sequence, lastSeen + 1);
  const seqs = missed.map((e) => e.sequence);
  assert.deepEqual(seqs, [...new Set(seqs)]);
});

test("document bytes are not retained, only hash and size", async () => {
  const s = await newSession();
  await s.call("POST", "/documents?requirement_id=id-proof", new TextEncoder().encode("SECRET-AADHAAR-1234"));
  const snap = JSON.stringify(await (await fetch(`${base}/sessions/${s.id}`)).json());
  const ev = JSON.stringify((await readEvents(s.id)).events);
  assert.ok(!snap.includes("SECRET") && !ev.includes("SECRET"));
});

test("field values never appear in the event log", async () => {
  const s = await newSession();
  await s.call("POST", "/documents?requirement_id=id-proof", new Uint8Array([1]));
  await s.call("POST", "/extraction", { fields: { name: "Priya Sharma" } });
  assert.ok(!JSON.stringify((await readEvents(s.id)).events).includes("Priya"));
});
