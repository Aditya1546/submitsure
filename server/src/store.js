// In-memory session store + server-enforced state machine.
// Nothing here touches disk or a database. Document bytes are hashed and discarded;
// field values live only in session memory and are dropped on expiry.
import { randomUUID, createHash } from "node:crypto";

export const STATES = ["UPLOADED", "EXTRACTED", "AWAITING_CONFIRMATION", "VERIFIED", "REPORT_READY"];

// Legal transitions. null = freshly created session (no document yet).
const TRANSITIONS = {
  null: ["UPLOADED"],
  UPLOADED: ["UPLOADED", "EXTRACTED"],
  EXTRACTED: ["AWAITING_CONFIRMATION"],
  AWAITING_CONFIRMATION: ["VERIFIED", "UPLOADED"],
  VERIFIED: ["REPORT_READY", "AWAITING_CONFIRMATION"],
  REPORT_READY: ["VERIFIED", "AWAITING_CONFIRMATION"],
};

export class ApiError extends Error {
  constructor(status, code, detail = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export class Store {
  constructor({ ttlMs = 30 * 60 * 1000, now = () => Date.now() } = {}) {
    this.sessions = new Map();
    this.ttlMs = ttlMs;
    this.now = now;
    this.epoch = randomUUID(); // changes on every process start
  }

  // ---------- session lifecycle ----------
  create({ application_name, requirement_set }) {
    if (typeof application_name !== "string" || !application_name.trim() || application_name.length > 200)
      throw new ApiError(400, "INVALID_APPLICATION_NAME");
    const rs = validateRequirementSet(requirement_set);
    const s = {
      id: randomUUID(),
      application_name: application_name.trim(),
      state: null,
      seq: 0,
      events: [],
      packet_version: 0,
      requirement_set: { ...rs, version: 1 },
      documents: new Map(), // requirement_id -> {sha256,size,filename}
      fields: null, // {name: value}
      confirmed: false,
      report: null,
      client: { last_seq: 0, ids: new Map() }, // dedupe + ordering
      listeners: new Set(),
      last_active: this.now(),
    };
    this.sessions.set(s.id, s);
    this.#emit(s, "SESSION_CREATED", { requirement_set_version: 1 });
    return s;
  }

  get(id) {
    const s = this.sessions.get(id);
    if (!s) throw new ApiError(410, "SESSION_EXPIRED", { session_id: id, server_epoch: this.epoch });
    if (this.now() - s.last_active > this.ttlMs) {
      this.expire(s);
      throw new ApiError(410, "SESSION_EXPIRED", { session_id: id, server_epoch: this.epoch });
    }
    return s;
  }

  expire(s) {
    this.sessions.delete(s.id);
    const sequence = s.seq + 1;
    const timestamp = new Date(this.now()).toISOString();
    const line = {
      event_id: randomUUID(),
      sequence_number: sequence,
      event_type: "SESSION_EXPIRED",
      timestamp,
      sequence,
      session_id: s.id,
      packet_version: s.packet_version,
      type: "SESSION_EXPIRED",
      at: timestamp,
      server_epoch: this.epoch,
    };
    for (const l of s.listeners) l(line, true);
    s.listeners.clear();
    s.fields = null;
    s.documents.clear();
  }

  sweep() {
    for (const s of [...this.sessions.values()]) if (this.now() - s.last_active > this.ttlMs) this.expire(s);
  }

  // ---------- commands (dedupe + ordering wrapper) ----------
  // Every mutating command carries client_event_id (dedupe) and client_seq (ordering).
  command(id, meta, fn) {
    const s = this.get(id);
    const { client_event_id, client_seq, expected_packet_version } = meta;
    if (typeof client_event_id !== "string" || !client_event_id || client_event_id.length > 100)
      throw new ApiError(400, "MISSING_CLIENT_EVENT_ID");
    if (s.client.ids.has(client_event_id)) return { ...s.client.ids.get(client_event_id), duplicate: true };
    if (!Number.isInteger(client_seq) || client_seq < 1) throw new ApiError(400, "INVALID_CLIENT_SEQ");
    if (client_seq <= s.client.last_seq)
      throw new ApiError(409, "STALE_CLIENT_SEQ", { expected_client_seq: s.client.last_seq + 1 });
    if (client_seq > s.client.last_seq + 1)
      throw new ApiError(409, "OUT_OF_ORDER", { expected_client_seq: s.client.last_seq + 1 });
    if (expected_packet_version !== undefined && expected_packet_version !== s.packet_version)
      throw new ApiError(409, "STALE_PACKET_VERSION", { packet_version: s.packet_version });
    const result = fn(s);
    s.client.last_seq = client_seq;
    const out = { ...result, ...this.summary(s) };
    s.client.ids.set(client_event_id, out);
    s.last_active = this.now();
    return out;
  }

  uploadDocument(s, { requirement_id, filename, bytes }) {
    if (!s.requirement_set.requirements.some((r) => r.id === requirement_id))
      throw new ApiError(400, "UNKNOWN_REQUIREMENT", { requirement_id });
    if (!bytes || bytes.length === 0) throw new ApiError(400, "EMPTY_DOCUMENT");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    // bytes are not retained beyond this call
    s.documents.set(requirement_id, { filename: String(filename || "document").slice(0, 200), size: bytes.length, sha256 });
    if (s.state !== "UPLOADED") this.#transition(s, "UPLOADED");
    this.#bumpPacket(s, "document_uploaded");
    this.#emit(s, "DOCUMENT_UPLOADED", { requirement_id, size: bytes.length, sha256 });
    return {};
  }

  // Manual-fallback extraction (AI extraction will feed the same path after schema validation).
  submitExtraction(s, { fields, source }) {
    if (s.state !== "UPLOADED") throw this.#illegal(s, "EXTRACTED");
    const clean = validateFields(fields);
    s.fields = clean;
    s.confirmed = false;
    this.#transition(s, "EXTRACTED", { source: source === "ai" ? "ai" : "manual", field_names: Object.keys(clean) });
    this.#transition(s, "AWAITING_CONFIRMATION");
    this.#bumpPacket(s, "fields_extracted");
    return {};
  }

  confirmFields(s, { fields }) {
    if (s.state !== "AWAITING_CONFIRMATION") throw this.#illegal(s, "VERIFIED");
    if (fields !== undefined) s.fields = validateFields(fields);
    s.confirmed = true;
    this.#bumpPacket(s, "fields_confirmed");
    this.#transition(s, "VERIFIED");
    return {};
  }

  // Editing confirmed fields invalidates any report and requires re-confirmation.
  editFields(s, { fields }) {
    if (s.state !== "VERIFIED" && s.state !== "REPORT_READY") throw new ApiError(409, "FIELDS_NOT_CONFIRMED", { state: s.state });
    s.fields = { ...s.fields, ...validateFields(fields) };
    s.confirmed = false;
    this.#invalidateReport(s, "confirmed_field_edited");
    this.#bumpPacket(s, "confirmed_field_edited");
    this.#transition(s, "AWAITING_CONFIRMATION");
    return {};
  }

  updateRequirements(s, { requirement_set }) {
    const rs = validateRequirementSet(requirement_set);
    s.requirement_set = { ...rs, version: s.requirement_set.version + 1 };
    this.#invalidateReport(s, "requirement_set_changed");
    this.#bumpPacket(s, "requirement_set_changed");
    this.#emit(s, "REQUIREMENT_SET_UPDATED", { requirement_set_version: s.requirement_set.version });
    if (s.state === "REPORT_READY") this.#transition(s, "VERIFIED");
    return {};
  }

  generateReport(s) {
    if (s.state !== "VERIFIED") throw this.#illegal(s, "REPORT_READY");
    const findings = s.requirement_set.requirements.map((r) => {
      const doc = s.documents.get(r.id);
      if (!doc) return { requirement_id: r.id, label: r.label, status: "needs_review", evidence: "No document uploaded", next_action: `Upload ${r.label}` };
      return {
        requirement_id: r.id,
        label: r.label,
        status: "cannot_verify",
        evidence: `Document received (sha256 ${doc.sha256.slice(0, 12)}…, ${doc.size} bytes); content authenticity requires manual check`,
        next_action: `Confirm ${r.label} is the original issued document`,
      };
    });
    s.report = {
      packet_version: s.packet_version,
      requirement_set_id: s.requirement_set.id,
      requirement_set_version: s.requirement_set.version,
      generated_at: new Date(this.now()).toISOString(),
      valid: true,
      findings,
    };
    this.#transition(s, "REPORT_READY", { packet_version: s.packet_version });
    return {};
  }

  // ---------- events ----------
  replay(s, lastSeen) {
    if (!Number.isInteger(lastSeen) || lastSeen < 0) throw new ApiError(400, "INVALID_LAST_SEEN_SEQUENCE");
    // Client knows more events than exist → it saw a previous server lifetime.
    if (lastSeen > s.seq) throw new ApiError(410, "SESSION_EXPIRED", { reason: "sequence_ahead", server_epoch: this.epoch });
    return s.events.filter((e) => e.sequence > lastSeen);
  }

  subscribe(s, fn) {
    s.listeners.add(fn);
    return () => s.listeners.delete(fn);
  }

  summary(s) {
    return {
      session_id: s.id,
      state: s.state,
      sequence: s.seq,
      packet_version: s.packet_version,
      requirement_set_version: s.requirement_set.version,
      server_epoch: this.epoch,
    };
  }

  snapshot(s) {
    return {
      ...this.summary(s),
      application_name: s.application_name,
      requirement_set: s.requirement_set,
      documents: Object.fromEntries([...s.documents].map(([k, v]) => [k, { size: v.size, sha256: v.sha256 }])),
      field_names: s.fields ? Object.keys(s.fields) : [],
      confirmed: s.confirmed,
      expected_client_seq: s.client.last_seq + 1,
    };
  }

  #emit(s, type, data = {}) {
    const sequence = ++s.seq;
    const timestamp = new Date(this.now()).toISOString();
    const ev = {
      event_id: randomUUID(),
      sequence_number: sequence,
      event_type: type,
      timestamp,
      // Keep the original names for existing clients.
      sequence,
      session_id: s.id,
      packet_version: s.packet_version,
      type,
      at: timestamp,
      server_epoch: this.epoch,
      ...data,
    };
    Object.freeze(ev);
    s.events.push(ev); // append-only
    for (const l of s.listeners) l(ev, false);
    return ev;
  }

  #transition(s, to, data = {}) {
    if (!(TRANSITIONS[s.state] || []).includes(to)) throw this.#illegal(s, to);
    const from = s.state;
    s.state = to;
    this.#emit(s, "STATE_TRANSITION", { from, to, ...data });
  }

