export function splitCurrency(text: string): { sign: string; currency: string; digits: string } {
  const match = /^([+-]?)₹(.*)$/.exec(text);
  return match
    ? { sign: match[1], currency: "₹", digits: match[2] }
    : { sign: "", currency: "", digits: text };
}
