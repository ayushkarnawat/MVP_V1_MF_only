import type { DataDateKind } from "../../../lib/dataDates";
import type { MfTabId } from "../types";

export interface StripDates {
  pricesIso?: string | null;
  holdingsIso?: string | null;
  ratiosIso?: string | null;
  feesIso?: string | null;
  marketCapListIso?: string | null;
}

export interface StripEntry {
  kind: DataDateKind;
  iso: string;
  explain: string;
}

export interface OlderMarker {
  label: string;
  items: string[];
}

const EXPLAIN: Record<"prices" | "holdings" | "ratios" | "fees" | "marketCapList", string> = {
  prices: "Prices: the latest day on which most of your funds have a price. Changes every trading day.",
  holdings: "Holdings: what each fund held at its last monthly disclosure. Changes once a month.",
  ratios: "Ratios: stock P/E and P/B from NSE and BSE daily data. Changes every trading day.",
  fees: "Fees: each fund's expense ratio (TER) for its latest reference month. Changes about once a month.",
  marketCapList: "Market-cap list: the AMFI list that sorts stocks into large, mid and small. Changes twice a year.",
};

type StripDateKey = keyof StripDates;
type StripKind = keyof typeof EXPLAIN;

const TAB_KINDS: Partial<Record<MfTabId, ReadonlyArray<{ kind: StripKind; key: StripDateKey }>>> = {
  allocation: [
    { kind: "prices", key: "pricesIso" },
    { kind: "holdings", key: "holdingsIso" },
    { kind: "marketCapList", key: "marketCapListIso" },
  ],
  analytics: [
    { kind: "prices", key: "pricesIso" },
    { kind: "holdings", key: "holdingsIso" },
    { kind: "ratios", key: "ratiosIso" },
    { kind: "fees", key: "feesIso" },
  ],
};

export function stripEntriesForTab(tab: MfTabId, dates: StripDates): StripEntry[] {
  const specs = TAB_KINDS[tab];
  if (!specs) return [];

  const entries: StripEntry[] = [];
  for (const { kind, key } of specs) {
    const iso = dates[key];
    if (iso) {
      entries.push({ kind, iso, explain: EXPLAIN[kind] });
    }
  }
  return entries;
}

export function olderHoldingsMarker(
  funds: Array<{ scheme_name: string; age_tag: "older_than_60_days" | "on_cycle" | null }>,
): OlderMarker | null {
  const items = funds
    .filter((fund) => fund.age_tag === "older_than_60_days")
    .map((fund) => fund.scheme_name);

  if (items.length === 0) return null;

  const label = items.length === 1
    ? "1 fund has older holdings"
    : `${items.length} funds have older holdings`;

  return { label, items };
}
