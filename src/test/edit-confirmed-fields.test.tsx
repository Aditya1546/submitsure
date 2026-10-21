import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmedFieldsEditor, validateFieldDraft } from "@/components/ConfirmedFieldsEditor";
import { API_BASE_URL, type ReadinessReport, type SessionSnapshot } from "@/lib/verification/api";
import { useVerification, VerificationProvider } from "@/lib/verification/VerificationProvider";

const SESSION_ID = "synthetic-session-1";

function snapshot(overrides: Partial<SessionSnapshot>): SessionSnapshot {
  return {
    session_id: SESSION_ID,
    state: "REPORT_READY",
    sequence: 9,
    packet_version: 4,
    requirement_set_version: 1,
    server_epoch: "synthetic-epoch",
    application_name: "Synthetic application",
    requirement_set: { id: "synthetic-set", name: "Synthetic", requirements: [], version: 1 },
    documents: {},
    field_names: ["name"],
    confirmed: true,
    expected_client_seq: 6,
    ...overrides,
  } as SessionSnapshot;
}

function report(valid: boolean): ReadinessReport {
  return {
    packet_version: 4,
    current_packet_version: valid ? 4 : 5,
    requirement_set_id: "synthetic-set",
    requirement_set_version: 1,
    generated_at: "2026-10-21T00:00:00.000Z",
    valid,
    findings: [],
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("editing confirmed fields", () => {
  let edited = false;
  const calls: { url: string; init: RequestInit }[] = [];

  beforeEach(() => {
    edited = false;
    calls.length = 0;
    window.sessionStorage.setItem("submitsure.session_id", SESSION_ID);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init: RequestInit = {}) => {
        calls.push({ url: input, init });
        const path = input.replace(API_BASE_URL, "");
        if (path === "/health") return json({ ok: true, server_epoch: "synthetic-epoch" });
        if (path.startsWith(`/sessions/${SESSION_ID}/events`)) {
          return new Response(new ReadableStream());
        }
        if (path === `/sessions/${SESSION_ID}/fields` && init.method === "PATCH") {
          edited = true;
          return json({ session_id: SESSION_ID, state: "AWAITING_CONFIRMATION", packet_version: 5 });
        }
        if (path === `/sessions/${SESSION_ID}/report`) return json(report(!edited));
        if (path === `/sessions/${SESSION_ID}`) {
          return json(
            edited
              ? snapshot({
                  state: "AWAITING_CONFIRMATION",
                  packet_version: 5,
                  sequence: 12,
                  confirmed: false,
                  field_names: ["name", "full_name"],
                  expected_client_seq: 7,
                })
              : snapshot({}),
          );
        }
        return json({ error: "NOT_FOUND" }, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("sends PATCH with server-reported seq and packet version, then reloads backend state", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VerificationProvider>{children}</VerificationProvider>
    );
    const { result } = renderHook(() => useVerification(), { wrapper });

    await waitFor(() => expect(result.current.session?.state).toBe("REPORT_READY"));
    expect(result.current.report?.valid).toBe(true);

    await act(() => result.current.editConfirmedFields({ full_name: "Test Person" }));

    const patch = calls.find((call) => call.init.method === "PATCH");
    expect(patch?.url).toBe(`${API_BASE_URL}/sessions/${SESSION_ID}/fields`);
    const headers = patch?.init.headers as Record<string, string>;
    expect(headers["X-Client-Seq"]).toBe("6");
    expect(headers["X-Expected-Packet-Version"]).toBe("4");
    expect(headers["X-Client-Event-Id"]).toMatch(/\S+/);
    expect(JSON.parse(String(patch?.init.body))).toEqual({ fields: { full_name: "Test Person" } });

    const patchIndex = calls.indexOf(patch!);
    expect(
      calls.slice(patchIndex + 1).some((call) => call.url.endsWith(`/sessions/${SESSION_ID}`)),
    ).toBe(true);

    expect(result.current.session?.state).toBe("AWAITING_CONFIRMATION");
    expect(result.current.session?.packet_version).toBe(5);
    expect(result.current.report?.valid).toBe(false);
    expect(result.current.manualFields).toEqual({ full_name: "Test Person" });
    expect(calls.some((call) => call.url.endsWith("/sessions") && call.init.method === "POST")).toBe(
      false,
    );
  });

  it("leaves state unchanged and surfaces the backend error when the edit is rejected", async () => {
    const original = globalThis.fetch as (input: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init: RequestInit = {}) => {
        if (init.method === "PATCH") {
          return json({ error: "STALE_PACKET_VERSION", packet_version: 4 }, 409);
        }
        return original(input, init);
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <VerificationProvider>{children}</VerificationProvider>
    );
    const { result } = renderHook(() => useVerification(), { wrapper });
    await waitFor(() => expect(result.current.session?.state).toBe("REPORT_READY"));

    await act(async () => {
      await expect(result.current.editConfirmedFields({ name: "Test Person" })).rejects.toThrow();
    });

    expect(result.current.session?.state).toBe("REPORT_READY");
    expect(result.current.report?.valid).toBe(true);
    expect(result.current.errorMessage).toMatch(/packet changed/i);
  });
});

describe("confirmed field editor", () => {
  it("rejects empty values and duplicate names", () => {
    expect(validateFieldDraft([{ id: 0, name: "name", value: " " }])).toEqual({
      error: 'Enter a value for "name".',
    });
    expect(
      validateFieldDraft([
        { id: 0, name: "name", value: "A" },
        { id: 1, name: " name ", value: "B" },
      ]),
    ).toEqual({ error: 'The field name "name" is used more than once.' });
    expect(validateFieldDraft([{ id: 0, name: " full_name ", value: " Test " }])).toEqual({
      fields: { full_name: "Test" },
    });
  });

  it("submits the edited name and value", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(
      <ConfirmedFieldsEditor
        fieldNames={["name"]}
        disabled={false}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("Field name"), { target: { value: "full_name" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "Test Person" } });
    fireEvent.click(screen.getByRole("button", { name: "Save edits" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ full_name: "Test Person" }));
  });
});
