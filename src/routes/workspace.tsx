import { createFileRoute } from "@tanstack/react-router";
import { NotConnectedPanel, PageHeader } from "@/components/NotConnected";
import { VERIFICATION_STATES } from "@/lib/verification/contract";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Verification workspace — SubmitSure" },
      { name: "description", content: "Upload documents, review extracted fields, and track verification progress." },
      { property: "og:title", content: "Verification workspace — SubmitSure" },
      { property: "og:description", content: "Document extraction, field confirmation and progress." },
    ],
  }),
  component: Workspace,
});

function Workspace() {
  return (
    <>
      <PageHeader title="Verification workspace" subtitle="Upload documents, confirm the fields read from them, and watch progress." />
      <div className="mb-6 flex flex-wrap gap-2 font-mono text-xs">
        {VERIFICATION_STATES.map((s) => (
          <span key={s} className="rounded-md border bg-card px-2.5 py-1 text-muted-foreground">{s}</span>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <NotConnectedPanel title="Document upload & extraction">
          AI extraction with schema validation, plus a manual-entry fallback. Document contents will be processed in memory and never stored.
        </NotConnectedPanel>
        <NotConnectedPanel title="Field confirmation">
          Extracted fields appear here for you to confirm or correct (AWAITING_CONFIRMATION).
        </NotConnectedPanel>
        <div className="md:col-span-2">
          <NotConnectedPanel title="Verification progress">
            Current state will be read from the server's event stream — no state is advanced in the browser.
          </NotConnectedPanel>
        </div>
      </div>
    </>
  );
}
