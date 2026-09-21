import { NextResponse } from "next/server";
import { searchTmdbMovies } from "@/lib/tmdb";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim();
    const watchedOn = url.searchParams.get("watchedOn");

    if (!query) {
      return NextResponse.json({ error: "Query is required." }, { status: 400 });
    }

    const results = await searchTmdbMovies(query, watchedOn);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
