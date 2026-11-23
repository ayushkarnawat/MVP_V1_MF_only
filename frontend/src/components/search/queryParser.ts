import { normalise } from "./matcher";

/** Structured parts extracted from a search query string. */
export interface ParsedQuery {
  words: string[];
  typeWord?: string;
  year?: number;
  month?: string;
  amount?: string;
}

const TYPE_WORDS: Record<string, string> = {
  purchase: "purchase",
  purchases: "purchase",
  redemption: "redemption",
  redemptions: "redemption",
  switch: "switch",
  switches: "switch",
};

const MONTH_WORDS: Record<string, string> = {
  jan: "jan",
  january: "jan",
  feb: "feb",
  february: "feb",
  mar: "mar",
  march: "mar",
  apr: "apr",
  april: "apr",
  may: "may",
  jun: "jun",
  june: "jun",
  jul: "jul",
  july: "jul",
  aug: "aug",
  august: "aug",
  sep: "sep",
  sept: "sep",
  september: "sep",
  oct: "oct",
  october: "oct",
  nov: "nov",
  november: "nov",
  dec: "dec",
  december: "dec",
};

function parseYear(token: string): number | undefined {
  if (!/^\d{4}$/.test(token)) return undefined;
  const n = Number(token);
  return n >= 1990 && n <= 2100 ? n : undefined;
}

function isNumericAmount(token: string): boolean {
  return /^\d+(\.\d+)?$/.test(token);
}

/**
 * Parses a raw search query into normalised text words plus optional
 * transaction type word, year, month (only when paired with a year), and amount.
 */
export function parseQuery(text: string): ParsedQuery {
  const norm = normalise(text);
  if (!norm) return { words: [] };

  const tokens = norm.split(" ");
  let typeWord: string | undefined;
  let year: number | undefined;
  let amount: string | undefined;
  const remaining: string[] = [];

  for (const token of tokens) {
    if (!typeWord && TYPE_WORDS[token]) {
      typeWord = TYPE_WORDS[token];
      continue;
    }
    const maybeYear = parseYear(token);
    if (year === undefined && maybeYear !== undefined) {
      year = maybeYear;
      continue;
    }
    if (amount === undefined && isNumericAmount(token)) {
      amount = token;
      continue;
    }
    remaining.push(token);
  }

  let month: string | undefined;
  const words: string[] = [];
  for (const token of remaining) {
    if (year !== undefined && month === undefined && MONTH_WORDS[token]) {
      month = MONTH_WORDS[token];
      continue;
    }
    words.push(token);
  }

  const result: ParsedQuery = { words };
  if (typeWord !== undefined) result.typeWord = typeWord;
  if (year !== undefined) result.year = year;
  if (month !== undefined) result.month = month;
  if (amount !== undefined) result.amount = amount;
  return result;
}
