import { useId, useState } from "react";
import { Portal as TooltipPortal } from "@radix-ui/react-tooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { formatPercent } from "../../../components/mf/lookthroughDisplay";
import { compareDecimalStrings } from "../../../lib/decimal";
import { formatDate } from "../../../lib/format";
import { SectionCard } from "../common/SectionCard";
import type { ValuationFund, ValuationSummary, ValuationValue } from "../types";
import { CARD_TITLES, ratioText, type ValuationKind } from "./otherLogic";

const LABEL = { pe: "P/E", pb: "P/B" };

function usable(value: string | null | undefined): value is string {
  return value != null && compareDecimalStrings(value, "0") > 0;
}

// All rows share one scale per ratio. Integer arithmetic preserves the
// decimal strings; only the final CSS percentage describes chart geometry.
function position(value: string, maximum: string): string {
  const scale = Math.max((value.split(".")[1] ?? "").length, (maximum.split(".")[1] ?? "").length);
  const units = (text: string) => {
    const [whole, fraction = ""] = text.split(".");
    return BigInt(whole + fraction.padEnd(scale, "0"));
  };
  const max = units(maximum);
  const percent = 500n + (units(value) * 9000n + max / 2n) / max;
  return `${percent / 100n}.${String(percent % 100n).padStart(2, "0")}`;
}

function Source({ value, kind, name }: { value: ValuationValue; kind: ValuationKind; name: string }) {
  const [open, setOpen] = useState(false);
  const label = value.source === "factsheet" ? (value.basis === "forward" ? "Factsheet fwd" : "Factsheet") : "NSE/BSE";
  const basis = value.basis === "forward" ? "forward earnings" : value.basis === "trailing"
    ? (kind === "pe" ? "trailing earnings" : "trailing book value") : "not stated";
  const method = value.method === "harmonic" ? "harmonic mean" : value.method === "weighted_average" ? "weighted average" : "not stated";
  const note = `Basis: ${basis}. Method: ${method}.`;
  return <TooltipProvider delayDuration={0}><Tooltip open={open} onOpenChange={setOpen}>
    <TooltipTrigger asChild><button type="button" aria-label={`${LABEL[kind]} source for ${name}`} aria-expanded={open}
      title={note} data-tooltip={note}
      data-clickable="" data-effect="expand" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={event => { event.preventDefault(); setOpen(true); }}
      className="min-h-8 rounded-full border border-[var(--ui-divider)] px-2 text-[10px] font-medium text-[var(--ui-text-muted)]">
      {label}
    </button></TooltipTrigger>
    <TooltipPortal><TooltipContent className="max-w-64">{note}</TooltipContent></TooltipPortal>
  </Tooltip></TooltipProvider>;
}

function RatioCell({ value, kind, fund, benchmark, maximum }: {
  value: ValuationValue; kind: ValuationKind; fund: ValuationFund; benchmark: string | null; maximum: string;
}) {
  if (!usable(value.value)) return <td className="p-3 align-top text-xs text-[var(--ui-text-muted)]">
    <p className="font-medium">Not enough data</p>
    {value.reason && <p className="mt-1 max-w-56">{value.reason}</p>}
  </td>;
  return <td className="p-3 align-top">
    <div className="flex flex-wrap items-center gap-1.5">
      <strong className="text-sm tabular-nums text-[var(--ui-text)]">{ratioText(value.value)}</strong>
      <Source value={value} kind={kind} name={fund.scheme_name} />
    </div>
    <div aria-label={`${LABEL[kind]} range for ${fund.scheme_name}`} className="relative mt-3 h-2 rounded-full bg-[var(--ui-divider)]">
      {usable(benchmark) && <span aria-label={`${LABEL[kind]} Nifty 500 tick for ${fund.scheme_name}`}
        title={`Nifty 500 ${ratioText(benchmark)}`} className="absolute -top-1 h-4 w-0.5 bg-[var(--c4)]"
        style={{ left: `${position(benchmark, maximum)}%` }} />}
      <span aria-hidden="true" className="absolute -top-0.5 h-3 w-3 -translate-x-1/2 rounded-full bg-[var(--pos)] ring-2 ring-[var(--ui-card)]"
        style={{ left: `${position(value.value, maximum)}%` }} />
    </div>
    {!usable(benchmark) && <p className="mt-2 text-[10px] text-[var(--ui-text-muted)]">Nifty 500 {LABEL[kind]} is unavailable.</p>}
  </td>;
}

interface ListedStock { name: string; reasons: string[] }
function stockList(data: ValuationSummary, field: "missing" | "overseas"): ListedStock[] {
  const stocks = new Map<string, ListedStock>();
  for (const kind of ["pe", "pb"] as const) {
    for (const stock of data[kind][field] ?? []) {
      const key = stock.isin ?? `${stock.instrument_name}|${stock.exposure_value}|${stock.percentage_equity}`;
      const item = stocks.get(key) ?? { name: stock.instrument_name, reasons: [] };
      const reason = `${LABEL[kind]} · ${formatPercent(stock.percentage_equity, 1)}% of equity — ${stock.reason}`;
      if (!item.reasons.includes(reason)) item.reasons.push(reason);
      stocks.set(key, item);
    }
  }
  return [...stocks.values()];
}

