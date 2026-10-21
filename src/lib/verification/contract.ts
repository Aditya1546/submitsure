/**
 * Verification backend contract — INTEGRATION POINT.
 *
 * These types describe the backend-enforced state machine and event stream.
 * Nothing here executes transitions: the server is the only authority.
 * The frontend must render whatever the backend reports, never advance state itself.
 */

export const VERIFICATION_STATES = [
  "UPLOADED",
  "EXTRACTED",
  "AWAITING_CONFIRMATION",
  "VERIFIED",
  "REPORT_READY",
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

export type FindingStatus = "verified" | "needs_review" | "cannot_verify";

/** One line of the NDJSON stream. Both required names and compatibility aliases are exposed. */
export interface VerificationEvent {
  event_id: string;
  sequence_number: number;
  event_type: string;
  timestamp: string;
  /** Compatibility aliases. */
  sequence: number;
  session_id: string;
  packet_version: number;
  type: string;
  from?: VerificationState;
  to?: VerificationState;
  at: string;
}

/** Endpoints provided by the verification server. */
export const PLANNED_ENDPOINTS = {
  createSession: "POST /sessions",
  uploadDocument: "POST /sessions/:id/documents",
  submitFields: "POST /sessions/:id/extraction",
  confirmFields: "POST /sessions/:id/confirm",
  eventStream: "GET /sessions/:id/events?last_seen_sequence=N  (application/x-ndjson)",
  generateReport: "POST /sessions/:id/report",
  report: "GET /sessions/:id/report",
} as const;
