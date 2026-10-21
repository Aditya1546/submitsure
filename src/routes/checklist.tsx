import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/NotConnected";
import { useVerification } from "@/lib/verification/VerificationProvider";

export const Route = createFileRoute("/checklist")({
  head: () => ({
    meta: [
      { title: "Document checklist — SubmitSure" },
      {
        name: "description",
        content: "See required documents and their upload status from the backend.",
      },
      { property: "og:title", content: "Document checklist — SubmitSure" },
      { property: "og:description", content: "Required documents with live status indicators." },
    ],
  }),
  component: Checklist,
});

function Checklist() {
  const { session, sessionExpired } = useVerification();
  return (
    <>
      <PageHeader
        title="Document checklist"
        subtitle="The upload status below is based on the active backend session."
      />
      {!session ? (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Create a session to see its document requirements.
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
                The checklist below is the last server snapshot. Create a new session to continue.
              </p>
              <Button asChild variant="outline" className="mt-3">
                <Link to="/setup">Create a new session</Link>
              </Button>
            </div>
          )}
          <div className="mb-4 rounded-xl border bg-card p-4">
            <p className="font-medium">{session.application_name}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Requirement set v{session.requirement_set_version} · packet v{session.packet_version}
            </p>
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {session.requirement_set.requirements.map((requirement) => {
              const uploaded = Boolean(session.documents[requirement.id]);
              const Icon = uploaded ? CheckCircle2 : CircleDashed;
              const document = session.documents[requirement.id];
              return (
                <li
                  key={requirement.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="font-medium">{requirement.label}</p>
                    {requirement.description && (
                      <p className="text-sm text-muted-foreground">{requirement.description}</p>
                    )}
                    {document && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Server-reported size: {document.size} bytes
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${uploaded ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {uploaded ? "Uploaded" : "Not uploaded"}
                  </span>
                </li>
              );
            })}
          </ul>
          <Button asChild className="mt-4">
            <Link to="/workspace">Open verification workspace</Link>
          </Button>
        </>
      )}
    </>
  );
}
