import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const workbookPath = process.argv[2] ?? "2011Movies.xlsx";
const targetEmail = process.argv[3] ?? "demo.moviejournal@example.com";

function readEnv() {
  const env = {};
  const content = readFileSync(".env.local", "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, "");
  }

  return env;
}

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

function parseWorkbook(path) {
  const workbook = XLSX.read(readFileSync(path), { type: "buffer", cellDates: false });
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
          normalizedTitle: normalizeTitle(sourceTitle),
          warnings: entryWarnings
        });
        count += 1;
      }
    });

    yearSummaries.push({ sheet: sheetName, count, firstDate, lastDate, warnings: warningCount });
  }

  return { entries, warnings, yearSummaries };
}

async function getUserId(supabase, email) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user.id;
    if (data.users.length < perPage) break;
    page += 1;
  }

  throw new Error(`Could not find Supabase Auth user ${email}.`);
}

async function main() {
  const env = readEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const userId = await getUserId(supabase, targetEmail);
  const { entries, warnings, yearSummaries } = parseWorkbook(workbookPath);

  const { count: existingCount, error: countError } = await supabase
    .from("watch_entries")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) throw countError;
  if ((existingCount ?? 0) > 0) {
    throw new Error(
      `User already has ${existingCount} watch entries. Refusing to import duplicates.`
    );
  }

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      user_id: userId,
      source_name: workbookPath,
      parsed_count: entries.length,
      warning_count: warnings.length,
      warnings
    })
    .select("id")
    .single();

  if (batchError) throw batchError;

  const uniqueTitleMap = new Map();
  for (const entry of entries) {
    if (!uniqueTitleMap.has(entry.normalizedTitle)) uniqueTitleMap.set(entry.normalizedTitle, entry);
  }

  const movieRows = Array.from(uniqueTitleMap.values()).map((entry) => ({
    user_id: userId,
    display_title: entry.sourceTitle,
    normalized_title: entry.normalizedTitle,
    match_status: "unmatched"
  }));

  for (let index = 0; index < movieRows.length; index += 500) {
    const { error } = await supabase
      .from("movies")
      .upsert(movieRows.slice(index, index + 500), { onConflict: "user_id,normalized_title" });
    if (error) throw error;
  }

  const movieIdByTitle = new Map();
  const normalizedTitles = Array.from(uniqueTitleMap.keys());
  for (let index = 0; index < normalizedTitles.length; index += 500) {
    const { data, error } = await supabase
      .from("movies")
      .select("id, normalized_title")
      .eq("user_id", userId)
      .in("normalized_title", normalizedTitles.slice(index, index + 500));
    if (error) throw error;
    for (const movie of data) movieIdByTitle.set(movie.normalized_title, movie.id);
  }

  const watchCounts = new Map();
  const watchRows = entries.map((entry) => {
    const movieId = movieIdByTitle.get(entry.normalizedTitle);
    if (!movieId) throw new Error(`Missing movie ID for ${entry.sourceTitle}.`);
    const priorCount = watchCounts.get(movieId) ?? 0;
    watchCounts.set(movieId, priorCount + 1);

    return {
      user_id: userId,
      movie_id: movieId,
      watched_on: entry.watchedOn,
      source_title: entry.sourceTitle,
      source_sheet: entry.sheet,
      source_row: entry.row,
      source_slot: entry.slot,
      import_batch_id: batch.id,
      is_rewatch: priorCount > 0
    };
  });

  for (let index = 0; index < watchRows.length; index += 500) {
    const { error } = await supabase.from("watch_entries").insert(watchRows.slice(index, index + 500));
    if (error) throw error;
  }

  const { error: updateError } = await supabase
    .from("import_batches")
    .update({
      status: "committed",
      committed_count: watchRows.length,
      committed_at: new Date().toISOString()
    })
    .eq("id", batch.id);

  if (updateError) throw updateError;

  console.table(yearSummaries);
  console.log(
    JSON.stringify(
      {
        importedFor: targetEmail,
        userId,
        importBatchId: batch.id,
        uniqueMovies: movieRows.length,
        watchEntries: watchRows.length,
        warnings: warnings.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
