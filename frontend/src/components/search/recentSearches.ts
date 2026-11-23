const RECENTS_PREFIX = "unifolio.search.recents.";
const FUNDS_PREFIX = `${RECENTS_PREFIX}funds.`;
const MAX_RECENTS = 5;

function searchKey(userId: string): string {
  return `${RECENTS_PREFIX}${userId}`;
}

function fundsKey(userId: string): string {
  return `${FUNDS_PREFIX}${userId}`;
}

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function writeList(key: string, items: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, MAX_RECENTS)));
  } catch {
    // Storage may be blocked or full; never throw.
  }
}

export function readRecentSearches(userId: string | null): string[] {
  if (!userId) return [];
  return readList(searchKey(userId));
}

export function pushRecentSearch(userId: string | null, text: string): void {
  if (!userId) return;
  const trimmed = text.trim();
  if (trimmed.length < 2) return;

  const normalized = trimmed.toLowerCase();
  const existing = readList(searchKey(userId)).filter(
    (item) => item.toLowerCase() !== normalized,
  );
  writeList(searchKey(userId), [trimmed, ...existing].slice(0, MAX_RECENTS));
}

export function readRecentFunds(userId: string | null): string[] {
  if (!userId) return [];
  return readList(fundsKey(userId));
}

export function pushRecentFund(userId: string | null, schemeId: string): void {
  if (!userId) return;
  const trimmed = schemeId.trim();
  if (!trimmed) return;

  const existing = readList(fundsKey(userId)).filter((item) => item !== trimmed);
  writeList(fundsKey(userId), [trimmed, ...existing].slice(0, MAX_RECENTS));
}

export function clearRecents(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(RECENTS_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage may be blocked; never throw.
  }
}