  #bumpPacket(s, reason) {
    s.packet_version++;
    this.#emit(s, "PACKET_VERSION", { reason });
  }

  #invalidateReport(s, reason) {
    if (s.report?.valid) {
      s.report = { ...s.report, valid: false };
      this.#emit(s, "REPORT_INVALIDATED", { reason, report_packet_version: s.report.packet_version });
    }
  }

  #illegal(s, to) {
    return new ApiError(409, "ILLEGAL_TRANSITION", { from: s.state, to });
  }
}

function validateRequirementSet(rs) {
  if (!rs || typeof rs !== "object") throw new ApiError(400, "INVALID_REQUIREMENT_SET");
  const { id, name, requirements } = rs;
  if (typeof id !== "string" || !id || id.length > 100) throw new ApiError(400, "INVALID_REQUIREMENT_SET");
  if (!Array.isArray(requirements) || requirements.length === 0 || requirements.length > 50)
    throw new ApiError(400, "INVALID_REQUIREMENT_SET");
  const seen = new Set();
  const reqs = requirements.map((r) => {
    if (!r || typeof r.id !== "string" || !r.id || typeof r.label !== "string" || !r.label || seen.has(r.id))
      throw new ApiError(400, "INVALID_REQUIREMENT_SET");
    seen.add(r.id);
    return { id: r.id.slice(0, 100), label: r.label.slice(0, 200), description: String(r.description ?? "").slice(0, 500) };
  });
  return { id, name: String(name ?? id).slice(0, 200), requirements: reqs };
}

function validateFields(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new ApiError(400, "INVALID_FIELDS");
  const entries = Object.entries(fields);
  if (entries.length === 0 || entries.length > 100) throw new ApiError(400, "INVALID_FIELDS");
  for (const [k, v] of entries) if (!k || k.length > 100 || typeof v !== "string" || v.length > 1000) throw new ApiError(400, "INVALID_FIELDS");
  return Object.fromEntries(entries);
}
