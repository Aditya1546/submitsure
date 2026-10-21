import { PlugZap } from "lucide-react";

export function NotConnectedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/50 bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning-foreground">
      <PlugZap className="h-3.5 w-3.5" /> Backend not connected
    </span>
  );
}

export function NotConnectedPanel({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-border bg-card p-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <NotConnectedBadge />
      </div>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{subtitle}</p>
    </header>
  );
}
