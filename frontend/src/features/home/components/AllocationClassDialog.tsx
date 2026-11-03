import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { formatLegendPercent } from "../allocationCopy";
import { formatRupees } from "../homeFormat";
import type { ClassRowOut } from "../types";

export interface AllocationClassDialogProps {
  open: boolean;
  onClose: () => void;
  row: ClassRowOut;
  hideValues?: boolean;
  /** The element to focus on close. Radix only restores focus to a Dialog.Trigger, and this dialog has none. */
  returnFocusRef?: { current: HTMLElement | null };
}

const MASK = "••••••";

export function AllocationClassDialog({ open, onClose, row, hideValues = false, returnFocusRef }: AllocationClassDialogProps) {
  const money = (value: string | null) => (hideValues ? MASK : formatRupees(value));
  const funds = row.funds ?? [];
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent onCloseAutoFocus={(event) => { if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus(); } }}>
        <DialogHeader>
          <DialogTitle>{row.label}</DialogTitle>
          <DialogDescription>
            {money(row.value)} · {formatLegendPercent(row.percentage)} of your portfolio
          </DialogDescription>
        </DialogHeader>
        {funds.length === 0 ? (
          <p className="text-sm text-[var(--ui-text-muted)]">Fund details are not available for this class yet.</p>
        ) : (
          <table aria-label={`Funds in ${row.label}`} className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-divider)] text-xs text-[var(--ui-text-muted)]">
                <th scope="col" className="py-2 pr-3 font-medium">Fund</th>
                <th scope="col" className="py-2 px-3 font-medium">Value</th>
                <th scope="col" className="py-2 pl-3 font-medium">Share of class</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((fund) => (
                <tr key={fund.scheme_id} className="border-b border-[var(--ui-divider)]">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2 text-[var(--ui-text)]">
                      <SchemeLogo schemeName={fund.name} size="sm" />
                      <span>{fund.name}</span>
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[var(--ui-text)]">{money(fund.value)}</td>
                  <td className="py-2 pl-3 text-[var(--ui-text-muted)]">{formatLegendPercent(fund.share_of_class)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
