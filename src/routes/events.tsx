import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotConnectedBadge, PageHeader } from "@/components/NotConnected";
import { PLANNED_ENDPOINTS } from "@/lib/verification/contract";
import { useVerification } from "@/lib/verification/VerificationProvider";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Event monitor — SubmitSure" },
      {
        name: "description",
        content: "Live server event history, sequence numbers and packet versions.",
      },
      { property: "og:title", content: "Event monitor — SubmitSure" },
      { property: "og:description", content: "Live verification event stream for developers." },
    ],
  }),
  component: Events,
});

function Events() {
  const {
    backendStatus,
    streamStatus,
    session,
    events,
    lastSeenSequence,
    errorMessage,
    sessionExpired,
    reconnectEvents,
  } = useVerification();

  return (
    <>
      <PageHeader
        title="Event monitor"
        subtitle="Live NDJSON events replay from the last sequence received. Duplicate events are ignored and gaps trigger replay recovery."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <NotConnectedBadge />
        {session && (
          <Button variant="outline" onClick={reconnectEvents} disabled={sessionExpired}>
            <RefreshCw /> Reconnect and replay
          </Button>
        )}
      </div>
      {!session ? (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Create a session to view its server event history.
          </p>
          <Button asChild className="mt-4">
            <Link to="/setup">Create a session</Link>
          </Button>
        </div>
      ) : (
        <>
          {sessionExpired && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
            >
              <p className="font-medium text-destructive">Session expired</p>
              <p className="mt-1 text-sm text-destructive">
                The backend returned SESSION_EXPIRED. The session may have timed out or the server
                may have restarted. Its event history is no longer available.
              </p>
              <Button asChild variant="outline" className="mt-3">
                <Link to="/setup">Create a new session</Link>
              </Button>
            </div>
          )}
          {errorMessage && !sessionExpired && (
            <p role="status" className="mb-4 rounded-md border bg-muted p-3 text-sm">
              {errorMessage}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["Connection", streamStatus],
              ["Last seen sequence", String(lastSeenSequence)],
              ["Packet version", String(session.packet_version)],
              ["Current state", session.state ?? "NOT STARTED"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 font-mono text-sm">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
            Session {session.session_id} · Backend {backendStatus} · Server epoch{" "}
            {session.server_epoch}
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border bg-primary text-primary-foreground">
            <div className="flex items-center justify-between border-b border-primary-foreground/15 px-5 py-3 font-mono text-xs">
              <span className="opacity-80">event history · {events.length} events</span>
              <span className="opacity-80">last_seen_sequence={lastSeenSequence}</span>
            </div>
            {events.length === 0 ? (
              <p className="p-5 font-mono text-sm opacity-70">
                {streamStatus === "connecting"
                  ? "Connecting to the server event stream…"
                  : "No events received yet."}
              </p>
            ) : (
              <ol className="max-h-[32rem] divide-y divide-primary-foreground/15 overflow-y-auto">
                {events.map((event) => (
                  <li
                    key={event.event_id}
                    className="grid gap-2 px-5 py-4 md:grid-cols-[7rem_minmax(0,1fr)_14rem]"
                  >
                    <span className="font-mono text-xs opacity-70">
                      #{event.sequence_number} · v{event.packet_version}
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">{event.event_type}</p>
                      {typeof event.from === "string" || typeof event.to === "string" ? (
                        <p className="mt-1 text-xs opacity-80">
                          {String(event.from ?? "—")} → {String(event.to ?? "—")}
                        </p>
                      ) : null}
                      <p className="mt-1 break-all font-mono text-[10px] opacity-60">
                        event_id: {event.event_id}
                      </p>
                    </div>
                    <time className="font-mono text-[11px] opacity-70" dateTime={event.timestamp}>
                      {new Date(event.timestamp).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
      <div className="mt-4 rounded-xl border bg-card p-5">
        <h2 className="mb-3 font-display font-semibold">API endpoints</h2>
        <ul className="space-y-1 font-mono text-xs text-muted-foreground">
          {Object.values(PLANNED_ENDPOINTS).map((endpoint) => (
            <li key={endpoint}>{endpoint}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
