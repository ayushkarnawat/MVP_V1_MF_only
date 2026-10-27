import type { PrimaryGoal } from "@/features/auth/types";
import { GOAL_OPTIONS, humanizeCode } from "./onboardingOptions";

export interface GoalChip {
  label: string;
  unknown: boolean;
}

const KNOWN_MAP = new Map<string, string>(GOAL_OPTIONS.map(opt => [opt.value, opt.title]));

export function goalChips(codes: readonly string[] | null | undefined): GoalChip[] {
  if (!codes || codes.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const uniqueCodes: string[] = [];
  for (const code of codes) {
    if (code && !seen.has(code)) {
      seen.add(code);
      uniqueCodes.push(code);
    }
  }

  const knownSet = new Set(uniqueCodes.filter(c => KNOWN_MAP.has(c)));
  const unknownCodes = uniqueCodes.filter(c => !KNOWN_MAP.has(c));

  const result: GoalChip[] = [];
  if (knownSet.size === GOAL_OPTIONS.length) {
    result.push({ label: "All of it", unknown: false });
  } else {
    for (const opt of GOAL_OPTIONS) {
      if (knownSet.has(opt.value)) {
        result.push({ label: opt.title, unknown: false });
      }
    }
  }

  for (const code of unknownCodes) {
    result.push({ label: humanizeCode(code), unknown: true });
  }

  return result;
}

export function mergeGoals(
  current: readonly string[] | null | undefined,
  selectedKnown: readonly PrimaryGoal[]
): string[] {
  const selectedSet = new Set<PrimaryGoal>(selectedKnown);
  const knownInOrder: string[] = [];
  for (const opt of GOAL_OPTIONS) {
    if (selectedSet.has(opt.value)) {
      knownInOrder.push(opt.value);
    }
  }

  const storedUnknown: string[] = [];
  const seenStored = new Set<string>();
  if (current) {
    for (const code of current) {
      if (code && !KNOWN_MAP.has(code) && !seenStored.has(code)) {
        seenStored.add(code);
        storedUnknown.push(code);
      }
    }
  }

  return [...knownInOrder, ...storedUnknown];
}
