import type { OnboardingStep } from "./onboardingSteps";

export interface HistoryState {
  order: OnboardingStep[];
  cursor: number;
  skipped: Set<OnboardingStep>;
}

export function initHistory(first: OnboardingStep): HistoryState {
  return { order: [first], cursor: 0, skipped: new Set() };
}

export function currentStep(state: HistoryState): OnboardingStep {
  return state.order[state.cursor];
}

export function goNext(state: HistoryState, next: OnboardingStep): HistoryState {
  const nextIndex = state.cursor + 1;
  if (state.order[nextIndex] === next) {
    return { ...state, cursor: nextIndex };
  }
  return { ...state, order: [...state.order.slice(0, nextIndex), next], cursor: nextIndex };
}

export function goBack(state: HistoryState): HistoryState {
  if (state.cursor === 0) {
    return state;
  }
  return { ...state, cursor: state.cursor - 1 };
}

// Jumps directly to the last time `step` was visited, rather than stepping
// back one entry at a time — used for a hard-stop escape hatch (e.g. a
// cross-account PAN block on the CAS upload screen) that needs to land on a
// specific earlier screen regardless of how many steps deep the user is
// (the "Family Too" path visits several steps between q4_household and the
// upload screen, so a plain goBack() wouldn't reliably land there).
export function goBackTo(state: HistoryState, step: OnboardingStep): HistoryState {
  const index = state.order.lastIndexOf(step);
  if (index === -1) {
    return state;
  }
  return { ...state, cursor: index };
}

export function skipToNext(state: HistoryState, next: OnboardingStep): HistoryState {
  const skipped = new Set(state.skipped);
  skipped.add(currentStep(state));
  return goNext({ ...state, skipped }, next);
}

export function markAnswered(state: HistoryState): HistoryState {
  if (!state.skipped.has(currentStep(state))) {
    return state;
  }
  const skipped = new Set(state.skipped);
  skipped.delete(currentStep(state));
  return { ...state, skipped };
}

export function isSkipped(state: HistoryState, step: OnboardingStep): boolean {
  return state.skipped.has(step);
}
