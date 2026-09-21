import Link from "next/link";
import { CalendarDays, Clapperboard, FileSpreadsheet, Gauge, Search } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">MJ</div>
          <div>
            <h1>Movie Journal</h1>
            <p>Watched dates, matched titles, future entries.</p>
          </div>
        </div>
        <nav className="nav" aria-label="Primary">
          <Link href="/dashboard">
            <Gauge size={16} />
            Dashboard
          </Link>
          <Link href="/movies">
            <Search size={16} />
            Movies
          </Link>
          <Link href="/watch-entries/new">
            <CalendarDays size={16} />
            Add watch
          </Link>
          <Link href="/import">
            <FileSpreadsheet size={16} />
            Import
          </Link>
          <Link href="/matches">
            <Clapperboard size={16} />
            Match queue
          </Link>
          <SignOutButton />
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
