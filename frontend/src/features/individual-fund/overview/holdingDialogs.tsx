import { Modal } from "@/components/Modal";
import { formatPercent } from "@/lib/format";
import { SLICE_SHARE_LABEL, type AllocationTab } from "../fundCopy";
import type { TopHolding } from "../types";

export interface StockDialogProps {
  holding: TopHolding | null;
  onClose: () => void;
}

export function StockDialog({ holding, onClose }: StockDialogProps) {
  if (!holding) return null;

  return (
    <Modal isOpen onClose={onClose} title={holding.name}>
      <dl className="divide-y divide-[var(--ui-divider)]">
        <div className="flex justify-between gap-3 py-2 text-sm">
          <dt className="text-[var(--ui-text-muted)]">Weight in this fund</dt>
          <dd className="font-semibold text-[var(--ui-text)]">
            {formatPercent(holding.weight, { digits: 2 })}
          </dd>
        </div>
        <div className="flex justify-between gap-3 py-2 text-sm">
          <dt className="text-[var(--ui-text-muted)]">Sector</dt>
          <dd className="font-semibold text-[var(--ui-text)]">
            {holding.sector || "—"}
          </dd>
        </div>
        {holding.isin ? (
          <div className="flex justify-between gap-3 py-2 text-sm">
            <dt className="text-[var(--ui-text-muted)]">ISIN</dt>
            <dd className="font-semibold text-[var(--ui-text)]">
              {holding.isin}
            </dd>
          </div>
        ) : null}
      </dl>
    </Modal>
  );
}

export interface SelectedSlice {
  tab: AllocationTab;
  label: string;
  pct: string;
}

export interface SliceDialogProps {
  slice: SelectedSlice | null;
  top10: TopHolding[];
  onClose: () => void;
}

export function SliceDialog({ slice, top10, onClose }: SliceDialogProps) {
  if (!slice) return null;

  const sectorHoldings =
    slice.tab === "sector"
      ? top10.filter((item) => item.sector === slice.label)
      : [];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${slice.label} (${formatPercent(slice.pct, { digits: 1 })})`}
    >
      <dl className="divide-y divide-[var(--ui-divider)]">
        <div className="flex justify-between gap-3 py-2 text-sm">
          <dt className="text-[var(--ui-text-muted)]">
            {SLICE_SHARE_LABEL[slice.tab]}
          </dt>
          <dd className="font-semibold text-[var(--ui-text)]">
            {formatPercent(slice.pct, { digits: 1 })}
          </dd>
        </div>
      </dl>
      {slice.tab === "sector" ? (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">
            Top 10 holdings in this sector
          </h4>
          {sectorHoldings.length > 0 ? (
            <ul className="divide-y divide-[var(--ui-divider)]">
              {sectorHoldings.map((holding) => (
                <li
                  key={holding.name}
                  className="flex justify-between gap-3 py-2 text-sm"
                >
                  <span className="text-[var(--ui-text)]">{holding.name}</span>
                  <b className="font-semibold text-[var(--ui-text)]">
                    {formatPercent(holding.weight, { digits: 1 })}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="slice-none" className="text-sm text-[var(--ui-text-muted)]">
              None of the top 10 holdings is in this sector.
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
