import { createFileRoute } from "@tanstack/react-router";
import { NotConnectedBadge, PageHeader } from "@/components/NotConnected";
import { PLANNED_ENDPOINTS } from "@/lib/verification/contract";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Event monitor — SubmitSure" },
      { name: "description", content: "Developer view of state transitions, event sequence numbers and packet versions." },
      { property: "og:title", content: "Event monitor — SubmitSure" },
      { property: "og:description", content: "Live verification event stream for developers." },
    ],
  }),
  component: Events,
});

function Events() {
  return (
    <>
      <PageHeader title="Event monitor" subtitle="Raw NDJSON event stream: state transitions, sequence numbers, packet versions, connection status." />
      <div className="grid gap-4 md:grid-cols-4">
        {[["Connection", "disconnected"], ["Last seen sequence", "—"], ["Packet version", "—"], ["Current state", "—"]].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="mt-1 font-mono text-sm">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border bg-primary p-5 font-mono text-xs text-primary-foreground">
        <div className="mb-3 flex items-center justify-between"><span className="opacity-70">event log</span><NotConnectedBadge /></div>
        <p className="opacity-60">// no events — stream endpoint not implemented</p>
      </div>
      <div className="mt-4 rounded-xl border bg-card p-5">
        <h3 className="mb-3 font-display font-semibold">Planned endpoints</h3>
        <ul className="space-y-1 font-mono text-xs text-muted-foreground">
          {Object.values(PLANNED_ENDPOINTS).map((e) => <li key={e}>{e}</li>)}
        </ul>
      </div>
    </>
  );
}
