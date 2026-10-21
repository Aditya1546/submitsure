import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, HelpCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/NotConnected";
import { useVerification } from "@/lib/verification/VerificationProvider";
import type { ReadinessFinding } from "@/lib/verification/api";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Readiness report — SubmitSure" },
      {
        name: "description",
        content: "Backend-generated findings and next actions before you submit.",
      },
      { property: "og:title", content: "Readiness report — SubmitSure" },
      { property: "og:description", content: "Verified, needs-review and cannot-verify findings." },
    ],
  }),
  component: Report,
});

const COLUMNS: {
  status: ReadinessFinding["status"];
  title: string;
  icon: typeof CheckCircle2;
  tone: string;
  hint: string;
}[] = [
  {
    status: "verified",
    title: "Verified",
    icon: CheckCircle2,
    tone: "border-success/40 text-success",
    hint: "Confirmed with cited evidence.",
  },
  {
    status: "needs_review",
    title: "Needs review",
    icon: TriangleAlert,
    tone: "border-warning/60 text-warning-foreground",
    hint: "Check this item before submitting.",
  },
  {
    status: "cannot_verify",
    title: "Cannot verify",
    icon: HelpCircle,
    tone: "border-border text-muted-foreground",
    hint: "Requires manual verification by you or the office.",
  },
];

function Report() {
  const {
    session,
    report,
    generateReport,
    isMutating,
    errorMessage,
    notice,
    clearMessages,
    sessionExpired,
  } = useVerification();
  const generating = isMutating;

  return (
    <>
      <PageHeader
        title="Readiness report"
        subtitle="Findings, report versions, and validity come directly from the verification backend."
      />
      {errorMessage && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-md border bg-muted p-3 text-sm">
          {notice}
        </p>
      )}
      {sessionExpired && (
        <Button asChild variant="outline" className="mb-4">
          <Link to="/setup">Create a new session</Link>
        </Button>
      )}
      {!session ? (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Create a session to generate a readiness report.
          </p>
          <Button asChild className="mt-4">
            <Link to="/setup">Create a session</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div>
              <p className="font-medium">{session.application_name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                State: {session.state ?? "NOT STARTED"} · Packet v{session.packet_version}
              </p>
            </div>
            {session.state === "VERIFIED" && (
              <Button
                disabled={generating || sessionExpired}
                onClick={async () => {
                  clearMessages();
                  try {
                    await generateReport();
                  } catch {
                    // The shared session panel displays the backend error.
                  }
                }}
              >
                {generating
                  ? "Generating…"
                  : report?.valid === false
                    ? "Regenerate report"
                    : "Generate readiness report"}
              </Button>
            )}
          </div>

          {!report ? (
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm text-muted-foreground">
                {session.state === "VERIFIED"
                  ? "The session is verified. Generate a report to receive server-backed findings."
                  : "A report is available only after the backend confirms all fields."}
              </p>
              {session.state !== "VERIFIED" && (
                <Button asChild variant="outline" className="mt-4">
                  <Link to="/workspace">Continue verification</Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <div
                className={`mb-5 rounded-xl border p-4 ${report.valid ? "border-success/40 bg-success/5" : "border-warning/60 bg-warning/10"}`}
              >
                <p className="font-semibold">
                  {report.valid ? "Report is valid" : "Report is invalidated"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Report packet v{report.packet_version} · current packet v
                  {report.current_packet_version} · requirements v{report.requirement_set_version} ·
                  generated {new Date(report.generated_at).toLocaleString()}
                </p>
                {!report.valid && (
                  <p className="mt-2 text-sm">
                    The backend reports this report is no longer valid. Confirm the latest fields
                    before generating a new report.
                  </p>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {COLUMNS.map(({ status, title, icon: Icon, tone, hint }) => {
                  const findings = report.findings.filter((finding) => finding.status === status);
                  return (
                    <section key={status} className={`rounded-xl border-2 bg-card p-5 ${tone}`}>
                      <div className="flex items-center gap-2 font-display font-semibold">
                        <Icon className="h-5 w-5" /> {title}{" "}
                        <span className="ml-auto text-sm">{findings.length}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
                      {findings.length === 0 ? (
                        <p className="mt-6 text-sm italic text-muted-foreground">
                          No findings in this category.
                        </p>
                      ) : (
                        <ul className="mt-4 space-y-3">
                          {findings.map((finding) => (
                            <li
                              key={finding.requirement_id}
                              className="rounded-lg border bg-background/70 p-3"
                            >
                              <p className="font-medium text-foreground">{finding.label}</p>
                              <p className="mt-1 break-words text-sm text-muted-foreground">
                                {finding.evidence}
                              </p>
                              <p className="mt-2 text-sm text-foreground">
                                Next: {finding.next_action}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
              <div className="mt-4 rounded-xl border bg-card p-5">
                <h2 className="font-display font-semibold">Next actions</h2>
                <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                  {report.findings.map((finding) => (
                    <li key={finding.requirement_id}>
                      {finding.label}: {finding.next_action}
                    </li>
                  ))}
                  {report.findings.length === 0 && (
                    <li>No actions were returned by the backend.</li>
                  )}
                </ul>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
