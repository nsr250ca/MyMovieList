import { NextResponse } from "next/server";
import { normalizeTitle } from "@/lib/normalization";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      watchedOn?: string;
      rating?: string;
      platform?: string;
      notes?: string;
    };
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

    const { count } = await supabase
      .from("watch_entries")
      .select("*", { count: "exact", head: true })
      .eq("movie_id", movie.id);

    const rating = body.rating ? Number(body.rating) : null;
    const { error: watchError } = await supabase.from("watch_entries").insert({
      user_id: user.id,
      movie_id: movie.id,
      watched_on: body.watchedOn || null,
      source_title: title,
      rating: rating && Number.isFinite(rating) ? rating : null,
      platform: body.platform?.trim() || null,
      notes: body.notes?.trim() || null,
      is_rewatch: (count ?? 0) > 0
    });

    if (watchError) throw watchError;

    return NextResponse.json({ movieId: movie.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
