import type { Load, XirrBundle } from "../../../features/mutual-funds/types";
import { formatXirr } from "../../../features/mutual-funds/mfCopy";
import { toPercentString } from "../../../lib/decimal";
import { formatPercent } from "../../../lib/format";

export function ReturnsXirrPrint({ load }: { load: Load<XirrBundle> }) {
  if (load.status === "error") return <p role="alert">Couldn't load XIRR</p>;
  if (!load.data) return null;
  return <div className="flex flex-col gap-4">
    {(["lifetime", "current"] as const).map(basis => {
      const value = load.data![basis];
      const disclaimer = load.data!.disclaimers[basis];
      return <div key={basis} className="break-inside-avoid">
        <p className="text-sm font-medium text-[var(--ui-text-muted)]">{basis === "lifetime" ? "Lifetime" : "Current holdings"}</p>
        {value !== null ? <p><span data-testid={basis === "lifetime" ? "xirr-value" : "current-xirr-value"} className={basis === "lifetime" ? "text-3xl font-bold" : "text-base font-semibold"}>{formatPercent(toPercentString(value), { digits: 1, signed: true })}</span> p.a.</p> : <>
          <p className="font-semibold">Insufficient Transaction History for XIRR</p>
          <p className="text-sm text-[var(--ui-text-muted)]">XIRR needs transaction dates spread over a multi-month window. Yours all fall on the same day — absolute return is shown instead.</p>
        </>}
        {disclaimer && <div data-testid="disclaimer-panel" className="mt-2 flex flex-col gap-2 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-xs text-[var(--ui-text-muted)]">
          <p>{formatPercent(toPercentString(disclaimer.opening_cost_share), { digits: 0 })} of this return is based on an undated opening balance — may be inflated.</p>
          <p>Your CAS statement's earliest entry already showed a holding with no transaction date — Unifolio treats it as invested on the day the statement starts, which compresses its real holding period and can inflate the annualised return.</p>
          {disclaimer.alt_xirr != null ? <p>Without the undated portion, the {basis === "lifetime" ? "lifetime" : "current-holdings"} XIRR would be {formatXirr(disclaimer.alt_xirr)}.</p> : <p>There is not enough dated activity left to compute one.</p>}
          {basis === "lifetime" && <p>Current holdings XIRR is computed only from funds you still hold.</p>}
        </div>}
      </div>;
    })}
  </div>;
}
