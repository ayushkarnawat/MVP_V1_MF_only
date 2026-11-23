import { useMfAnalytics } from "../data/analyticsStore";
import type { MfTabId } from "../types";
import { DateStrip } from "./DateStrip";
import { olderHoldingsMarker, stripEntriesForTab } from "./stripEntries";

function AllocationDateStrip() {
  const { data: asset } = useMfAnalytics("asset_allocation");
  const { data: cap } = useMfAnalytics("cap_allocation");

  const entries = stripEntriesForTab("allocation", {
    pricesIso: asset?.nav_as_of ?? null,
    holdingsIso: asset?.holdings_as_of ?? null,
    marketCapListIso: cap?.classification_as_of ?? null,
  });
  const marker = asset?.coverage?.funds ? olderHoldingsMarker(asset.coverage.funds) : null;

  return <DateStrip entries={entries} olderMarkers={marker ? [marker] : []} />;
}

function AnalyticsDateStrip() {
  const { data: valuation } = useMfAnalytics("valuation");
  const { data: ter } = useMfAnalytics("ter");

  const entries = stripEntriesForTab("analytics", {
    pricesIso: valuation?.nav_as_of ?? null,
    holdingsIso: valuation?.holdings_as_of ?? null,
    ratiosIso: valuation?.pe?.as_of_date ?? valuation?.pb?.as_of_date ?? null,
    feesIso: ter?.reference_period ?? null,
  });
  const marker = valuation?.coverage?.funds ? olderHoldingsMarker(valuation.coverage.funds) : null;

  return <DateStrip entries={entries} olderMarkers={marker ? [marker] : []} />;
}

export function TabDateStrip({ tab }: { tab: MfTabId }) {
  if (tab === "allocation") return <AllocationDateStrip />;
  if (tab === "analytics") return <AnalyticsDateStrip />;
  return null;
}
