import { INVESTOR_OPTIONS, humanizeCode } from "./onboardingOptions";

const INVESTOR_MAP = new Map<string, string>(
  INVESTOR_OPTIONS.map(opt => [opt.value, opt.title])
);

export function investorLabel(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  const known = INVESTOR_MAP.get(code);
  if (known !== undefined) {
    return known;
  }
  return humanizeCode(code);
}
