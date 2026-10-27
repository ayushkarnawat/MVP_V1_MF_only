export type PlanningView = "landing" | "future" | "market";

export interface PlanningHistoryState {
  planning: PlanningView;
  scenarioId: string | null;
}

export function pushPlanningState(state: PlanningHistoryState): void {
  const current = window.history.state;
  const others = typeof current === "object" && current !== null ? { ...current } : {};
  window.history.pushState(
    {
      ...others,
      planning: state.planning,
      scenarioId: state.scenarioId,
    },
    ""
  );
}

export function replacePlanningState(state: PlanningHistoryState): void {
  const current = window.history.state;
  const others = typeof current === "object" && current !== null ? { ...current } : {};
  window.history.replaceState(
    {
      ...others,
      planning: state.planning,
      scenarioId: state.scenarioId,
    },
    ""
  );
}

export function readPlanningState(): PlanningHistoryState | null {
  const state = window.history.state;
  if (typeof state !== "object" || state === null) return null;
  if (!("planning" in state) || !("scenarioId" in state)) return null;
  const { planning, scenarioId } = state as Record<string, unknown>;
  if (planning !== "landing" && planning !== "future" && planning !== "market") return null;
  if (typeof scenarioId !== "string" && scenarioId !== null) return null;
  return { planning, scenarioId };
}
