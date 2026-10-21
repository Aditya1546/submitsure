import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RequirementSet } from "@/lib/requirements";
import {
  BackendError,
  classifyEventSequence,
  mutationHeaders,
  readEventStream,
  requestJson,
  type ReadinessReport,
  type SessionSnapshot,
  type VerificationEvent,
} from "@/lib/verification/api";

type BackendStatus = "checking" | "connected" | "unavailable";
type StreamStatus = "idle" | "connecting" | "connected" | "reconnecting" | "expired";

interface VerificationContextValue {
  backendStatus: BackendStatus;
  streamStatus: StreamStatus;
  session: SessionSnapshot | null;
  report: ReadinessReport | null;
  events: VerificationEvent[];
  lastSeenSequence: number;
  isMutating: boolean;
  sessionExpired: boolean;
  errorMessage: string | null;
  notice: string | null;
  manualFields: Record<string, string>;
  createSession: (applicationName: string, requirementSet: RequirementSet) => Promise<void>;
  setManualFields: (fields: Record<string, string>) => void;
  refreshSession: () => Promise<SessionSnapshot | null>;
  uploadDocument: (requirementId: string, file: File) => Promise<void>;
  submitManualFields: (fields: Record<string, string>) => Promise<void>;
  confirmFields: (fields: Record<string, string>) => Promise<void>;
  generateReport: () => Promise<void>;
  reconnectEvents: () => void;
  clearMessages: () => void;
}

const SESSION_STORAGE_KEY = "submitsure.session_id";
const VerificationContext = createContext<VerificationContextValue | null>(null);

