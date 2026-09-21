import { getTmdbToken } from "@/lib/env";
import { titleSimilarity } from "@/lib/fuzzy";

const TMDB_API = "https://api.themoviedb.org/3";
const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

export type TmdbSearchResult = {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  original_language?: string;
  vote_count?: number;
  popularity?: number;
};

export type ScoredTmdbResult = TmdbSearchResult & {
  score: number;
};

type TmdbSearchResponse = {
  results: TmdbSearchResult[];
};

type TmdbDetails = TmdbSearchResult & {
  runtime?: number | null;
  genres?: { id: number; name: string }[];
  credits?: {
    crew?: { id: number; name: string; job: string }[];
    cast?: { id: number; name: string; character?: string; order?: number }[];
  };
};

function authHeaders() {
  const token = getTmdbToken();

  if (!token) {
    throw new Error("Missing TMDB_ACCESS_TOKEN.");
  }

  return {
    Authorization: `Bearer ${token}`,
    accept: "application/json"
  };
}

async function tmdbFetch<T>(path: string) {
  const response = await fetch(`${TMDB_API}${path}`, {
    headers: authHeaders(),
    next: { revalidate: 60 * 60 * 24 }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`TMDB request failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

function searchPaths(query: string, watchedYear?: string | null) {
  const params = new URLSearchParams({
    query,
    include_adult: "false"
  });

  const year = watchedYear?.slice(0, 4);
  if (year) params.set("year", year);

  const languages = ["en-US", "zh-HK", "zh-CN"];
  return languages.map((language) => `/search/movie?${params.toString()}&language=${language}`);
}

export async function searchTmdbMovies(query: string, watchedOn?: string | null) {
  const responses = await Promise.all(
    searchPaths(query, watchedOn).map((path) => tmdbFetch<TmdbSearchResponse>(path))
  );
  const byId = new Map<number, TmdbSearchResult>();

  responses.flatMap((response) => response.results).forEach((result) => {
    if (!byId.has(result.id)) byId.set(result.id, result);
  });

  return Array.from(byId.values())
    .map((result) => {
      const titleScore = Math.max(
        titleSimilarity(query, result.title),
        titleSimilarity(query, result.original_title)
      );
      const popularityBoost = Math.min(8, Math.log10((result.vote_count ?? 0) + 1) * 2);

      return {
        ...result,
        score: Math.min(100, Math.round((titleScore + popularityBoost) * 100) / 100)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export async function getTmdbMovieDetails(tmdbId: number) {
  const details = await tmdbFetch<TmdbDetails>(
    `/movie/${tmdbId}?language=en-US&append_to_response=credits`
  );

  const directors =
    details.credits?.crew
      ?.filter((person) => person.job === "Director")
      .map((person) => ({ id: person.id, name: person.name })) ?? [];

  const cast =
    details.credits?.cast
      ?.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .slice(0, 10)
      .map((person) => ({
        id: person.id,
        name: person.name,
        character: person.character ?? null
      })) ?? [];

  return {
    tmdb_id: details.id,
    display_title: details.title,
    original_title: details.original_title,
    tmdb_poster_path: details.poster_path ?? null,
    tmdb_backdrop_path: details.backdrop_path ?? null,
    overview: details.overview ?? null,
    release_date: details.release_date || null,
    runtime_minutes: details.runtime ?? null,
    original_language: details.original_language ?? null,
    genres: details.genres ?? [],
    directors,
    cast_members: cast
  };
}

export function posterUrl(path?: string | null) {
  return path ? `${POSTER_BASE}${path}` : null;
}
