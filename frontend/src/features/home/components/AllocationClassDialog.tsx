import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { formatLegendPercent } from "../allocationCopy";
import { formatRupees } from "../homeFormat";
import type { ClassFundOut, ClassRowOut } from "../types";

export interface AllocationClassDialogProps {
  open: boolean;
  onClose: () => void;
  row: ClassRowOut;
  hideValues?: boolean;
  /** The element to focus on close. Radix only restores focus to a Dialog.Trigger, and this dialog has none. */
  returnFocusRef?: { current: HTMLElement | null };
}

const MASK = "••••••";

// Whole paise from a decimal string, by text, so nothing goes through a float (a Home rule).
const paise = (value: string | null) => {
  const [whole, fraction = ""] = (value ?? "0").trim().split(".");
  return Number(`${whole}${fraction.padEnd(2, "0").slice(0, 2)}`);
};
const fromPaise = (amount: number) => `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;

// Partial coverage (backend, S2): funds[] holds only the funds the analytics section disclosed, and each share is of the
// whole class, so the shares add up to less than 100. What is left is not a fund and is never drawn as a table row.
function remainderOf(row: ClassRowOut, funds: ClassFundOut[]) {
  if (funds.length === 0 || row.value === null) return null;
  const valuePaise = paise(row.value) - funds.reduce((sum, fund) => sum + paise(fund.value), 0);
  if (valuePaise <= 0) return null;
  const sharePaise = 10000 - funds.reduce((sum, fund) => sum + paise(fund.share_of_class), 0);
  return { value: fromPaise(valuePaise), share: fromPaise(Math.max(sharePaise, 0)) };
}

export function AllocationClassDialog({ open, onClose, row, hideValues = false, returnFocusRef }: AllocationClassDialogProps) {
  const money = (value: string | null) => (hideValues ? MASK : formatRupees(value));
  const funds = row.funds ?? [];
  const remainder = remainderOf(row, funds);
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
        {remainder ? (
          <p data-testid="class-remainder" className="text-xs text-[var(--ui-text-muted)]">
            Not attributed to a fund: {money(remainder.value)} ({formatLegendPercent(remainder.share)} of this class)
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
