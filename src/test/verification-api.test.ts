import { describe, expect, it } from "vitest";
import { classifyEventSequence, mutationHeaders, normalizeEvent } from "@/lib/verification/api";

describe("verification API helpers", () => {
  it("sends all required headers on mutating requests", () => {
    expect(mutationHeaders("evt-1", 3, 8)).toEqual({
      "X-Client-Event-Id": "evt-1",
      "X-Client-Seq": "3",
      "X-Expected-Packet-Version": "8",
    });
  });

  it("normalizes the required event names and preserves the aliases", () => {
    const normalized = normalizeEvent({
      event_id: "evt-1",
      sequence_number: 2,
      event_type: "STATE_TRANSITION",
      timestamp: "2026-10-21T00:00:00.000Z",
      sequence: 2,
      type: "STATE_TRANSITION",
      at: "2026-10-21T00:00:00.000Z",
      session_id: "session-1",
      packet_version: 4,
    });

    expect(normalized.sequence_number).toBe(2);
    expect(normalized.event_type).toBe("STATE_TRANSITION");
    expect(normalized.timestamp).toBe("2026-10-21T00:00:00.000Z");
    expect(normalized.sequence).toBe(2);
    expect(normalized.type).toBe("STATE_TRANSITION");
    expect(normalized.at).toBe("2026-10-21T00:00:00.000Z");
  });

  it("accepts event names from a backend that only sends legacy aliases", () => {
    const normalized = normalizeEvent({
      sequence: 1,
      type: "SESSION_CREATED",
      at: "2026-10-21T00:00:00.000Z",
      session_id: "session-1",
      packet_version: 0,
    });

    expect(normalized.event_id).toBe("session-1:1");
    expect(normalized.sequence_number).toBe(1);
    expect(normalized.event_type).toBe("SESSION_CREATED");
    expect(normalized.timestamp).toBe("2026-10-21T00:00:00.000Z");
  });

  it("ignores duplicate sequence numbers and detects replay gaps", () => {
    expect(classifyEventSequence(5, 5)).toBe("duplicate");
    expect(classifyEventSequence(5, 4)).toBe("duplicate");
    expect(classifyEventSequence(5, 6)).toBe("next");
    expect(classifyEventSequence(5, 7)).toBe("gap");
  });
});
