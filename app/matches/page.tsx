import { AppShell } from "@/components/app-shell";
import { Poster } from "@/components/poster";
import { SetupWarning } from "@/components/setup-warning";
import { createClient } from "@/lib/supabase/server";
import { MatchReview } from "./match-review";

export default async function MatchesPage() {
  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    return <SetupWarning message={(error as Error).message} />;
  }

  const { data: movies, error } = await supabase
    .from("movies")
    .select("id, display_title, original_title, tmdb_poster_path, match_status, match_confidence")
    .neq("match_status", "accepted")
    .order("created_at", { ascending: false })
    .limit(60);

  return (
    <AppShell>
      <div className="page-title">
        <div>
          <p className="eyebrow">TMDB reconciliation</p>
          <h1>Match queue</h1>
          <p>Review fuzzy matches before canonical TMDB metadata is saved.</p>
        </div>
      </div>
      {error ? <p className="danger">{error.message}</p> : null}
      <section className="grid">
        {(movies ?? []).map((movie) => (
          <article className="card" key={movie.id}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <Poster path={movie.tmdb_poster_path} title={movie.display_title} />
              <div style={{ flex: 1 }}>
                <h2>{movie.display_title}</h2>
                <p className="muted">{movie.original_title ?? "Imported title only"}</p>
                <p>
                  <span className="status-pill">{movie.match_status}</span>
                </p>
                <MatchReview movieId={movie.id} title={movie.display_title} />
              </div>
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
