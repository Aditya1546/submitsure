import { createFileRoute } from "@tanstack/react-router";
import { CircleDashed } from "lucide-react";
import { NotConnectedBadge, PageHeader } from "@/components/NotConnected";
import { REQUIREMENT_TEMPLATES } from "@/lib/requirements";

export const Route = createFileRoute("/checklist")({
  head: () => ({
    meta: [
      { title: "Document checklist — SubmitSure" },
      { name: "description", content: "See each required document and its verification status." },
      { property: "og:title", content: "Document checklist — SubmitSure" },
      { property: "og:description", content: "Required documents with status indicators." },
    ],
  }),
  component: Checklist,
});

function Checklist() {
  const reqs = REQUIREMENT_TEMPLATES[0].requirements;
  return (
    <>
      <PageHeader title="Document checklist" subtitle="Statuses will come from the backend. Until then, every item shows as not checked." />
      <div className="mb-4"><NotConnectedBadge /></div>
      <ul className="divide-y rounded-xl border bg-card">
        {reqs.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="font-medium">{r.label}</p>
              <p className="text-sm text-muted-foreground">{r.description}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              <CircleDashed className="h-3.5 w-3.5" /> Not checked
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">Showing the example template. Will reflect the session's requirement set once sessions exist.</p>
    </>
  );
}
