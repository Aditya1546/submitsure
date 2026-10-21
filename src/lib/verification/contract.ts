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

/** One line of the planned NDJSON stream. `sequence` is strictly increasing per session. */
export interface VerificationEvent {
  sequence: number;
  session_id: string;
  packet_version: number;
  type: "state_transition" | "extraction" | "confirmation" | "report_invalidated" | "error";
  from?: VerificationState;
  to?: VerificationState;
  at: string;
}

/** Planned endpoints (not yet implemented). */
export const PLANNED_ENDPOINTS = {
  createSession: "POST /api/sessions",
  uploadDocument: "POST /api/sessions/:id/documents",
  confirmFields: "POST /api/sessions/:id/confirm",
  eventStream: "GET /api/sessions/:id/events?last_seen_sequence=N  (application/x-ndjson)",
  report: "GET /api/sessions/:id/report",
} as const;

/** Honest connection status. Flip only when a real backend is wired and tested. */
export const BACKEND_CONNECTED = false;
