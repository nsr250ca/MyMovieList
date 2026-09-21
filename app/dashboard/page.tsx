import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Poster } from "@/components/poster";
import { SetupWarning } from "@/components/setup-warning";
import { createClient } from "@/lib/supabase/server";

type EntryWithMovie = {
  id: string;
  watched_on: string | null;
  source_title: string;
  movies: {
    id: string;
    display_title: string;
    tmdb_poster_path: string | null;
    match_status: string;
  } | null;
};

export default async function DashboardPage() {
  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    return <SetupWarning message={(error as Error).message} />;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return <SetupWarning message="Sign in before opening the dashboard." />;

  const [{ count: watchCount }, { count: movieCount }, { count: unmatchedCount }, recentResult] =
    await Promise.all([
      supabase.from("watch_entries").select("*", { count: "exact", head: true }),
      supabase.from("movies").select("*", { count: "exact", head: true }),
      supabase
        .from("movies")
        .select("*", { count: "exact", head: true })
        .neq("match_status", "accepted"),
      supabase
        .from("watch_entries")
        .select("id, watched_on, source_title, movies(id, display_title, tmdb_poster_path, match_status)")
        .order("watched_on", { ascending: false, nullsFirst: false })
        .limit(12)
    ]);

  const recent = (recentResult.data ?? []) as unknown as EntryWithMovie[];
  const monthlyCounts = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, count: 0 }));

  recent.forEach((entry) => {
    if (!entry.watched_on) return;
    const month = Number(entry.watched_on.slice(5, 7));
    if (month >= 1 && month <= 12) monthlyCounts[month - 1].count += 1;
  });

  const maxMonth = Math.max(1, ...monthlyCounts.map((month) => month.count));

  return (
    <AppShell>
      <div className="page-title">
        <div>
          <p className="eyebrow">Local-first archive</p>
          <h1>Watched movie dashboard</h1>
          <p>Search the diary, keep future watches tidy, and reconcile titles with TMDB.</p>
        </div>
        <Link className="button" href="/watch-entries/new">
          Add watched movie
        </Link>
      </div>

      <section className="metrics">
        <div className="card">
          <span className="metric-label">Watched entries</span>
          <strong className="metric-value">{watchCount ?? 0}</strong>
        </div>
        <div className="card">
          <span className="metric-label">Unique titles</span>
          <strong className="metric-value">{movieCount ?? 0}</strong>
        </div>
        <div className="card">
          <span className="metric-label">Needs review</span>
          <strong className="metric-value">{unmatchedCount ?? 0}</strong>
        </div>
        <div className="card">
          <span className="metric-label">Recent loaded</span>
          <strong className="metric-value">{recent.length}</strong>
        </div>
      </section>

      <div className="dashboard-grid" style={{ marginTop: 18 }}>
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Poster</th>
                <th>Title</th>
                <th>Watched</th>
                <th>Match</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <Poster
                      path={entry.movies?.tmdb_poster_path}
                      title={entry.movies?.display_title ?? entry.source_title}
                    />
                  </td>
                  <td>
                    {entry.movies ? (
                      <Link href={`/movies/${entry.movies.id}`}>{entry.movies.display_title}</Link>
                    ) : (
                      entry.source_title
                    )}
                  </td>
                  <td>{entry.watched_on ?? "No date"}</td>
                  <td>
                    <span className="status-pill">{entry.movies?.match_status ?? "unmatched"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="card">
          <p className="eyebrow">Recent-month pulse</p>
          <div className="timeline-bar" aria-label="Recent monthly watch counts">
            {monthlyCounts.map((month) => (
              <div
                className="month-bar"
                key={month.month}
                title={`${month.month}: ${month.count}`}
                style={{ height: `${Math.max(8, (month.count / maxMonth) * 110)}px` }}
              />
            ))}
          </div>
          <p className="muted">
            Import the workbook first to populate the full historical rhythm.
          </p>
          <p className="tmdb-note">This product uses the TMDB API but is not endorsed by TMDB.</p>
        </aside>
      </div>
    </AppShell>
  );
}
