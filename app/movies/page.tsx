import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Poster } from "@/components/poster";
import { SetupWarning } from "@/components/setup-warning";
import { createClient } from "@/lib/supabase/server";

export default async function MoviesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    return <SetupWarning message={(error as Error).message} />;
  }

  const q = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const matchStatuses = ["unmatched", "suggested", "accepted", "rejected", "manual"] as const;
  const safeStatus = matchStatuses.find((item) => item === status);
  let query = supabase
    .from("movies")
    .select("id, display_title, original_title, english_title, tmdb_poster_path, release_date, original_language, match_status")
    .order("display_title", { ascending: true })
    .limit(120);

  if (q) {
    query = query.or(
      `display_title.ilike.%${q}%,original_title.ilike.%${q}%,english_title.ilike.%${q}%,normalized_title.ilike.%${q.toLowerCase()}%`
    );
  }

  if (safeStatus) query = query.eq("match_status", safeStatus);

  const { data: movies, error } = await query;

  return (
    <AppShell>
      <div className="page-title">
        <div>
          <p className="eyebrow">Library</p>
          <h1>Search movies</h1>
          <p>English, Chinese, original titles, and imported source names all stay searchable.</p>
        </div>
        <Link className="button" href="/watch-entries/new">
          Add watch
        </Link>
      </div>

      <form className="toolbar" action="/movies">
        <input name="q" placeholder="Search by title" defaultValue={q} />
        <select name="status" defaultValue={status}>
          <option value="">All match states</option>
          <option value="accepted">Accepted</option>
          <option value="suggested">Suggested</option>
          <option value="unmatched">Unmatched</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="button" type="submit">
          Search
        </button>
      </form>

      {error ? <p className="danger">{error.message}</p> : null}

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Poster</th>
              <th>Title</th>
              <th>Release</th>
              <th>Language</th>
              <th>Match</th>
            </tr>
          </thead>
          <tbody>
            {(movies ?? []).map((movie) => (
              <tr key={movie.id}>
                <td>
                  <Poster path={movie.tmdb_poster_path} title={movie.display_title} />
                </td>
                <td>
                  <Link href={`/movies/${movie.id}`}>{movie.display_title}</Link>
                  {movie.original_title && movie.original_title !== movie.display_title ? (
                    <div className="muted">{movie.original_title}</div>
                  ) : null}
                </td>
                <td>{movie.release_date ?? "Unknown"}</td>
                <td>{movie.original_language ?? "Unknown"}</td>
                <td>
                  <span className="status-pill">{movie.match_status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
