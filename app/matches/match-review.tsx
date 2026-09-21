"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScoredTmdbResult } from "@/lib/tmdb";

export function MatchReview({ movieId, title }: { movieId: string; title: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<ScoredTmdbResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/tmdb/search?query=${encodeURIComponent(query)}`);
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "TMDB search failed.");
      return;
    }

    setResults(payload.results);
  }

  async function accept(tmdbId: number, score: number) {
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/movies/${movieId}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId, score })
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not accept match.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="grid">
      <div className="toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="ghost-button" type="button" onClick={search} disabled={loading}>
          {loading ? "Searching..." : "Search TMDB"}
        </button>
      </div>
      {message ? <p className="danger">{message}</p> : null}
      {results.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Release</th>
                <th>Language</th>
                <th>Score</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id}>
                  <td>
                    {result.title}
                    {result.original_title !== result.title ? (
                      <div className="muted">{result.original_title}</div>
                    ) : null}
                  </td>
                  <td>{result.release_date ?? "Unknown"}</td>
                  <td>{result.original_language ?? "Unknown"}</td>
                  <td>{Math.round(result.score)}</td>
                  <td>
                    <button
                      className="button"
                      type="button"
                      onClick={() => accept(result.id, result.score)}
                      disabled={loading}
                    >
                      Accept
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
