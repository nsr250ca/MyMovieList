import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const workbookPath = process.argv[2] ?? "2011Movies.xlsx";
const workbook = XLSX.read(readFileSync(workbookPath), { type: "buffer", cellDates: false });

function excelSerialToIso(serial) {
  const base = Date.UTC(1899, 11, 30);
  return new Date(base + Number(serial) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const summary = workbook.SheetNames.map((sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
  let count = 0;
  let warnings = 0;
  let firstDate = null;
  let lastDate = null;
  const year = /^\d{4}$/.test(sheetName) ? Number(sheetName) : null;

  rows.forEach((row) => {
    const date = typeof row[0] === "number" ? excelSerialToIso(row[0]) : null;
    ["B", "C", "D"].forEach((slot) => {
      const value = row[slot.charCodeAt(0) - 65];
      if (typeof value !== "string" || !value.trim()) return;
      count += 1;
      if (date) {
        firstDate = firstDate && firstDate < date ? firstDate : date;
        lastDate = lastDate && lastDate > date ? lastDate : date;
        if (year && Number(date.slice(0, 4)) !== year) warnings += 1;
      } else {
        warnings += 1;
      }
    });
  });

  return { sheet: sheetName, count, firstDate, lastDate, warnings };
});

console.table(summary);
console.log("Total entries:", summary.reduce((total, row) => total + row.count, 0));
