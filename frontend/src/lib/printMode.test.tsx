import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PrintModeProvider, usePrintMode } from "./printMode";
import { InfoMark, SectionCard } from "../features/mutual-funds/common/SectionCard";
import { FolioNumber } from "../components/mf/FolioNumber";
import { useMountProgress } from "../components/ui/charts/use-mount-progress";
import { clipRevealTransition } from "../components/ui/charts/animation";
import { installPrintRuntime } from "../print/printRuntime";

afterEach(() => { cleanup(); delete document.documentElement.dataset.print; });
it("usePrintMode is null outside a provider", () => expect(renderHook(usePrintMode).result.current).toBeNull());
it("SectionCard outside print mode renders the InfoMark and Retry as today", () => {
  render(<SectionCard title="Demo" info="Explanation" state="failed" onRetry={vi.fn()}>Content</SectionCard>);
  expect(screen.getByRole("img", { name: "Explanation" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});
it("SectionCard in print mode has no InfoMark, no Retry, no skeleton pulse", () => {
  const { container } = render(<PrintModeProvider value={{ folios: "none", dataDates: true }}>
    <InfoMark text="Hidden" />
    <SectionCard title="Failed" info="Hidden" state="failed" onRetry={vi.fn()}>Content</SectionCard>
    <SectionCard title="Loading" state="loading" skeleton={<div className="animate-pulse">Pulse</div>}>Content</SectionCard>
  </PrintModeProvider>);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(container.querySelector('[class*="animate-pulse"]')).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("This section failed to load");
});
it.each([ ["full", "12345678/0"], ["masked", "XXXX5678/0"], ["none", ""] ] as const)("FolioNumber follows the print option: %s, and has no eye button", (folios, text) => {
  const { container } = render(<PrintModeProvider value={{ folios, dataDates: false }}><FolioNumber value="12345678/0" showCopy /></PrintModeProvider>);
  expect(container.textContent).toBe(text);
  expect(screen.queryByRole("button")).toBeNull();
});
it("chart mount progress is 1 immediately in print mode", () => {
  const { result } = renderHook(() => useMountProgress(undefined, 10, "demo"), {
    wrapper: ({ children }) => <PrintModeProvider value={{ folios: "none", dataDates: false }}>{children}</PrintModeProvider>,
  });
  expect(result.current.get()).toBe(1);
  installPrintRuntime();
  expect(clipRevealTransition({ type: "tween", duration: 5, delay: 5 }).duration).toBe(0);
  expect(clipRevealTransition({ type: "tween", delay: 5 }).delay).toBe(0);
});
