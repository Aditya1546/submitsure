import { Link } from "@tanstack/react-router";
import {
  Activity,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  ScanSearch,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { NotConnectedBadge } from "@/components/NotConnected";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/setup", label: "Application setup", icon: Settings2 },
  { to: "/checklist", label: "Document checklist", icon: ClipboardList },
  { to: "/workspace", label: "Verification", icon: ScanSearch },
  { to: "/report", label: "Readiness report", icon: FileCheck2 },
  { to: "/events", label: "Event monitor", icon: Activity },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground md:flex-row">
      <aside className="bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0">
        <div className="flex items-center gap-2 px-5 py-5">
          <ShieldCheck className="h-7 w-7 text-sidebar-primary" />
          <span className="font-display text-lg font-bold text-sidebar-accent-foreground">
            SubmitSure
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden px-5 py-4 text-xs md:block">
          <NotConnectedBadge />
        </div>
      </aside>
      <main className="flex-1 px-5 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
