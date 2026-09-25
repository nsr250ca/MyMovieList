"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Poster } from "@/components/poster";
import type { ScoredTmdbResult } from "@/lib/tmdb";

export type MatchReviewWatchEntry = {
  id: string;
  watched_on: string | null;
  source_title: string;
};

export function MatchReview({
  movieId,
  title,
  initialResults = [],
  startCollapsed = false,
  triggerLabel = "Search TMDB",
  watchEntries = [],
  allowSplit = false
}: {
  movieId: string;
  title: string;
  initialResults?: ScoredTmdbResult[];
  startCollapsed?: boolean;
  triggerLabel?: string;
  watchEntries?: MatchReviewWatchEntry[];
  allowSplit?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<ScoredTmdbResult[]>(initialResults);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(!startCollapsed);
  const [selectedWatchIds, setSelectedWatchIds] = useState<string[]>([]);

  function toggleWatchEntry(id: string) {
    setSelectedWatchIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

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

  async function split(tmdbId: number, score: number) {
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/movies/${movieId}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId, score, watchEntryIds: selectedWatchIds })
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not split watched entries.");
      return;
    }

    router.refresh();
  }

  if (!open) {
    return (
      <button className="ghost-button" type="button" onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className="match-workspace">
      {allowSplit && watchEntries.length > 0 ? (
        <div className="split-picker">
          <div>
            <p className="eyebrow">Split watched entries</p>
            <p className="muted">
              Select the dates that belong to a different release, then choose a TMDB result below.
            </p>
          </div>
          <div className="watch-chip-list">
            {watchEntries.map((entry) => (
              <label className="watch-chip" key={entry.id}>
                <input
                  type="checkbox"
                  checked={selectedWatchIds.includes(entry.id)}
                  onChange={() => toggleWatchEntry(entry.id)}
                />
                <span>{entry.watched_on ?? "No date"}</span>
                <span className="muted">{entry.source_title}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={search} disabled={loading}>
            {loading ? "Searching..." : "Search TMDB"}
          </button>
          {startCollapsed ? (
            <button className="ghost-button" type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          ) : null}
        </div>
      </div>
      {message ? <p className="danger">{message}</p> : null}
      {results.length > 0 ? (
        <div className="match-result-list">
          {results.map((result) => (
            <article className="match-result-card" key={result.id}>
              <Poster path={result.poster_path} title={result.title} />
              <div className="match-result-copy">
                <h3>{result.title}</h3>
                {result.original_title !== result.title ? (
                  <p className="muted">{result.original_title}</p>
                ) : null}
                <p className="muted">
                  {result.release_date ?? "Unknown release"} ·{" "}
                  {result.original_language ?? "Unknown language"} · {Math.round(result.score)} score
                </p>
              </div>
              <div className="match-result-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => accept(result.id, result.score)}
                  disabled={loading}
                >
                  Replace current match
                </button>
                {allowSplit ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => split(result.id, result.score)}
                    disabled={loading || selectedWatchIds.length === 0}
                  >
                    Split selected here
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
