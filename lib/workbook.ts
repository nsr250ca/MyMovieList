import * as XLSX from "xlsx";
import { excelSerialToDate, normalizeTitle, toIsoDate } from "@/lib/normalization";

export type ParsedWatchEntry = {
  id: string;
  sheet: string;
  row: number;
  slot: string;
  watchedOn: string | null;
  sourceTitle: string;
  normalizedTitle: string;
  warnings: string[];
};

export type WorkbookParseResult = {
  sourceName: string;
  entries: ParsedWatchEntry[];
  warnings: string[];
  yearSummaries: {
    sheet: string;
    entryCount: number;
    warningCount: number;
    firstDate: string | null;
    lastDate: string | null;
  }[];
};

const titleColumns = ["B", "C", "D"];

function columnLabel(index: number) {
  let dividend = index + 1;
  let label = "";

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    label = String.fromCharCode(65 + modulo) + label;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return label;
}

function readDate(value: unknown) {
  if (value instanceof Date) return toIsoDate(value);
  if (typeof value === "number") return toIsoDate(excelSerialToDate(value));
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : toIsoDate(parsed);
  }
  return null;
}

export function parseWorkbook(buffer: ArrayBuffer | Buffer, sourceName = "2011Movies.xlsx") {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const entries: ParsedWatchEntry[] = [];
  const warnings: string[] = [];
  const yearSummaries: WorkbookParseResult["yearSummaries"] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      blankrows: false
    });

    const sheetYear = /^\d{4}$/.test(sheetName) ? Number(sheetName) : null;
    let entryCount = 0;
    let warningCount = 0;
    let firstDate: string | null = null;
    let lastDate: string | null = null;

    rows.forEach((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const watchedOn = readDate(row[0]);

      titleColumns.forEach((slot) => {
        const columnIndex = slot.charCodeAt(0) - 65;
        const rawTitle = row[columnIndex];

        if (typeof rawTitle !== "string" && typeof rawTitle !== "number") return;

        const sourceTitle = String(rawTitle).trim();
        if (!sourceTitle) return;

        const entryWarnings: string[] = [];

        if (!watchedOn) {
          entryWarnings.push("Missing watched date");
        } else {
          firstDate = firstDate && firstDate < watchedOn ? firstDate : watchedOn;
          lastDate = lastDate && lastDate > watchedOn ? lastDate : watchedOn;

          if (sheetYear && Number(watchedOn.slice(0, 4)) !== sheetYear) {
            entryWarnings.push(`Date year ${watchedOn.slice(0, 4)} differs from sheet ${sheetName}`);
          }
        }

        if (entryWarnings.length > 0) {
          warningCount += entryWarnings.length;
          warnings.push(`${sheetName}!${slot}${rowNumber}: ${entryWarnings.join("; ")}`);
        }

        entries.push({
          id: `${sheetName}-${rowNumber}-${slot}`,
          sheet: sheetName,
          row: rowNumber,
          slot,
          watchedOn,
          sourceTitle,
          normalizedTitle: normalizeTitle(sourceTitle),
          warnings: entryWarnings
        });
        entryCount += 1;
      });

      if (row.length > 4 && typeof row[4] === "string" && row[4].trim()) {
        warnings.push(`${sheetName}!${columnLabel(4)}${rowNumber}: ignored non-title helper value`);
      }
    });

    yearSummaries.push({
      sheet: sheetName,
      entryCount,
      warningCount,
      firstDate,
      lastDate
    });
  });

  return { sourceName, entries, warnings, yearSummaries };
}
