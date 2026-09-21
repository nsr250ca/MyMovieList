"use client";

import { useState } from "react";
import type { WorkbookParseResult } from "@/lib/workbook";

export function ImportClient() {
  const [result, setResult] = useState<WorkbookParseResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function parseLocal() {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/import/parse?local=1", { method: "POST" });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not parse workbook.");
      return;
    }

    setResult(payload);
  }

  async function parseUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMessage(null);
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/import/parse", {
      method: "POST",
      body: formData
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not parse workbook.");
      return;
    }

    setResult(payload);
  }

  async function commit() {
    if (!result) return;
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Could not commit import.");
      return;
    }

    setMessage(`Committed ${payload.committedCount} watched entries.`);
  }

  return (
    <div className="grid">
      <section className="form-panel grid">
        <div className="toolbar">
          <button className="button" type="button" onClick={parseLocal} disabled={loading}>
            {loading ? "Parsing..." : "Parse included workbook"}
          </button>
          <label style={{ maxWidth: 360 }}>
            Or upload workbook
            <input type="file" accept=".xlsx,.xls" onChange={parseUpload} />
          </label>
        </div>
        {message ? <p className={message.startsWith("Committed") ? "muted" : "danger"}>{message}</p> : null}
      </section>

      {result ? (
        <>
          <section className="metrics">
            <div className="card">
              <span className="metric-label">Parsed entries</span>
              <strong className="metric-value">{result.entries.length}</strong>
            </div>
            <div className="card">
              <span className="metric-label">Warnings</span>
              <strong className="metric-value">{result.warnings.length}</strong>
            </div>
            <div className="card">
              <span className="metric-label">Sheets</span>
              <strong className="metric-value">{result.yearSummaries.length}</strong>
            </div>
            <div className="card">
              <span className="metric-label">Source</span>
              <strong className="metric-value" style={{ fontSize: 20 }}>
                {result.sourceName}
              </strong>
            </div>
          </section>

          <button className="button" type="button" onClick={commit} disabled={loading}>
            Commit approved import
          </button>

          <section className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sheet</th>
                  <th>Entries</th>
                  <th>First date</th>
                  <th>Last date</th>
                  <th>Warnings</th>
                </tr>
              </thead>
              <tbody>
                {result.yearSummaries.map((summary) => (
                  <tr key={summary.sheet}>
                    <td>{summary.sheet}</td>
                    <td>{summary.entryCount}</td>
                    <td>{summary.firstDate ?? "None"}</td>
                    <td>{summary.lastDate ?? "None"}</td>
                    <td>{summary.warningCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {result.warnings.length > 0 ? (
            <section className="card warning">
              <p className="eyebrow">Review warnings</p>
              <ul>
                {result.warnings.slice(0, 30).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              {result.warnings.length > 30 ? (
                <p className="muted">{result.warnings.length - 30} more warnings hidden.</p>
              ) : null}
            </section>
          ) : null}

          <section className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Watched</th>
                  <th>Title</th>
                  <th>Cell</th>
                  <th>Warning</th>
                </tr>
              </thead>
              <tbody>
                {result.entries.slice(0, 80).map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.watchedOn ?? "No date"}</td>
                    <td>{entry.sourceTitle}</td>
                    <td>
                      {entry.sheet}!{entry.slot}
                      {entry.row}
                    </td>
                    <td>{entry.warnings.join("; ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}
