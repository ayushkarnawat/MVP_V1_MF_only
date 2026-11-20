export const SINCE_PURCHASE_CAPTION = "Return since purchase, not annualised";
export const SINCE_PURCHASE_SHORT_LABEL = "since purchase";

export interface XirrDisplayResult {
  value: string | null | undefined;
  isSincePurchase: boolean;
}

export function resolveXirrDisplay(
  annualised: string | null | undefined,
  basis: XirrBasis | null | undefined,
  sincePurchase: string | null | undefined,
): XirrDisplayResult {
  if (basis === "since_purchase" && sincePurchase != null) {
    return { value: sincePurchase, isSincePurchase: true };
  }
  return { value: annualised, isSincePurchase: false };
}
