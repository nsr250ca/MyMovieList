export function normalizeTitle(title: string) {
  return title
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/[’`]/g, "'")
    .toLocaleLowerCase();
}

export function compactTitle(title: string) {
  return normalizeTitle(title).replace(/[^a-z0-9\u3400-\u9fff]+/gi, "");
}

export function excelSerialToDate(serial: number) {
  const base = Date.UTC(1899, 11, 30);
  return new Date(base + serial * 24 * 60 * 60 * 1000);
}

export function toIsoDate(date: Date) {
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
