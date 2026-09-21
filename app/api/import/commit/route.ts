import { NextResponse } from "next/server";
import { normalizeTitle } from "@/lib/normalization";
import { createClient } from "@/lib/supabase/server";
import type { ParsedWatchEntry, WorkbookParseResult } from "@/lib/workbook";

function uniqueTitles(entries: ParsedWatchEntry[]) {
  const byTitle = new Map<string, ParsedWatchEntry>();
  entries.forEach((entry) => {
    if (!byTitle.has(entry.normalizedTitle)) byTitle.set(entry.normalizedTitle, entry);
  });
  return Array.from(byTitle.values());
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as WorkbookParseResult;
    const supabase = await createClient();
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Sign in before importing." }, { status: 401 });
    }

    const entries = payload.entries ?? [];
    if (entries.length === 0) {
      return NextResponse.json({ error: "No entries to import." }, { status: 400 });
    }

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        user_id: user.id,
        source_name: payload.sourceName ?? "workbook.xlsx",
        parsed_count: entries.length,
        warning_count: payload.warnings?.length ?? 0,
        warnings: payload.warnings ?? []
      })
      .select("id")
      .single();

    if (batchError || !batch) throw batchError ?? new Error("Could not create import batch.");

    const movieRows = uniqueTitles(entries).map((entry) => ({
      user_id: user.id,
      display_title: entry.sourceTitle,
      normalized_title: normalizeTitle(entry.sourceTitle),
      match_status: "unmatched" as const
    }));

    const { error: movieError } = await supabase
      .from("movies")
      .upsert(movieRows, { onConflict: "user_id,normalized_title" });

    if (movieError) throw movieError;

    const normalizedTitles = Array.from(new Set(entries.map((entry) => entry.normalizedTitle)));
    const { data: movies, error: lookupError } = await supabase
      .from("movies")
      .select("id, normalized_title")
      .in("normalized_title", normalizedTitles);

    if (lookupError) throw lookupError;

    const movieIdByTitle = new Map((movies ?? []).map((movie) => [movie.normalized_title, movie.id]));
    const movieIds = Array.from(movieIdByTitle.values());
    const { data: existingEntries } = await supabase
      .from("watch_entries")
      .select("movie_id")
      .in("movie_id", movieIds);

    const watchCounts = new Map<string, number>();
    (existingEntries ?? []).forEach((entry) => {
      watchCounts.set(entry.movie_id, (watchCounts.get(entry.movie_id) ?? 0) + 1);
    });

    const watchRows = entries.flatMap((entry) => {
      const movieId = movieIdByTitle.get(entry.normalizedTitle);
      if (!movieId) return [];
      const priorCount = watchCounts.get(movieId) ?? 0;
      watchCounts.set(movieId, priorCount + 1);

      return [
        {
          user_id: user.id,
          movie_id: movieId,
          watched_on: entry.watchedOn,
          source_title: entry.sourceTitle,
          source_sheet: entry.sheet,
          source_row: entry.row,
          source_slot: entry.slot,
          import_batch_id: batch.id,
          is_rewatch: priorCount > 0
        }
      ];
    });

    const { error: watchError } = await supabase.from("watch_entries").insert(watchRows);
    if (watchError) throw watchError;

    const { error: updateError } = await supabase
      .from("import_batches")
      .update({
        status: "committed",
        committed_count: watchRows.length,
        committed_at: new Date().toISOString()
      })
      .eq("id", batch.id);

    if (updateError) throw updateError;

    return NextResponse.json({ batchId: batch.id, committedCount: watchRows.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
