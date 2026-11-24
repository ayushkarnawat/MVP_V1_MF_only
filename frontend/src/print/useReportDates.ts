import { analyticsStore } from "../features/mutual-funds/data/analyticsStore";
import { useMfHoldings } from "../features/mutual-funds/data/useMfDashboard";
import { formatDataDate } from "../lib/dataDates";
import { useScope } from "../shell/scope/ScopeContext";
import { usePrintSettled } from "./usePrintSettled";

function payloadRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function useReportDates() {
  const { viewMode, memberId } = useScope();
  const holdings = useMfHoldings();
  usePrintSettled("report-meta", holdings.holdings.status !== "loading");
  // The assembly rerenders when sections settle. Read their shared snapshot without subscribing or starting a request.
  const snapshot = analyticsStore.getSnapshot(viewMode === "aggregate" ? "combined" : memberId ?? "");
  const assetPayload = payloadRecord(snapshot.sections.asset_allocation?.payload);
  const capPayload = payloadRecord(snapshot.sections.cap_allocation?.payload);
  const asset = viewMode === "aggregate" && Object.hasOwn(assetPayload, "asset_allocation") ? payloadRecord(assetPayload.asset_allocation) : assetPayload;
  const cap = viewMode === "aggregate" && Object.hasOwn(capPayload, "cap_allocation") ? payloadRecord(capPayload.cap_allocation) : capPayload;
  const rows = holdings.holdings.data ?? [];
  const priceDates = [...rows.map(row => row.current_nav_date), asset.nav_as_of]
    .filter((iso): iso is string => typeof iso === "string" && Boolean(formatDataDate("prices", iso))).sort();
  const pricesIso = priceDates[priceDates.length - 1] ?? null;
  const holdingsIso = typeof asset.holdings_as_of === "string" && formatDataDate("holdings", asset.holdings_as_of) ? asset.holdings_as_of : null;
  const marketCapIso = typeof cap.classification_as_of === "string" && formatDataDate("marketCapList", cap.classification_as_of) ? cap.classification_as_of : null;
  const consolidated = viewMode === "aggregate" ? holdings.consolidated.data : null;
  const funds = consolidated ?? rows;
  const folioRows = consolidated ? consolidated.flatMap(fund => fund.children) : rows;
  return {
    pricesIso, holdingsIso, marketCapIso,
    fundCount: new Set(funds.map(row => row.scheme_id)).size,
    folioCount: new Set(folioRows.flatMap(row => (row.folios ?? []).map(folio => folio.folio_id))).size,
  };
}
