import type { NewsItemOut, NewsResponse } from "./types";

export const NEWS_GENERAL_NOTE =
  "Nothing specific to your holdings right now. Showing general market news.";

export const NEWS_WHY_TEXT =
  "A headline appears only when it matches something you hold. We look at your stocks first, then fund categories, fund houses, asset classes, sectors and rates. If nothing specific matches, general market news is shown. The card never changes on a timer.";

export const NEWS_HOW_WE_PICK: readonly string[] = [
  "Stocks you hold (your 5 largest)",
  "Fund categories you hold",
  "Fund houses you hold",
  "Asset classes, such as gold or debt",
  "Sectors",
  "Interest rates and the economy",
  "General market news, only when nothing above matches",
] as const;

export const NEWS_HOW_NOTE =
  "The card changes only when a matching headline arrives or your holdings change, never on a timer. A specific headline stays for one day, a general one for three.";

export function newsAge(publishedAt: string, nowIso: string): string {
  const seconds = Math.floor((Date.parse(nowIso) - Date.parse(publishedAt)) / 1000);
  if (!(seconds >= 60)) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  return `${Math.floor(hours / 24)} d ago`;
}

export function staleLabel(feedAsOf: string, nowIso: string): string {
  return `Updated ${newsAge(feedAsOf, nowIso)}`;
}

export function newsKindLabel(item: Pick<NewsItemOut, "kind" | "icon_key">): string {
  switch (item.kind) {
    case "stock":
      return "Company news";
    case "fund_category":
      return "Fund category";
    case "fund_house":
      return "Fund house";
    case "asset_class":
      return "Gold and silver";
    case "sector":
      return "Sector news";
    case "rates_macro":
      return "Rates and macro";
    case "general":
      if (item.icon_key === "regulation") return "Regulation";
      if (item.icon_key === "markets") return "Markets";
      if (item.icon_key === "rates_rbi") return "Rates and macro";
      return "Market news";
    default:
      return "Market news";
  }
}

export function newsMetaLine(item: NewsItemOut, nowIso: string): string {
  return `${newsKindLabel(item)} · ${item.source} · ${newsAge(item.published_at, nowIso)}`;
}

export function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function hasNewsToShow(data: NewsResponse | null): boolean {
  return (
    data !== null &&
    data.enabled &&
    data.state === "items" &&
    !data.hidden &&
    data.items.length > 0
  );
}

export function isGeneralOnly(items: readonly NewsItemOut[]): boolean {
  return items.length > 0 && items.every(item => !item.specific);
}
