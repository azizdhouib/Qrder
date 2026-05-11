export type CsvSeparator = "comma" | "semicolon";

function escapeCell(value: string | number | boolean | null | undefined, sep: string): string {
  const t = value === null || value === undefined ? "" : String(value);
  if (t.includes('"') || t.includes(sep) || t.includes("\n") || t.includes("\r")) {
    return `"${t.replace(/"/g, '""')}"`;
  }
  return t;
}

/** UTF-8 BOM + lignes (compat Excel FR avec séparateur `;`). */
export function rowsToCsv(rows: (string | number | boolean | null | undefined)[][], separator: CsvSeparator): string {
  const sep = separator === "semicolon" ? ";" : ",";
  const lines = rows.map((r) => r.map((c) => escapeCell(c, sep)).join(sep));
  return `\ufeff${lines.join("\r\n")}`;
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}
