export const FIXABLE_REASONS: ReadonlySet<string> = new Set([
  "no_email",
  "no_phone",
  "no_pan",
  "label_missing",
  "same_email_as_head",
  "same_phone_as_head",
  "email_in_use",
  "phone_in_use",
]);

export function isFixable(reasons: readonly string[]): boolean {
  return reasons.length > 0 && reasons.every((r) => FIXABLE_REASONS.has(r));
}

const ORDERED_REASON_THINGS: Array<{ match: (reasons: readonly string[]) => boolean; thing: string }> = [
  { match: (reasons) => reasons.includes("no_email"), thing: "an email address" },
  { match: (reasons) => reasons.includes("no_phone"), thing: "a phone number" },
  { match: (reasons) => reasons.includes("no_pan"), thing: "their PAN" },
  { match: (reasons) => reasons.includes("label_missing"), thing: "their relationship to you" },
  {
    match: (reasons) => reasons.some((r) => r === "same_email_as_head" || r === "email_in_use"),
    thing: "a different email address",
  },
  {
    match: (reasons) => reasons.some((r) => r === "same_phone_as_head" || r === "phone_in_use"),
    thing: "a different phone number",
  },
];

export function fixableHint(reasons: readonly string[]): string {
  const things: string[] = [];
  for (const { match, thing } of ORDERED_REASON_THINGS) {
    if (match(reasons)) {
      things.push(thing);
    }
  }
  if (things.length === 0) return "";
  if (things.length === 1) return `Needs ${things[0]}.`;
  if (things.length === 2) return `Needs ${things[0]} and ${things[1]}.`;
  return `Needs ${things.slice(0, -1).join(", ")} and ${things[things.length - 1]}.`;
}
