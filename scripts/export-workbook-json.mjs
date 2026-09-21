import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";

const workbookPath = process.argv[2] ?? "2011Movies.xlsx";
const outputPath = process.argv[3] ?? "tmp-workbook-import.json";

function normalizeTitle(title) {
  return title
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/[’`]/g, "'")
    .toLocaleLowerCase();
}

function excelSerialToIso(serial) {
  const base = Date.UTC(1899, 11, 30);
  const date = new Date(base + Number(serial) * 24 * 60 * 60 * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

const workbook = XLSX.read(readFileSync(workbookPath), { type: "buffer", cellDates: false });
const entries = [];
const warnings = [];
const yearSummaries = [];

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
  const year = /^\d{4}$/.test(sheetName) ? Number(sheetName) : null;
  let count = 0;
  let warningCount = 0;
  let firstDate = null;
  let lastDate = null;

  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const watchedOn = typeof row[0] === "number" ? excelSerialToIso(row[0]) : null;

    for (const slot of ["B", "C", "D"]) {
      const value = row[slot.charCodeAt(0) - 65];
      if (typeof value !== "string" && typeof value !== "number") continue;

      const sourceTitle = String(value).trim();
      if (!sourceTitle) continue;

      const entryWarnings = [];
      if (!watchedOn) {
        entryWarnings.push("Missing watched date");
      } else {
        firstDate = firstDate && firstDate < watchedOn ? firstDate : watchedOn;
        lastDate = lastDate && lastDate > watchedOn ? lastDate : watchedOn;
        if (year && Number(watchedOn.slice(0, 4)) !== year) {
          entryWarnings.push(`Date year ${watchedOn.slice(0, 4)} differs from sheet ${sheetName}`);
        }
      }

      if (entryWarnings.length > 0) {
        warningCount += entryWarnings.length;
        warnings.push(`${sheetName}!${slot}${rowNumber}: ${entryWarnings.join("; ")}`);
      }

      entries.push({
        sheet: sheetName,
        row: rowNumber,
        slot,
        watchedOn,
        sourceTitle,
        normalizedTitle: normalizeTitle(sourceTitle)
      });
      count += 1;
    }
  });

  yearSummaries.push({ sheet: sheetName, count, firstDate, lastDate, warnings: warningCount });
}

const movieMap = new Map();
for (const entry of entries) {
  if (!movieMap.has(entry.normalizedTitle)) {
    movieMap.set(entry.normalizedTitle, {
      displayTitle: entry.sourceTitle,
      normalizedTitle: entry.normalizedTitle
    });
  }
}

writeFileSync(
  outputPath,
  JSON.stringify(
    {
      sourceName: basename(workbookPath),
      entries,
      movies: Array.from(movieMap.values()),
      warnings,
      yearSummaries
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      outputPath,
      entries: entries.length,
      uniqueMovies: movieMap.size,
      warnings: warnings.length
    },
    null,
    2
  )
);
