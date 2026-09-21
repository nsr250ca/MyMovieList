"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddWatchForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/watch-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const payload = (await response.json()) as { error?: string; movieId?: string };
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not save watched movie.");
      return;
    }

    router.push(payload.movieId ? `/movies/${payload.movieId}` : "/movies");
    router.refresh();
  }

  return (
    <form className="form-panel grid" onSubmit={submit}>
      <div className="form-grid">
        <label>
          Title
          <input name="title" required placeholder="Black Swan" />
        </label>
        <label>
          Watched date
          <input name="watchedOn" type="date" />
        </label>
        <label>
          Rating
          <input name="rating" type="number" min="1" max="10" placeholder="1-10" />
        </label>
        <label>
          Platform
          <input name="platform" placeholder="Netflix, theatre, flight..." />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" rows={4} placeholder="Optional memory or context" />
      </label>
      {message ? <p className="danger">{message}</p> : null}
      <button className="button" type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save watched movie"}
      </button>
    </form>
  );
}
