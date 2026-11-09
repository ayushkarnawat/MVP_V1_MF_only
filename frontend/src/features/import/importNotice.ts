import type { ImportConfirmResponse, NewFund } from "./types";

export interface ImportNotice {
  text: string;
  details?: string[];
  newFunds?: NewFund[];
  members?: { name: string; added: number; skipped: number }[];
  warnings?: string[];
  counts?: { newFunds: number; added: number; skipped: number };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The notice shown on the page the person returns to. Without new funds the text is exactly what it was before. */
export function buildImportNotice(result: ImportConfirmResponse): ImportNotice {
  const newFunds = result.people.flatMap(person => person.new_funds ?? []);
  const lines = [
    ...(result.people.length > 1 ? result.people.map(p =>
      `${p.name}: ${p.added} added${p.skipped > 0 ? `, ${p.skipped} already saved` : ""}`) : []),
  ];
  const members = result.people.length > 1
    ? result.people.map(p => ({ name: p.name, added: p.added, skipped: p.skipped }))
    : undefined;
  const warnings = result.warnings && result.warnings.length > 0 ? result.warnings : undefined;

  if (newFunds.length === 0) {
    const details = [...lines, ...result.warnings];
    return {
      text: `${result.added} transaction${result.added === 1 ? "" : "s"} added${result.skipped > 0 ? ` · ${result.skipped} already saved` : ""}`,
      ...(details.length ? { details } : {}),
      ...(members ? { members } : {}),
      ...(warnings ? { warnings } : {}),
    };
  }
  const names = newFunds.slice(0, 2).map(fund => fund.scheme_name).join(", ");
  const rest = newFunds.length - 2;
  const details = [...lines, `New funds: ${names}${rest > 0 ? ` and ${rest} more` : ""}`, ...result.warnings];
  return {
    text: `Import complete · ${plural(newFunds.length, "new fund", "new funds")}, ${plural(result.added, "transaction", "transactions")} added`,
    ...(details.length ? { details } : {}),
    newFunds,
    counts: { newFunds: newFunds.length, added: result.added, skipped: result.skipped },
    ...(members ? { members } : {}),
    ...(warnings ? { warnings } : {}),
  };
}
