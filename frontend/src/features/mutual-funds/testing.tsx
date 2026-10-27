// Test helpers for the Mutual Funds page (packet MF-A). Orchestrator-owned: never edit; never import from source files.
import { vi } from "vitest";
import { expect } from "vitest";
import type { HistoryPoint, Load } from "./types";

export const loaded = <T,>(data: T): Load<T> => ({ status: "data", data, retry: vi.fn() });
export const loadingLoad = <T,>(): Load<T> => ({ status: "loading", data: null, retry: vi.fn() });
export const failedLoad = <T,>(): Load<T> => ({ status: "error", data: null, retry: vi.fn() });

export function points(values: number[], partialAt: number[] = []): HistoryPoint[] {
  return values.map((value, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}-28`, value, invested: value - 100, valueText: `${value}.00`, investedText: `${value - 100}.00`,
    partial: partialAt.includes(index), missing: partialAt.includes(index) ? ["Some Fund"] : [],
  }));
}

const EFFECTS = ["select", "open", "navigate", "sort", "switch", "retry", "expand"];
const SELECTED_ATTRS = ["aria-pressed", "aria-selected", "aria-current", "aria-expanded", "aria-checked"];

/** Design rule 11.1 on one rendered container: every control is marked data-clickable with a data-effect, a
 * select/switch/sort/expand control exposes its persistent state through an ARIA attribute, and every tooltip has text. */
export function expectInteractivity(container: HTMLElement, minimum = 1) {
  // Parts moved out of the old screens (components/mf) keep their own markup: a wrapper marked data-legacy exempts them.
  const controls = [...container.querySelectorAll<HTMLElement>("button, [role=button], [role=tab], [role=radio], [role=option]")]
    .filter(control => control.closest("[data-legacy]") === null);
  const bare = controls.filter(control => !control.hasAttribute("data-clickable")).map(control => control.outerHTML.slice(0, 120));
  expect(bare).toEqual([]);
  const clickable = [...container.querySelectorAll<HTMLElement>("[data-clickable]")];
  expect(clickable.length).toBeGreaterThanOrEqual(minimum);
  for (const element of clickable) {
    const effect = element.getAttribute("data-effect") ?? "";
    expect(EFFECTS, element.outerHTML.slice(0, 120)).toContain(effect);
    if (["select", "switch", "sort", "expand"].includes(effect)) {
      const stated = SELECTED_ATTRS.some(attr => element.hasAttribute(attr)) || (effect === "sort" && element.closest("[aria-sort]") !== null);
      expect(stated, `${effect} control without a state attribute: ${element.outerHTML.slice(0, 120)}`).toBe(true);
    }
  }
  for (const tip of container.querySelectorAll<HTMLElement>("[data-tooltip]")) {
    expect((tip.getAttribute("title") ?? "").length, tip.outerHTML.slice(0, 120)).toBeGreaterThan(0);
  }
}
