import { Modal } from "@/components/Modal";
import { formatDate, formatPercent, formatRupees } from "@/lib/format";
import { formatNav, formatSignedPercent, formatSignedRupees, formatXirr } from "../fundFormat";
import { TILE_TITLES, type TileId } from "../fundCopy";
import type { SummaryResponse } from "../types";

export interface TileDialogProps {
  tile: TileId | null;
  summary: SummaryResponse;
  onClose: () => void;
}

export function TileDialog({ tile, summary, onClose }: TileDialogProps) {
  if (!tile) return null;

  const { tiles, details } = summary;

  const renderContent = () => {
    switch (tile) {
      case "value":
        return (
          <dl className="divide-y divide-[var(--ui-divider)]">
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Current value</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatRupees(tiles.current_value)}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Units</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {details.units ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Current NAV</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatNav(details.current_nav)}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">NAV as of</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatDate(summary.nav_as_of)}
              </dd>
            </div>
            {details.folios.map((folio) => (
              <div
                key={folio.folio_id}
                className="flex justify-between py-2 text-sm"
              >
                <dt className="text-[var(--ui-text-muted)]">
                  {folio.member_name}
                </dt>
                <dd className="font-semibold text-[var(--ui-text)]">
                  {folio.folio_masked}
                </dd>
              </div>
            ))}
          </dl>
        );

      case "invested":
        return (
          <dl className="divide-y divide-[var(--ui-divider)]">
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Invested amount</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatRupees(tiles.invested)}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Average NAV</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatNav(details.average_nav)}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">First investment</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatDate(details.first_investment)}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Last investment</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatDate(details.last_investment)}
              </dd>
            </div>
          </dl>
        );

      case "gain":
        return (
          <dl className="divide-y divide-[var(--ui-divider)]">
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Total gain</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatSignedRupees(tiles.total_gain)}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Return</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatSignedPercent(tiles.total_gain_pct, 1)}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Invested</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatRupees(tiles.invested)}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Current value</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatRupees(tiles.current_value)}
              </dd>
            </div>
          </dl>
        );

      case "xirr":
        return (
          <div className="space-y-4">
            <dl className="divide-y divide-[var(--ui-divider)]">
              <div className="flex justify-between py-2 text-sm">
                <dt className="text-[var(--ui-text-muted)]">Your XIRR</dt>
                <dd className="font-semibold text-[var(--ui-text)]">
                  {formatXirr(tiles.xirr)}
                </dd>
              </div>
              <div className="flex justify-between py-2 text-sm">
                <dt className="text-[var(--ui-text-muted)]">Period</dt>
                <dd className="font-semibold text-[var(--ui-text)]">
                  {details.first_investment
                    ? `${formatDate(details.first_investment)} to ${formatDate(summary.nav_as_of)}`
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-[var(--ui-text-muted)]">
              XIRR weighs when your money went in, so it differs from the fund's own return table.
            </p>
          </div>
        );

      case "ter":
        return (
          <dl className="divide-y divide-[var(--ui-divider)]">
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">This plan</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {tiles.expense_ratio?.value
                  ? formatPercent(tiles.expense_ratio.value, { digits: 2 })
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">Plan</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {tiles.expense_ratio?.plan ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <dt className="text-[var(--ui-text-muted)]">As of</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {tiles.expense_ratio?.reference_period
                  ? formatDate(tiles.expense_ratio.reference_period)
                  : "—"}
              </dd>
            </div>
          </dl>
        );
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={TILE_TITLES[tile]}>
      {renderContent()}
    </Modal>
  );
}
