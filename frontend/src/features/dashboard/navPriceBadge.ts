/** Which small badge sits beside a fund's NAV. A fund in no fund list is
 * valued at the NAV its statement printed (decided 6 Oct), which is always
 * dated; it says "Statement price" rather than "stale". */
export function navPriceBadge(h: { stale_nav?: boolean; price_from_statement?: boolean }):
  { label: string; variant: "neutral" | "warning" } | null {
  if (h.price_from_statement) return { label: "Statement price", variant: "neutral" };
  if (h.stale_nav) return { label: "stale", variant: "warning" };
  return null;
}