export function VerificationProvider({ children }: { children: ReactNode }) {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [events, setEvents] = useState<VerificationEvent[]>([]);
  const [lastSeenSequence, setLastSeenSequence] = useState(0);
  const [isMutating, setIsMutating] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualFields, setManualFields] = useState<Record<string, string>>({});
  const [streamAttempt, setStreamAttempt] = useState(0);

  const sessionRef = useRef<SessionSnapshot | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const clientSequenceRef = useRef(1);
  const lastSeenRef = useRef(0);
  const mutationLock = useRef(false);

  const applySession = useCallback((next: SessionSnapshot) => {
    sessionRef.current = next;
    sessionIdRef.current = next.session_id;
    clientSequenceRef.current = next.expected_client_seq;
    setSession(next);
    setSessionId(next.session_id);
    setSessionExpired(false);
    setBackendStatus("connected");
  }, []);

  const refreshSessionById = useCallback(
    async (id: string): Promise<SessionSnapshot> => {
      try {
        const snapshot = await requestJson<SessionSnapshot>(`/sessions/${encodeURIComponent(id)}`);
        applySession(snapshot);
        try {
          const currentReport = await requestJson<ReadinessReport>(
            `/sessions/${encodeURIComponent(id)}/report`,
          );
          setReport(currentReport);
        } catch (error) {
          if (error instanceof BackendError && error.status === 404) {
            setReport(null);
          } else {
            throw error;
          }
        }
        return snapshot;
      } catch (error) {
        if (error instanceof BackendError && error.code === "SESSION_EXPIRED") {
          setSessionExpired(true);
          setStreamStatus("expired");
          setErrorMessage(error.message);
        } else if (!(error instanceof BackendError && error.status === 404)) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load the session.");
        }
        throw error;
      }
    },
    [applySession],
  );

  const refreshSession = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return null;
    return refreshSessionById(id);
  }, [refreshSessionById]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    // Render free instances sleep when idle; the first request during a cold
    // start can fail, so keep retrying with backoff until /health reports ok.
    const checkHealth = async (delay: number) => {
      try {
        const health = await requestJson<{ ok?: unknown }>("/health", {
          signal: AbortSignal.timeout(20000),
        });
        if (health?.ok !== true) throw new Error("Health check did not report ok.");
        if (!cancelled) setBackendStatus("connected");
      } catch (error) {
        if (cancelled) return;
        console.warn("[SubmitSure] Health check failed, retrying in", delay, "ms:", error);
        setBackendStatus("unavailable");
        retryTimer = window.setTimeout(
          () => void checkHealth(Math.min(delay * 2, 15000)),
          delay,
        );
      }
    };
    void checkHealth(2000);

    let savedId: string | null = null;
    try {
      savedId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      // Session recovery is optional when browser storage is unavailable.
    }
    if (savedId) {
      sessionIdRef.current = savedId;
      setSessionId(savedId);
      void refreshSessionById(savedId).catch(() => undefined);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
    };
  }, [refreshSessionById]);

  useEffect(() => {
    if (!sessionId) {
      setStreamStatus("idle");
      return;
    }

    let cancelled = false;
    let controller: AbortController | null = null;
    setStreamStatus("connecting");

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, ms);
        controller?.signal.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });

    const connect = async () => {
      let delay = 500;
      while (!cancelled) {
        controller = new AbortController();
        try {
          await readEventStream(
            sessionId,
            lastSeenRef.current,
            controller.signal,
            (event) => {
              const previous = lastSeenRef.current;
              const sequenceStatus = classifyEventSequence(previous, event.sequence_number);
              if (sequenceStatus === "duplicate") return;
              if (sequenceStatus === "gap") {
                setStreamStatus("reconnecting");
                throw new Error(
                  `Event sequence gap: expected ${previous + 1}, received ${event.sequence_number}.`,
                );
              }

              lastSeenRef.current = event.sequence_number;
              setLastSeenSequence(event.sequence_number);
              setEvents((current) => [...current, event]);
              setSession((current) => {
                if (!current || current.session_id !== sessionId) return current;
                const next = {
                  ...current,
                  sequence: event.sequence_number,
                  packet_version: event.packet_version,
                  state:
                    typeof event.to === "string"
                      ? (event.to as SessionSnapshot["state"])
                      : current.state,
                };
                sessionRef.current = next;
                return next;
              });
              if (event.event_type === "REPORT_INVALIDATED") {
                void requestJson<ReadinessReport>(
                  `/sessions/${encodeURIComponent(sessionId)}/report`,
                )
                  .then(setReport)
                  .catch((error) => {
                    if (error instanceof BackendError && error.status === 404) setReport(null);
                  });
              }
            },
            () => setStreamStatus("connected"),
          );
          if (!cancelled) setStreamStatus("reconnecting");
        } catch (error) {
          if (cancelled || controller.signal.aborted) return;
          if (error instanceof BackendError && error.code === "SESSION_EXPIRED") {
            setSessionExpired(true);
            setStreamStatus("expired");
            setErrorMessage(error.message);
            return;
          }
          setStreamStatus("reconnecting");
          if (!(error instanceof Error && error.message.startsWith("Event sequence gap:"))) {
            setErrorMessage(error instanceof Error ? error.message : "Event stream disconnected.");
          }
        }

        await wait(delay);
        delay = Math.min(delay * 2, 15000);
      }
    };

    void connect();
    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [sessionId, streamAttempt]);

  const createSession = useCallback(
    async (applicationName: string, requirementSet: RequirementSet) => {
      setErrorMessage(null);
      setNotice(null);
      const body = await requestJson<{
        session_id: string;
        state: SessionSnapshot["state"];
        sequence: number;
        packet_version: number;
        requirement_set_version: number;
        server_epoch: string;
      }>("/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...mutationHeaders(crypto.randomUUID(), 1, 0),
        },
        body: JSON.stringify({
          application_name: applicationName,
          requirement_set: requirementSet,
        }),
      });

      sessionRef.current = null;
      lastSeenRef.current = 0;
      setLastSeenSequence(0);
      setEvents([]);
      setReport(null);
      setManualFields({});
      setSessionExpired(false);
      sessionIdRef.current = body.session_id;
      setSessionId(body.session_id);
      try {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, body.session_id);
      } catch {
        // The session remains usable for this page even if storage is disabled.
      }
      const initial: SessionSnapshot = {
        ...body,
        application_name: applicationName,
        requirement_set: { ...requirementSet, version: body.requirement_set_version },
        documents: {},
        field_names: [],
        confirmed: false,
        expected_client_seq: 1,
      };
      applySession(initial);
      await refreshSessionById(body.session_id);
    },
    [applySession, refreshSessionById],
  );

  const runMutation = useCallback(
    async (path: string, method: string, body: unknown, rawBody = false) => {
      const current = sessionRef.current;
      if (!current) throw new Error("Create a verification session first.");
      if (mutationLock.current) throw new Error("Another session update is in progress.");

      mutationLock.current = true;
      setIsMutating(true);
      setErrorMessage(null);
      setNotice(null);
      const sequence = clientSequenceRef.current;
      const headers = mutationHeaders(crypto.randomUUID(), sequence, current.packet_version);
      if (!rawBody) headers["Content-Type"] = "application/json";

      try {
        const result = await requestJson<Partial<SessionSnapshot>>(
          `/sessions/${encodeURIComponent(current.session_id)}${path}`,
          {
            method,
            headers,
            body: rawBody ? (body as BodyInit) : JSON.stringify(body ?? {}),
          },
        );
        clientSequenceRef.current = sequence + 1;
        const updated: SessionSnapshot = {
          ...current,
          state: result.state ?? current.state,
          sequence: result.sequence ?? current.sequence,
          packet_version: result.packet_version ?? current.packet_version,
          requirement_set_version:
            result.requirement_set_version ?? current.requirement_set_version,
          server_epoch: result.server_epoch ?? current.server_epoch,
        };
        applySession({ ...updated, expected_client_seq: sequence + 1 });
        try {
          await refreshSessionById(current.session_id);
        } catch {
          setNotice(
            "The backend accepted the change, but the session summary could not be refreshed.",
          );
        }
      } catch (error) {
        if (error instanceof BackendError && error.code === "SESSION_EXPIRED") {
          setSessionExpired(true);
        } else {
          setErrorMessage(error instanceof Error ? error.message : "The backend request failed.");
          try {
            await refreshSessionById(current.session_id);
          } catch {
            // Keep the original request error visible.
          }
        }
        throw error;
      } finally {
        mutationLock.current = false;
        setIsMutating(false);
      }
    },
    [applySession, refreshSessionById],
  );

  const uploadDocument = useCallback(
    async (requirementId: string, file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const query = new URLSearchParams({
        requirement_id: requirementId,
        filename: file.name,
      });
      await runMutation(`/documents?${query.toString()}`, "POST", bytes, true);
    },
    [runMutation],
  );

  const submitManualFields = useCallback(
    async (fields: Record<string, string>) => {
      await runMutation("/extraction", "POST", { fields, source: "manual" });
    },
    [runMutation],
  );

  const confirmFields = useCallback(
    async (fields: Record<string, string>) => {
      await runMutation("/confirm", "POST", { fields });
    },
    [runMutation],
  );

  const generateReport = useCallback(async () => {
    await runMutation("/report", "POST", {});
  }, [runMutation]);

  const reconnectEvents = useCallback(() => {
    if (!sessionIdRef.current) return;
    setErrorMessage(null);
    setStreamStatus("connecting");
    setStreamAttempt((attempt) => attempt + 1);
  }, []);

  const clearMessages = useCallback(() => {
    setErrorMessage(null);
    setNotice(null);
  }, []);

  return (
    <VerificationContext.Provider
      value={{
        backendStatus,
        streamStatus,
        session,
        report,
        events,
        lastSeenSequence,
        isMutating,
        sessionExpired,
        errorMessage,
        notice,
        manualFields,
        createSession,
        setManualFields,
        refreshSession,
        uploadDocument,
        submitManualFields,
        confirmFields,
        generateReport,
        reconnectEvents,
        clearMessages,
      }}
    >
      {children}
    </VerificationContext.Provider>
  );
}

export function useVerification() {
  const context = useContext(VerificationContext);
  if (!context) {
    throw new Error("useVerification must be used inside VerificationProvider.");
  }
  return context;
}
