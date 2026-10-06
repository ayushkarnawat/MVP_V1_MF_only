import { Fragment, useEffect, useState } from "react";
import { fetchImportHealth, type FolioHealth, type ImportHealthResponse } from "./api";
import { formatIndianCurrency } from "../../lib/decimal";

const units = (value: string | null) => value === null ? "—" : new Intl.NumberFormat("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(value));
function status(row: FolioHealth): string {
  if (row.status === "match") return "✓ Match";
  if (row.status === "cache_stale") return "! Cache stale";
  if (row.status === "no_cas_data") return "No CAS data";
  return `✗ ${Number(row.diff_units) >= 0 ? "+" : ""}${units(row.diff_units)} units`;
}
const navCheck = (row: FolioHealth) => row.cas_nav !== null && row.our_nav !== null
  ? Number(row.cas_nav) === Number(row.our_nav) ? "✓ Match" : "✗ Differs" : "—";

export function ImportHealth({ memberId, onBack }: { memberId?: string; onBack: () => void }) {
  const [body, setBody] = useState<ImportHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [member, setMember] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setError(null);
    fetchImportHealth(memberId).then((data) => { if (active) setBody(data); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Check failed"); });
    return () => { active = false; };
  }, [memberId, version]);
  const all = body?.folios.filter((row) => member === "all" || row.household_member_id === member) ?? [];
  const rows = all.filter((row) => !problemsOnly || row.status !== "match");
  const members = Array.from(new Map(body?.folios.map((row) => [row.household_member_id, row.household_member_name])).entries());
  const navRows = all.filter((row) => row.cas_nav !== null && row.our_nav !== null);
  const history = (row: FolioHealth) => {
    const item = body?.history.find((h) => h.household_member_id === row.household_member_id);
    return item?.latest_month ? `${item.latest_month} · ${item.cached_value === null ? "—" : formatIndianCurrency(item.cached_value)}` : "No cached history";
  };
  const explanation = (row: FolioHealth) => `Why: ${units(String(Math.abs(Number(row.diff_units))))} units ${Number(row.diff_units) < 0 ? "short" : "extra"}.`;
  return <section className="space-y-6 p-6">
    <button type="button" onClick={onBack}>← Back</button>
    <div className="flex flex-wrap justify-between gap-3">
      <div><h1 className="font-display text-2xl font-bold">Import health</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">{memberId ? members[0]?.[1] ?? "Member" : member === "all" ? "Household" : members.find(([id]) => id === member)?.[1]} · last import {body?.last_import_at ? new Date(body.last_import_at).toLocaleString("en-IN") : "—"} · checks our numbers against the CAS</p></div>
      <button type="button" onClick={() => setVersion((v) => v + 1)}>Re-run check</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!body && !error && <p>Checking import…</p>}
    {body && <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {([ ["match", "folios match the CAS", "text-[var(--color-positive)]"], ["units_differ", "units differ", "text-[var(--color-negative)]"], ["cache_stale", "cache stale", "text-[var(--color-warning)]"] ] as const).map(([value, label, color]) =>
          <div key={value} className="rounded-xl border border-[var(--color-border)] p-4"><strong className={color}>{all.filter((row) => row.status === value).length}</strong> <span>{label}</span></div>)}
        <div className="rounded-xl border border-[var(--color-border)] p-4">{navRows.filter((row) => Number(row.cas_nav) === Number(row.our_nav)).length} / {navRows.length} NAV check passed</div>
      </div>
      <div className="flex flex-wrap gap-4">
        <button type="button" aria-pressed={!problemsOnly} onClick={() => setProblemsOnly(false)}>All {all.length}</button>
        <button type="button" aria-pressed={problemsOnly} onClick={() => setProblemsOnly(true)}>Problems only {all.filter((row) => row.status !== "match").length}</button>
        {members.length > 1 && <select aria-label="Member" value={member} onChange={(e) => setMember(e.target.value)}><option value="all">All members</option>{members.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}
      </div>
      {!body.folios.length && <p>No imports to check yet.</p>}
      <div className="overflow-auto"><table className="block w-full text-sm tabular-nums sm:table"><thead className="hidden sm:table-header-group"><tr>{["Fund · folio", "CAS closing units", "Our units (fresh)", "Our units (cached)", "NAV check", "History cache", "Status"].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody className="block space-y-3 sm:table-row-group">
        {rows.map((row) => <Fragment key={row.folio_id}><tr className="flex flex-col rounded-xl border border-[var(--color-border)] p-4 sm:table-row sm:border-x-0 sm:border-b-0 sm:p-0">
          <td className="block p-3 sm:table-cell">{row.scheme_name}<small className="block">{row.folio_number} · {row.household_member_name}</small></td>
          <td className="block sm:table-cell"><span className="mr-2 sm:hidden">CAS closing units</span>{units(row.cas_close_units)}</td><td className="block sm:table-cell"><span className="mr-2 sm:hidden">Our units (fresh)</span>{units(row.fresh_units)}</td><td className="block sm:table-cell"><span className="mr-2 sm:hidden">Our units (cached)</span>{units(row.cached_units)}</td><td className="block sm:table-cell"><span className="mr-2 sm:hidden">NAV check</span>{navCheck(row)}</td><td className="block sm:table-cell"><span className="mr-2 sm:hidden">History cache</span>{history(row)}</td>
          <td className="order-first block pb-2 sm:order-none sm:table-cell"><span className="mr-2 sm:hidden">Status</span>{row.status === "units_differ" ? <button type="button" aria-expanded={expanded === row.folio_id} onClick={() => setExpanded(expanded === row.folio_id ? null : row.folio_id)}>{status(row)}</button> : status(row)}</td>
        </tr>{expanded === row.folio_id && <tr><td colSpan={7} className="block p-3 sm:table-cell">{explanation(row)}</td></tr>}</Fragment>)}
      </tbody></table></div>
      {body.warnings.length > 0 && <aside className="rounded-xl border border-[var(--color-warning)] p-4"><p>casparser warnings for this import ({body.warnings.length}):</p><ul>{body.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></aside>}
    </>}
  </section>;
}
