// XIRR always leads (owner, 24 Nov 2026). The old helper that swapped to the since-purchase figure under a year is gone.
export type XirrCaution = "young" | "single_transaction";

export const XIRR_CAPTION = "Annualised since your first investment";
export const RETURNS_CAPTION = "Since purchase, not annualised";
export const CAUTION_CHIP: Record<XirrCaution, { text: string; tip: string }> = {
  young: { text: "held under 1 yr", tip: "Held under 1 year: an annualised rate can look very large over a short period. Open Returns to see the plain gain." },
  single_transaction: { text: "one transaction", tip: "One purchase only, so this is the yearly rate of a single investment." },
};

export interface Figures {
  xirr: string | null;
  returns: string | null;
  caution: XirrCaution | null;
}

export function resolveFigures(
  xirr: string | null | undefined,
  sincePurchase: string | null | undefined,
  caution: XirrCaution | null | undefined,
): Figures {
  return { xirr: xirr ?? null, returns: sincePurchase ?? null, caution: caution ?? null };
}
