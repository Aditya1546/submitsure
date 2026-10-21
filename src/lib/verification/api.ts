import type { RequirementSet } from "@/lib/requirements";
import type { VerificationState } from "@/lib/verification/contract";

export const API_BASE_URL = "https://submitsure.onrender.com";

export interface SessionSnapshot {
  session_id: string;
  state: VerificationState | null;
  sequence: number;
  packet_version: number;
  requirement_set_version: number;
  server_epoch: string;
  application_name: string;
  requirement_set: RequirementSet & { version: number };
  documents: Record<string, { size: number; sha256: string }>;
  field_names: string[];
  confirmed: boolean;
  expected_client_seq: number;
}

export interface ReadinessFinding {
  requirement_id: string;
  label: string;
  status: "verified" | "needs_review" | "cannot_verify";
  evidence: string;
  next_action: string;
}

export interface ReadinessReport {
  packet_version: number;
  current_packet_version: number;
  requirement_set_id: string;
  requirement_set_version: number;
  generated_at: string;
  valid: boolean;
  findings: ReadinessFinding[];
}

export interface VerificationEvent extends Record<string, unknown> {
  event_id: string;
  sequence_number: number;
  event_type: string;
  timestamp: string;
  session_id: string;
  packet_version: number;
  /** Compatibility aliases retained by the API. */
  sequence: number;
  type: string;
  at: string;
  from?: string | null;
  to?: string | null;
}

export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "BackendError";
  }
}

export function mutationHeaders(
  eventId: string,
  sequence: number,
  packetVersion: number,
): Record<string, string> {
  return {
    "X-Client-Event-Id": eventId,
    "X-Client-Seq": String(sequence),
    "X-Expected-Packet-Version": String(packetVersion),
  };
}

export function classifyEventSequence(
  lastSeen: number,
  received: number,
): "duplicate" | "next" | "gap" {
  if (received <= lastSeen) return "duplicate";
  return received === lastSeen + 1 ? "next" : "gap";
}

export function normalizeEvent(value: unknown): VerificationEvent {
  if (!value || typeof value !== "object") {
    throw new Error("The backend sent an invalid event.");
  }

  const raw = value as Record<string, unknown>;
  const sequence = Number(raw["sequence_number"] ?? raw["sequence"]);
  const type = raw["event_type"] ?? raw["type"];
  const timestamp = raw["timestamp"] ?? raw["at"];
  const sessionId = raw["session_id"];
  const packetVersion = Number(raw["packet_version"]);
  const eventId = raw["event_id"];
  const from = raw["from"];
  const to = raw["to"];

  if (
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    typeof type !== "string" ||
    typeof timestamp !== "string" ||
    typeof sessionId !== "string" ||
    !Number.isInteger(packetVersion)
  ) {
    throw new Error("The backend sent an incomplete event.");
  }

  return {
    ...raw,
    event_id: typeof eventId === "string" ? eventId : `${sessionId}:${sequence}`,
    sequence_number: sequence,
    event_type: type,
    timestamp,
    session_id: sessionId,
    packet_version: packetVersion,
    sequence,
    type,
    at: timestamp,
    ...(typeof from === "string" || from === null ? { from } : {}),
    ...(typeof to === "string" || to === null ? { to } : {}),
  };
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const code = typeof detail["error"] === "string" ? detail["error"] : "REQUEST_FAILED";
    throw new BackendError(errorMessage(code, detail), response.status, code, detail);
  }

  return body as T;
}

export async function readEventStream(
  sessionId: string,
  lastSeenSequence: number,
  signal: AbortSignal,
  onEvent: (event: VerificationEvent) => void,
  onConnected: () => void,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/events?last_seen_sequence=${lastSeenSequence}`,
    { headers: { Accept: "application/x-ndjson" }, signal },
  );

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const code = typeof detail["error"] === "string" ? detail["error"] : "STREAM_FAILED";
    throw new BackendError(errorMessage(code, detail), response.status, code, detail);
  }
  if (!response.body) throw new Error("The backend did not provide an event stream.");
  onConnected();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const processLine = (line: string) => {
    if (!line.trim()) return;
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object") {
      throw new Error("The backend sent an invalid stream line.");
    }
    const controlType = (value as Record<string, unknown>)["type"];
    if (controlType === "REPLAY_COMPLETE" || controlType === "HEARTBEAT") return;
    if (controlType === "SESSION_EXPIRED") {
      throw new BackendError(
        "This session expired or the server restarted. Create a new session to continue.",
        410,
        "SESSION_EXPIRED",
      );
    }
    onEvent(normalizeEvent(value));
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) processLine(line);
      if (done) {
        if (pending.trim()) processLine(pending);
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function errorMessage(code: string, detail: Record<string, unknown>): string {
  if (code === "SESSION_EXPIRED") {
    return "This session expired or the server restarted. Create a new session to continue.";
  }
  if (code === "STALE_PACKET_VERSION") {
    return "The packet changed on the server. The latest session state has been loaded; please try again.";
  }
  if (code === "OUT_OF_ORDER" || code === "STALE_CLIENT_SEQ") {
    return "The session changed while this request was being sent. The latest session state has been loaded; please try again.";
  }
  const reason = typeof detail["reason"] === "string" ? ` (${detail["reason"]})` : "";
  return `${code.replaceAll("_", " ")}${reason}.`;
}
