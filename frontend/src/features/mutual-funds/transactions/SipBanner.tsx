import { formatRupees } from "../../../lib/format";
import type { InvestmentWithdrawalResult } from "../types";

export interface SipBannerProps {
  summary: InvestmentWithdrawalResult["sip_summary"];
}

const MISSED_TOOLTIP =
  "A scheduled SIP instalment did not appear on the latest statement.";

export function SipBanner({ summary }: SipBannerProps) {
  if (summary.active_count === 0) {
    return (
      <div
        data-testid="sip-banner"
        className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-xs text-[var(--ui-text-muted)]"
      >
        <span>No active SIPs</span>
      </div>
    );
  }

  return (
    <div
      data-testid="sip-banner"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-xs"
    >
      <span
        data-testid="sip-count"
        className="font-semibold text-[var(--ui-text)]"
      >
        {summary.active_count} active {summary.active_count === 1 ? "SIP" : "SIPs"}
      </span>

      <span
        data-testid="sip-monthly"
        className="font-medium text-[var(--ui-text-muted)]"
      >
        {formatRupees(summary.total_monthly_amount)}/month
      </span>

      {summary.missed_count > 0 && (
        <span
          role="note"
          tabIndex={0}
          data-testid="sip-missed"
          title={MISSED_TOOLTIP}
          data-tooltip={MISSED_TOOLTIP}
          className="rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn-text)] cursor-help"
        >
          {summary.missed_count} missed{" "}
          {summary.missed_count === 1 ? "instalment" : "instalments"}
        </span>
      )}
    </div>
  );
}
