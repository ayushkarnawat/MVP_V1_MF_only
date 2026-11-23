/** Field metadata for search matching. */
export interface SearchableField {
  value: string;
  kind: "name" | "alias" | "text" | "amount";
}

/** Item composed of searchable fields. */
export interface SearchableItem {
  fields: SearchableField[];
}

/**
 * Normalises text for matching: lower-case, strip "₹" and commas,
 * treat "-" and "&" as spaces, collapse whitespace, and trim.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[₹,]/g, "")
    .replace(/[-&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bounded Damerau-Levenshtein distance (adjacent transposition = 1 edit). */
function damerauDistance(a: string, b: string, maxEdits: number): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > maxEdits) return maxEdits + 1;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    let rowMin = maxEdits + 1;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxEdits && i < m) {
      // Continue safely; early-exit only if no transposition across rows can recover
    }
  }
  return dp[m][n];
}

function allowedEdits(wordLength: number): number {
  if (wordLength >= 8) return 2;
  if (wordLength >= 4) return 1;
  return 0;
}

interface WordMatch {
  exact: boolean;
  inName: boolean;
  nameWordStart: boolean;
  edits: number;
}

function matchWordInField(word: string, fieldNorm: string, fieldKind: SearchableField["kind"]): WordMatch | null {
  if (!fieldNorm) return null;
  const fieldWords = fieldNorm.split(" ");
  const isName = fieldKind === "name";

  for (const fw of fieldWords) {
    if (fw.startsWith(word)) {
      return { exact: true, inName: isName, nameWordStart: isName, edits: 0 };
    }
  }

  if (word.length >= 3 && fieldNorm.includes(word)) {
    return { exact: true, inName: isName, nameWordStart: false, edits: 0 };
  }

  if (!isName) return null;

  const maxEdits = allowedEdits(word.length);
  if (maxEdits === 0) return null;

  let bestEdits = maxEdits + 1;
  for (const fw of fieldWords) {
    const dist = damerauDistance(word, fw, maxEdits);
    if (dist <= maxEdits && dist < bestEdits) {
      bestEdits = dist;
    }
  }

  if (bestEdits <= maxEdits) {
    return { exact: false, inName: true, nameWordStart: false, edits: bestEdits };
  }

  return null;
}

function pickBetterMatch(a: WordMatch | null, b: WordMatch | null): WordMatch | null {
  if (!a) return b;
  if (!b) return a;
  if (a.exact !== b.exact) return a.exact ? a : b;
  if (a.nameWordStart !== b.nameWordStart) return a.nameWordStart ? a : b;
  if (a.inName !== b.inName) return a.inName ? a : b;
  return a.edits <= b.edits ? a : b;
}

/**
 * Matches normalised query words against a searchable item.
 * Returns a positive rank (higher is better), or 0 if no match.
 */
export function matchesItem(words: string[], item: SearchableItem): number {
  const cleanWords = words.map((w) => normalise(w)).filter(Boolean);
  if (cleanWords.length === 0) return 0;

  const normFields = item.fields.map((f) => ({
    kind: f.kind,
    norm: normalise(f.value),
  }));

  let allExact = true;
  let allNameWordStart = true;
  let anyNameWordStart = false;
  let totalEdits = 0;

  for (const qw of cleanWords) {
    let best: WordMatch | null = null;
    for (const f of normFields) {
      best = pickBetterMatch(best, matchWordInField(qw, f.norm, f.kind));
    }
    if (!best) return 0;
    if (!best.exact) allExact = false;
    if (!best.nameWordStart) allNameWordStart = false;
    if (best.nameWordStart) anyNameWordStart = true;
    totalEdits += best.edits;
  }

  if (!allExact) {
    return Math.max(1, 100 - totalEdits);
  }

  const firstNameField = normFields.find((f) => f.kind === "name");
  const fullQuery = cleanWords.join(" ");
  if (firstNameField && firstNameField.norm.startsWith(fullQuery)) {
    return 400;
  }

  if (allNameWordStart) return 300;
  if (anyNameWordStart) return 250;
  return 200;
}
