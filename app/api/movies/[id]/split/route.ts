import { NextResponse } from "next/server";
import { normalizeTitle } from "@/lib/normalization";
import { createClient } from "@/lib/supabase/server";
import { getTmdbMovieDetails } from "@/lib/tmdb";

type SplitRequest = {
  tmdbId?: number;
  score?: number;
  watchEntryIds?: string[];
};

function titleWithYear(title: string, releaseDate?: string | null) {
  const year = releaseDate?.slice(0, 4);
  return year ? `${title} (${year})` : title;
}

async function updateRewatchFlags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  movieIds: string[]
) {
  for (const movieId of movieIds) {
    const { data: entries, error } = await supabase
      .from("watch_entries")
      .select("id, is_rewatch")
      .eq("movie_id", movieId)
      .order("watched_on", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw error;

    for (const [index, entry] of (entries ?? []).entries()) {
      const shouldBeRewatch = index > 0;
      if (entry.is_rewatch === shouldBeRewatch) continue;

      const { error: updateError } = await supabase
        .from("watch_entries")
        .update({ is_rewatch: shouldBeRewatch })
        .eq("id", entry.id);

      if (updateError) throw updateError;
    }
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as SplitRequest;
    const watchEntryIds = Array.isArray(body.watchEntryIds) ? body.watchEntryIds : [];

    if (!body.tmdbId) {
      return NextResponse.json({ error: "TMDB ID is required." }, { status: 400 });
    }

    if (watchEntryIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one watched entry to split." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in before splitting a movie." }, { status: 401 });
    }

    const { data: sourceMovie, error: sourceError } = await supabase
      .from("movies")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (sourceError || !sourceMovie) {
      return NextResponse.json({ error: "Movie was not found." }, { status: 404 });
    }

    const { data: selectedEntries, error: entriesError } = await supabase
      .from("watch_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("movie_id", id)
      .in("id", watchEntryIds);

    if (entriesError) throw entriesError;

    if ((selectedEntries ?? []).length !== watchEntryIds.length) {
      return NextResponse.json(
        { error: "One or more selected watched entries do not belong to this movie." },
        { status: 400 }
      );
    }

    const details = await getTmdbMovieDetails(Number(body.tmdbId));
    let targetMovieId: string | null = null;

    const { data: existingMovie, error: existingError } = await supabase
      .from("movies")
      .select("id")
      .eq("user_id", user.id)
      .eq("tmdb_id", details.tmdb_id)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingMovie) {
      targetMovieId = existingMovie.id;
    } else {
      let displayTitle = titleWithYear(details.display_title, details.release_date);
      let normalizedTitle = normalizeTitle(displayTitle);

      const { data: sameTitle } = await supabase
        .from("movies")
        .select("id")
        .eq("user_id", user.id)
        .eq("normalized_title", normalizedTitle)
        .maybeSingle();

      if (sameTitle) {
        displayTitle = `${displayTitle} [TMDB ${details.tmdb_id}]`;
        normalizedTitle = normalizeTitle(displayTitle);
      }

      const { data: insertedMovie, error: insertError } = await supabase
        .from("movies")
        .insert({
          user_id: user.id,
          display_title: displayTitle,
          normalized_title: normalizedTitle,
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
          match_confidence: body.score ?? 100
        })
        .select("id")
        .single();

      if (insertError) throw insertError;
      targetMovieId = insertedMovie.id;
    }

    if (targetMovieId === id) {
      return NextResponse.json(
        { error: "Choose a different TMDB movie before splitting watched entries." },
        { status: 400 }
      );
    }

    const { error: moveError } = await supabase
      .from("watch_entries")
      .update({ movie_id: targetMovieId })
      .eq("user_id", user.id)
      .eq("movie_id", id)
      .in("id", watchEntryIds);

    if (moveError) throw moveError;

    const { error: candidateError } = await supabase.from("movie_match_candidates").upsert(
      {
        user_id: user.id,
        movie_id: targetMovieId,
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

    await updateRewatchFlags(supabase, [id, targetMovieId]);

    return NextResponse.json({ ok: true, movieId: targetMovieId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
