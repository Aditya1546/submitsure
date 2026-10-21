import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NotConnectedBadge, PageHeader } from "@/components/NotConnected";
import { REQUIREMENT_TEMPLATES, type Requirement } from "@/lib/requirements";
import { useVerification } from "@/lib/verification/VerificationProvider";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Application setup — SubmitSure" },
      {
        name: "description",
        content: "Name your application and define the scholarship's document requirements.",
      },
      { property: "og:title", content: "Application setup — SubmitSure" },
      { property: "og:description", content: "Define configurable scholarship requirements." },
    ],
  }),
  component: Setup,
});

function Setup() {
  const navigate = useNavigate();
  const { createSession, errorMessage, isMutating, session, clearMessages } = useVerification();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(REQUIREMENT_TEMPLATES[0]!.id);
  const [reqs, setReqs] = useState<Requirement[]>(REQUIREMENT_TEMPLATES[0]!.requirements);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    setReqs(REQUIREMENT_TEMPLATES.find((t) => t.id === id)?.requirements ?? []);
  };

  return (
    <>
      <PageHeader
        title="Application setup"
        subtitle="Name this application and choose or customise the documents the scholarship requires."
      />
      <div className="space-y-6 rounded-xl border bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="app-name">Application name</Label>
          <Input
            id="app-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 2026 Merit Scholarship"
          />
        </div>
        <div className="space-y-2">
          <Label>Start from a template</Label>
          <div className="flex flex-wrap gap-2">
            {REQUIREMENT_TEMPLATES.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant={t.id === templateId ? "default" : "outline"}
                size="sm"
                onClick={() => pickTemplate(t.id)}
              >
                {t.name}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Required documents</Label>
          <ul className="divide-y rounded-lg border">
            {reqs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{r.label}</p>
                  {r.description && (
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${r.label}`}
                  onClick={() => setReqs(reqs.filter((x) => x.id !== r.id))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const label = newLabel.trim();
              if (!label) return;
              setReqs([...reqs, { id: `custom-${crypto.randomUUID()}`, label, description: "" }]);
              setNewLabel("");
            }}
          >
            <Input
              aria-label="Custom requirement name"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Add a custom requirement"
            />
            <Button type="submit" variant="outline">
              <Plus /> Add
            </Button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-6">
          <Button
            disabled={creating || isMutating || !name.trim() || reqs.length === 0}
            onClick={async () => {
              clearMessages();
              setCreating(true);
              try {
                const selected = REQUIREMENT_TEMPLATES.find(
                  (template) => template.id === templateId,
                );
                const requirementSet = {
                  id: `${templateId}-${crypto.randomUUID()}`,
                  name: selected?.name ?? "Custom requirements",
                  requirements: reqs,
                };
                await createSession(name.trim(), requirementSet);
                await navigate({ to: "/workspace" });
              } catch {
                // The shared session panel displays the backend error.
              } finally {
                setCreating(false);
              }
            }}
          >
            {creating ? "Creating…" : "Create session"}
          </Button>
          <NotConnectedBadge />
          {session && (
            <Link
              to="/workspace"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              Open current session
            </Link>
          )}
        </div>
        {errorMessage && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        )}
        {reqs.length === 0 && (
          <p className="text-sm text-warning-foreground">
            Add at least one required document before creating a session.
          </p>
        )}
      </div>
    </>
  );
}
