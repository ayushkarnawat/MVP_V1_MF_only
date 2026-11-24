import { useMfAnalytics } from "../../../features/mutual-funds/data/analyticsStore";
import { comparisonFundsForWindow, fundDifference, fundWindow, INDEX_DEFS, indexLabel, signedXirr, WINDOW_DEFS, windowUnavailableText, windowView } from "../../../features/mutual-funds/performance/benchmarkLogic";
import { formatSignedPercent } from "../../../features/mutual-funds/mfCopy";
import { benchmarkDisplayName, benchmarkKeyName } from "../../../lib/benchmarkDisplay";

export function BenchmarkComparisonPrint({ bench, funds }: {
  bench: ReturnType<typeof useMfAnalytics<"benchmark">>;
  funds: ReturnType<typeof useMfAnalytics<"benchmark_funds">>;
}) {
  const rows = funds.data?.declared_comparison != null
    ? comparisonFundsForWindow(funds.data, "SI")
    : (funds.data?.funds ?? []).map(fund => ({ fund, view: fundWindow(fund, "SI"), declared: undefined }));
  const notes = [...new Set(rows.map(row => row.declared?.note).filter((note): note is string => Boolean(note?.trim())))];
  return <section className="flex flex-col gap-4 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 text-[var(--ui-text)]">
    <h3 className="text-base font-semibold">Benchmark Comparison (XIRR)</h3>
    {bench.status !== "ready" ? <p role="alert">Couldn't load the benchmark comparison.</p> : <table aria-label="Portfolio vs Broad Market" className="w-full table-fixed text-[10px]">
      <caption className="text-left text-xs text-[var(--ui-text-muted)]">XIRR · Portfolio versus index difference</caption>
      <thead><tr><th scope="col">XIRR</th><th scope="col">Your Portfolio</th>{INDEX_DEFS.map(index => <th scope="col" key={index.key} className="break-words">{index.label}</th>)}</tr></thead>
      <tbody>{WINDOW_DEFS.map(window => {
        const view = windowView(bench.data, window.id);
        return <tr key={window.id} data-testid={`benchmark-window-${window.id}`} className="border-t border-[var(--ui-divider)] align-top">
          <th scope="row" className="py-2 text-left">{window.label}</th>
          {!view.available ? <td colSpan={9} className="py-2">{windowUnavailableText(view.reason)}</td> : <>
            <td className="py-2">{signedXirr(view.portfolio)}</td>
            {INDEX_DEFS.map(index => <td key={index.key} className="py-2">
              <span className="block">{signedXirr(view.indices[index.key])}</span>
              <span className="block text-[var(--ui-text-muted)]">{formatSignedPercent(fundDifference({ fund: view.portfolio, benchmark: view.indices[index.key] ?? null }), 1)}</span>
            </td>)}
          </>}
        </tr>;
      })}</tbody>
    </table>}
    <h4 className="text-sm font-semibold">Funds against their benchmarks · Since Inception</h4>
    {funds.status !== "ready" ? <p role="alert">Couldn't load the fund comparison.</p> : rows.length === 0 ? <p>No per-fund benchmark comparison available</p> : <table aria-label="Funds against their benchmarks" className="w-full table-fixed text-xs">
      <thead><tr>{["Fund", "Fund XIRR", "Benchmark", "Benchmark XIRR", "Difference"].map(label => <th key={label} scope="col" className="py-2 text-left">{label}</th>)}</tr></thead>
      <tbody>{rows.map(({ fund, view, declared }) => <tr key={fund.scheme_id} data-testid={`benchmark-fund-${fund.scheme_id}`} className="border-t border-[var(--ui-divider)] align-top">
        <td className="py-2 break-words">{fund.scheme_name}{declared?.windows.find(window => window.window === "SI")?.reason && <p>{declared.windows.find(window => window.window === "SI")!.reason}</p>}</td>
        <td className="py-2">{signedXirr(view.fund)}</td>
        <td className="py-2 break-words">{declared ? declared.source === "none" ? "No benchmark" : <>
          {declared.index_key ? benchmarkKeyName(declared.index_key) : "No benchmark"}
          {declared.declared_name && <span className="block">Factsheet names: {benchmarkDisplayName(declared.declared_name)}</span>}
        </> : `${indexLabel(fund.benchmark_index)} (Total Return)`}</td>
        <td className="py-2">{signedXirr(view.benchmark)}</td><td className="py-2">{formatSignedPercent(fundDifference(view), 1)}</td>
      </tr>)}</tbody>
    </table>}
    {notes.map(note => <p key={note} className="text-xs text-[var(--ui-text-muted)]">{note}</p>)}
  </section>;
}
