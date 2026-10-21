import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotConnectedBadge } from "@/components/NotConnected";
import { VERIFICATION_STATES } from "@/lib/verification/contract";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SubmitSure — Scholarship application readiness checker" },
      { name: "description", content: "Find missing documents and inconsistencies before you submit your scholarship application." },
      { property: "og:title", content: "SubmitSure — Scholarship readiness checker" },
      { property: "og:description", content: "Find missing documents and inconsistencies before you submit." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-hero p-8 text-primary-foreground md:p-12">
        <p className="text-sm font-semibold uppercase tracking-widest opacity-80">Technovision 2026 · Zero Syntax</p>
        <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold leading-tight md:text-5xl">
          Submit your scholarship application with confidence.
        </h1>
        <p className="mt-4 max-w-xl opacity-90">
          SubmitSure checks your documents against the scholarship's requirements and flags what's missing,
          inconsistent, or needs a human to verify.
        </p>
        <Button asChild size="lg" variant="secondary" className="mt-8">
          <Link to="/setup">
            Start a verification session <ArrowRight />
          </Link>
        </Button>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Verification pipeline</h2>
          <NotConnectedBadge />
        </div>
        <ol className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {VERIFICATION_STATES.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className="rounded-md border bg-muted px-2.5 py-1">{s}</span>
              {i < VERIFICATION_STATES.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted-foreground">
          Every transition will be enforced by the server. The browser only displays reported state.
        </p>
      </section>
    </div>
  );
}
