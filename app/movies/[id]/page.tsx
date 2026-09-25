import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Poster } from "@/components/poster";
import { SetupWarning } from "@/components/setup-warning";
import { createClient } from "@/lib/supabase/server";
import { MatchReview } from "@/app/matches/match-review";

type WatchRow = {
  id: string;
  watched_on: string | null;
  rating: number | null;
  platform: string | null;
  notes: string | null;
  source_title: string;
};

export default async function MovieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    return <SetupWarning message={(error as Error).message} />;
  }

  const [{ data: movie }, { data: watches }] = await Promise.all([
    supabase.from("movies").select("*").eq("id", id).single(),
    supabase
      .from("watch_entries")
      .select("id, watched_on, rating, platform, notes, source_title")
      .eq("movie_id", id)
      .order("watched_on", { ascending: false, nullsFirst: false })
  ]);

  if (!movie) notFound();

  const directors = Array.isArray(movie.directors) ? movie.directors : [];
  const cast = Array.isArray(movie.cast_members) ? movie.cast_members : [];
  const genres = Array.isArray(movie.genres) ? movie.genres : [];

  return (
    <AppShell>
      <div className="page-title">
        <div>
          <p className="eyebrow">Movie detail</p>
          <h1>{movie.display_title}</h1>
          <p>{movie.original_title ?? movie.english_title ?? "Imported title"}</p>
        </div>
        <Link className="ghost-button" href="/matches">
          Review match
        </Link>
      </div>

      <div className="movie-detail-layout">
        <section className="card">
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
            <Poster path={movie.tmdb_poster_path} title={movie.display_title} />
            <div>
              <p className="muted">{movie.overview ?? "No TMDB overview cached yet."}</p>
              <p>
                <span className="status-pill">{movie.match_status}</span>
              </p>
              <p className="muted">
                {movie.release_date ?? "Unknown release"} · {movie.runtime_minutes ?? "Unknown"} min ·{" "}
                {movie.original_language ?? "Unknown language"}
              </p>
              <p className="muted">
                Genres:{" "}
                {genres
                  .map((genre) =>
                    typeof genre === "object" && genre && "name" in genre ? String(genre.name) : ""
                  )
                  .filter(Boolean)
                  .join(", ") || "None cached"}
              </p>
              <p className="muted">
                Director:{" "}
                {directors
                  .map((person) =>
                    typeof person === "object" && person && "name" in person ? String(person.name) : ""
                  )
                  .filter(Boolean)
                  .join(", ") || "None cached"}
              </p>
              <p className="muted">
                Cast:{" "}
                {cast
                  .slice(0, 6)
                  .map((person) =>
                    typeof person === "object" && person && "name" in person ? String(person.name) : ""
                  )
                  .filter(Boolean)
                  .join(", ") || "None cached"}
              </p>
            </div>
          </div>
        </section>

        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Watched</th>
                <th>Source title</th>
                <th>Rating</th>
                <th>Platform</th>
              </tr>
            </thead>
            <tbody>
              {((watches ?? []) as WatchRow[]).map((watch) => (
                <tr key={watch.id}>
                  <td>{watch.watched_on ?? "No date"}</td>
                  <td>{watch.source_title}</td>
                  <td>{watch.rating ?? "—"}</td>
                  <td>{watch.platform ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card correction-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Manual correction</p>
              <h2>TMDB match and split</h2>
            </div>
            <span className="status-pill">{movie.match_confidence ?? "—"} score</span>
          </div>
          <p className="muted">
            Search TMDB again to replace this movie’s metadata, or select watched dates and split
            them into another release with the same title.
          </p>
          <MatchReview
            movieId={movie.id}
            title={movie.display_title}
            startCollapsed
            triggerLabel="Search TMDB again"
            allowSplit
            watchEntries={((watches ?? []) as WatchRow[]).map((watch) => ({
              id: watch.id,
              watched_on: watch.watched_on,
              source_title: watch.source_title
            }))}
          />
        </section>
      </div>
    </AppShell>
  );
}
