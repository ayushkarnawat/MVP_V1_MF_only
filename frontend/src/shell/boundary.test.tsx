import { isValidElement } from "react";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";

const entry = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: entry.render }) }));
vi.mock("../App", () => ({ default: vi.fn(() => null) }));
vi.mock("../features/analytics/print/PrintAnalyticsView", () => ({ PrintAnalyticsView: vi.fn(() => null) }));
vi.mock("../features/legal/LegalPage", async () => {
  const actual = await vi.importActual<typeof import("../features/legal/LegalPage")>("../features/legal/LegalPage");
  return { ...actual, LegalPage: vi.fn(() => null) };
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each(["/print/analytics", "/legal/terms", "/legal/privacy"])("the real entry point at %s bypasses App and its router", async pathname => {
  vi.resetModules();
  const original = window;
  vi.stubGlobal("window", new Proxy(original, { get(target, property) {
    return property === "location" ? { pathname } : Reflect.get(target, property);
  } }));
  await import("../main");
  const tree: unknown = entry.render.mock.calls.at(-1)?.[0];
  expect(isValidElement(tree)).toBe(true);
  const child = (tree as ReactElement<{ children: ReactElement }>).props.children;
  const { default: App } = await import("../App");
  const { PrintAnalyticsView } = await import("../features/analytics/print/PrintAnalyticsView");
  const { LegalPage } = await import("../features/legal/LegalPage");
  expect(child.type).toBe(pathname.startsWith("/print") ? PrintAnalyticsView : LegalPage);
  expect(child.type).not.toBe(App);
  expect(App).not.toHaveBeenCalled();
});
