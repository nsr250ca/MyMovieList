import { NextResponse } from "next/server";
import { normalizeTitle } from "@/lib/normalization";
import { createClient } from "@/lib/supabase/server";
import { getTmdbMovieDetails } from "@/lib/tmdb";

type AddWatchRequest = {
  title?: string;
  watchedOn?: string;
  rating?: string;
  platform?: string;
  notes?: string;
  tmdbId?: number;
  score?: number;
};

function titleWithYear(title: string, releaseDate?: string | null) {
  const year = releaseDate?.slice(0, 4);
  return year ? `${title} (${year})` : title;
}

async function cacheAcceptedCandidate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  movieId: string,
  details: Awaited<ReturnType<typeof getTmdbMovieDetails>>,
  score?: number
) {
  const { error: candidateError } = await supabase.from("movie_match_candidates").upsert(
    {
      user_id: userId,
      movie_id: movieId,
      tmdb_id: details.tmdb_id,
      title: details.display_title,
      original_title: details.original_title,
      release_date: details.release_date,
      poster_path: details.tmdb_poster_path,
      original_language: details.original_language,
      score: score ?? 100,
      accepted: true,
      payload: details
    },
    { onConflict: "movie_id,tmdb_id" }
  );

  if (candidateError) throw candidateError;
}

async function findOrCreateMatchedMovie(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tmdbId: number,
  score?: number
) {
  const details = await getTmdbMovieDetails(tmdbId);

  const { data: existingMovie, error: existingError } = await supabase
    .from("movies")
    .select("id")
    .eq("user_id", userId)
    .eq("tmdb_id", details.tmdb_id)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existingMovie) {
    const { error: refreshError } = await supabase
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
        match_confidence: score ?? 100
      })
      .eq("id", existingMovie.id)
      .eq("user_id", userId);

    if (refreshError) throw refreshError;
    await cacheAcceptedCandidate(supabase, userId, existingMovie.id, details, score);

    return { movieId: existingMovie.id, details };
  }

  let displayTitle = titleWithYear(details.display_title, details.release_date);
  let normalizedTitle = normalizeTitle(displayTitle);

  const { data: sameTitle, error: sameTitleError } = await supabase
    .from("movies")
    .select("id")
    .eq("user_id", userId)
    .eq("normalized_title", normalizedTitle)
    .maybeSingle();

  if (sameTitleError) throw sameTitleError;

  if (sameTitle) {
    displayTitle = `${displayTitle} [TMDB ${details.tmdb_id}]`;
    normalizedTitle = normalizeTitle(displayTitle);
  }

  const { data: insertedMovie, error: insertError } = await supabase
    .from("movies")
    .insert({
      user_id: userId,
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
      match_confidence: score ?? 100
    })
    .select("id")
    .single();

  if (insertError) throw insertError;

  await cacheAcceptedCandidate(supabase, userId, insertedMovie.id, details, score);

  return { movieId: insertedMovie.id, details };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AddWatchRequest;
    const title = body.title?.trim();

    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in before adding a watched movie." }, { status: 401 });
    }

    let movieId: string;

    if (body.tmdbId) {
      const matchedMovie = await findOrCreateMatchedMovie(
        supabase,
        user.id,
        Number(body.tmdbId),
        body.score
      );
      movieId = matchedMovie.movieId;
    } else {
      const normalizedTitle = normalizeTitle(title);
      const { data: movie, error: movieError } = await supabase
        .from("movies")
        .upsert(
          {
            user_id: user.id,
            display_title: title,
            normalized_title: normalizedTitle,
            match_status: "unmatched"
          },
          { onConflict: "user_id,normalized_title" }
        )
        .select("id")
        .single();

      if (movieError || !movie) throw movieError ?? new Error("Could not save movie.");
      movieId = movie.id;
    }

    const { count } = await supabase
      .from("watch_entries")
      .select("*", { count: "exact", head: true })
      .eq("movie_id", movieId);

    const rating = body.rating ? Number(body.rating) : null;
    const { error: watchError } = await supabase.from("watch_entries").insert({
      user_id: user.id,
      movie_id: movieId,
      watched_on: body.watchedOn || null,
      source_title: title,
      rating: rating && Number.isFinite(rating) ? rating : null,
      platform: body.platform?.trim() || null,
      notes: body.notes?.trim() || null,
      is_rewatch: (count ?? 0) > 0
    });

    if (watchError) throw watchError;

    return NextResponse.json({ movieId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
