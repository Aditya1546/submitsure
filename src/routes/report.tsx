import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, HelpCircle, TriangleAlert } from "lucide-react";
import { NotConnectedBadge, PageHeader } from "@/components/NotConnected";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Readiness report — SubmitSure" },
      { name: "description", content: "Evidence-backed findings and next actions before you submit." },
      { property: "og:title", content: "Readiness report — SubmitSure" },
      { property: "og:description", content: "Verified, needs-review and cannot-verify findings." },
    ],
  }),
  component: Report,
});

const COLUMNS = [
  { title: "Verified", icon: CheckCircle2, tone: "border-success/40 text-success", hint: "Confirmed with cited evidence." },
  { title: "Needs review", icon: TriangleAlert, tone: "border-warning/60 text-warning-foreground", hint: "Possible inconsistency — check before submitting." },
  { title: "Cannot verify", icon: HelpCircle, tone: "border-border text-muted-foreground", hint: "Requires manual verification by you or the office." },
];

function Report() {
  return (
    <>
      <PageHeader title="Readiness report" subtitle="Generated only when the session reaches REPORT_READY. Invalidated automatically if documents change." />
      <div className="mb-6"><NotConnectedBadge /></div>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map(({ title, icon: Icon, tone, hint }) => (
          <div key={title} className={`rounded-xl border-2 bg-card p-5 ${tone}`}>
            <div className="flex items-center gap-2 font-display font-semibold"><Icon className="h-5 w-5" /> {title}</div>
            <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
            <p className="mt-6 text-sm italic text-muted-foreground">No findings — no report generated yet.</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border bg-card p-5">
        <h3 className="font-display font-semibold">Next actions</h3>
        <p className="mt-1 text-sm text-muted-foreground">Will list concrete steps for each finding.</p>
      </div>
    </>
  );
}