function StockList({ label, stocks }: { label: string; stocks: ListedStock[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="rounded-xl border border-[var(--ui-divider)] p-3">
    <button type="button" aria-expanded={open} aria-controls={id} data-clickable="" data-effect="expand"
      onClick={() => setOpen(!open)} className="w-full py-1 text-left text-xs font-semibold text-[var(--ui-text)]">
      {label} ({stocks.length})
    </button>
    {open && <ul id={id} aria-label={label} className="mt-3 space-y-3 text-xs text-[var(--ui-text-muted)]">
      {stocks.map((stock, index) => <li key={index}>
        <p className="font-medium text-[var(--ui-text)]">{stock.name}</p>
        {stock.reasons.map(reason => <p key={reason}>{reason}</p>)}
      </li>)}
      {stocks.length === 0 && <li>No stocks in this list.</li>}
    </ul>}
  </div>;
}

function AsOn({ fund }: { fund: ValuationFund }) {
  const pe = usable(fund.pe.value), pb = usable(fund.pb.value);
  if (pe && pb && fund.pe.as_of !== fund.pb.as_of) return <>
    <p>P/E {formatDate(fund.pe.as_of)}</p><p className="mt-1">P/B {formatDate(fund.pb.as_of)}</p>
  </>;
  return <span>{pe ? formatDate(fund.pe.as_of) : pb ? formatDate(fund.pb.as_of) : "—"}</span>;
}

export function ValuationByFund({ data }: { data: ValuationSummary }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const infoId = useId();
  if (data.funds === undefined) return null;
  const funds = data.funds;
  const index = data.indices.find(row => row.index_name === "nifty_500");
  const benchmarks = { pe: index?.pe_ratio ?? null, pb: index?.pb_ratio ?? null };
  const comparable = funds.filter(fund => usable(fund.pe.value));
  const richer = usable(benchmarks.pe) ? comparable.filter(fund => compareDecimalStrings(fund.pe.value!, benchmarks.pe!) > 0).length : null;
  const maximum = (kind: ValuationKind) => [benchmarks[kind], ...funds.map(fund => fund[kind].value)]
    .filter(usable).reduce((max, value) => compareDecimalStrings(value, max) > 0 ? value : max, "1");
  const maxima = { pe: maximum("pe"), pb: maximum("pb") };
  return <SectionCard title={CARD_TITLES.cost[2]} state="ready">
    <div className="space-y-4">
      <p className="rounded-xl bg-[var(--warn-bg)] p-4 text-sm font-medium text-[var(--ui-text)]">
        {richer === null ? "Nifty 500 earnings comparison is unavailable." : `${richer} of ${comparable.length} funds trade richer than Nifty 500 on earnings`}
      </p>
      <p className="text-xs text-[var(--ui-text-muted)]">Funds without a P/E are left out of this count. The tick is Nifty 500; the dot is the fund.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed text-left">
          <thead className="border-b border-[var(--ui-divider)] text-xs text-[var(--ui-text-muted)]">
            <tr><th scope="col" className="w-[30%] p-3">Fund</th><th scope="col" className="w-[25%] p-3">P/E</th><th scope="col" className="w-[25%] p-3">P/B</th><th scope="col" className="w-[20%] p-3">As on</th></tr>
          </thead>
          <tbody>{funds.map(fund => <tr key={fund.scheme_id} className="border-b border-[var(--ui-divider)]">
            <th scope="row" className="p-3 align-top text-xs font-semibold text-[var(--ui-text)]">
              <span className="flex items-center gap-2"><SchemeLogo schemeName={fund.scheme_name} size="sm" />{fund.scheme_name}</span>
            </th>
            <RatioCell fund={fund} value={fund.pe} kind="pe" benchmark={benchmarks.pe} maximum={maxima.pe} />
            <RatioCell fund={fund} value={fund.pb} kind="pb" benchmark={benchmarks.pb} maximum={maxima.pb} />
            <td className="p-3 align-top text-xs text-[var(--ui-text-muted)]"><AsOn fund={fund} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      {funds.length === 0 && <p className="text-xs text-[var(--ui-text-muted)]">No fund valuation figures are available yet.</p>}
      <p className="text-xs text-[var(--ui-text-muted)]">Factsheet: printed by the fund house; fwd means forward earnings. NSE/BSE: calculated from published holdings. Indicators, not a recommendation.</p>
      <button type="button" aria-label="How the portfolio average works" aria-expanded={infoOpen} aria-controls={infoId}
        data-clickable="" data-effect="expand" onClick={() => setInfoOpen(!infoOpen)}
        className="rounded-lg border border-[var(--ui-divider)] px-3 py-2 text-xs font-medium text-[var(--ui-text)]">i · How the portfolio average works</button>
      {infoOpen && <p id={infoId} className="text-xs text-[var(--ui-text-muted)]">Each fund counts in proportion to the amount you hold in shares, and we average the earnings or book value behind each rupee before turning that back into a price multiple. That way, a very high ratio does not dominate the result.</p>}
      <StockList label="Stocks without ratios" stocks={stockList(data, "missing")} />
      <StockList label="Overseas stocks without ratios" stocks={stockList(data, "overseas")} />
    </div>
  </SectionCard>;
}
