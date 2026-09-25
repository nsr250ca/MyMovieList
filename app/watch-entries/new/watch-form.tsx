"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Poster } from "@/components/poster";
import type { ScoredTmdbResult } from "@/lib/tmdb";

type FormValues = {
  title: string;
  watchedOn: string;
  rating: string;
  platform: string;
  notes: string;
};

const initialValues: FormValues = {
  title: "",
  watchedOn: "",
  rating: "",
  platform: "",
  notes: ""
};

export function AddWatchForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingTmdbId, setSavingTmdbId] = useState<number | "unmatched" | null>(null);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [results, setResults] = useState<ScoredTmdbResult[]>([]);
  const [searched, setSearched] = useState(false);

  function updateField(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (field === "title") {
      setResults([]);
      setSearched(false);
    }
  }

  async function findMatches(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = values.title.trim();
    if (!title) {
      setMessage("Title is required.");
      return;
    }

    setLoading(true);
    setMessage(null);
    setSearched(false);

    const response = await fetch(`/api/tmdb/search?query=${encodeURIComponent(title)}`);
    const payload = (await response.json()) as { error?: string; results?: ScoredTmdbResult[] };

    setLoading(false);
    setSearched(true);

    if (!response.ok) {
      setMessage(payload.error ?? "TMDB search failed.");
      return;
    }

    setResults(payload.results ?? []);
  }

  async function save(match?: ScoredTmdbResult) {
    const title = values.title.trim();
    if (!title) {
      setMessage("Title is required.");
      return;
    }

    setSavingTmdbId(match?.id ?? "unmatched");
    setMessage(null);

    const response = await fetch("/api/watch-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        title,
        tmdbId: match?.id,
        score: match?.score
      })
    });
    const payload = (await response.json()) as { error?: string; movieId?: string };
    setSavingTmdbId(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not save watched movie.");
      return;
    }

    router.push(payload.movieId ? `/movies/${payload.movieId}` : "/movies");
    router.refresh();
  }

  return (
    <form className="form-panel grid" onSubmit={findMatches}>
      <div className="form-grid">
        <label>
          Title
          <input
            name="title"
            required
            placeholder="Black Swan"
            value={values.title}
            onChange={(event) => updateField("title", event.target.value)}
          />
        </label>
        <label>
          Watched date
          <input
            name="watchedOn"
            type="date"
            value={values.watchedOn}
            onChange={(event) => updateField("watchedOn", event.target.value)}
          />
        </label>
        <label>
          Rating
          <input
            name="rating"
            type="number"
            min="1"
            max="10"
            placeholder="1-10"
            value={values.rating}
            onChange={(event) => updateField("rating", event.target.value)}
          />
        </label>
        <label>
          Platform
          <input
            name="platform"
            placeholder="Netflix, theatre, flight..."
            value={values.platform}
            onChange={(event) => updateField("platform", event.target.value)}
          />
        </label>
      </div>
      <label>
        Notes
        <textarea
          name="notes"
          rows={4}
          placeholder="Optional memory or context"
          value={values.notes}
          onChange={(event) => updateField("notes", event.target.value)}
        />
      </label>
      {message ? <p className="danger">{message}</p> : null}
      <div className="button-row add-watch-actions">
        <button className="button" type="submit" disabled={loading || savingTmdbId !== null}>
          {loading ? "Searching..." : "Find TMDB matches"}
        </button>
        {searched ? (
          <button
            className="ghost-button"
            type="button"
            disabled={savingTmdbId !== null || loading}
            onClick={() => save()}
          >
            {savingTmdbId === "unmatched" ? "Saving..." : "Save without TMDB"}
          </button>
        ) : null}
      </div>
      {searched ? (
        <section className="add-match-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Choose match</p>
              <h2>Save watched movie</h2>
            </div>
            <span className="status-pill">{results.length} results</span>
          </div>
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
                      {result.original_language ?? "Unknown language"} ·{" "}
                      {Math.round(result.score)} score
                    </p>
                    {result.overview ? <p>{result.overview}</p> : null}
                  </div>
                  <div className="match-result-actions">
                    <button
                      className="button"
                      type="button"
                      disabled={savingTmdbId !== null || loading}
                      onClick={() => save(result)}
                    >
                      {savingTmdbId === result.id ? "Saving..." : "Save with this match"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No TMDB results found.</p>
          )}
        </section>
      ) : null}
    </form>
  );
}
