/** "Equity Scheme - Flexi Cap Fund" -> "Flexi Cap Fund": the text after the first " - ". Display only. */
export function categoryLabel(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "—";
  const at = text.indexOf(" - ");
  return at === -1 ? text : text.slice(at + 3).trim() || text;
}
