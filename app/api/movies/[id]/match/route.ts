import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTmdbMovieDetails } from "@/lib/tmdb";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { tmdbId?: number; score?: number };

    if (!body.tmdbId) {
      return NextResponse.json({ error: "TMDB ID is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in before accepting a match." }, { status: 401 });
    }

    const details = await getTmdbMovieDetails(Number(body.tmdbId));
    const { error: movieError } = await supabase
      .from("movies")
      .update({
        english_title: details.display_title,
        original_title: details.original_title,
        tmdb_id: details.tmdb_id,
        tmdb_poster_path: details.tmdb_poster_path,
        tmdb_backdrop_path: details.tmdb_backdrop_path,
        overview: details.overview,
        release_date: details.release_date,
        runtime_minutes: details.runtime_minutes,
        original_language: details.original_language,
        genres: details.genres,
        directors: details.directors,
        cast_members: details.cast_members,
        match_status: "accepted",
        match_confidence: body.score ?? null
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (movieError) throw movieError;

    const { error: candidateError } = await supabase.from("movie_match_candidates").upsert(
      {
        user_id: user.id,
        movie_id: id,
        tmdb_id: details.tmdb_id,
        title: details.display_title,
        original_title: details.original_title,
        release_date: details.release_date,
        poster_path: details.tmdb_poster_path,
        original_language: details.original_language,
        score: body.score ?? 100,
        accepted: true,
        payload: details
      },
      { onConflict: "movie_id,tmdb_id" }
    );

    if (candidateError) throw candidateError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
