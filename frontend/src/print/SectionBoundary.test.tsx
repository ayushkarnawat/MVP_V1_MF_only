import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PrintModeProvider } from "../lib/printMode";
import { SectionBoundary } from "./SectionBoundary";
import { PrintSettledContext } from "./usePrintSettled";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Boom(): never { throw new Error("invented section crash"); }

it("a section that throws prints the failure sentence in place, reports settled, and the next section still renders", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const settled = vi.fn();
  render(
    <PrintModeProvider value={{ folios: "full", dataDates: true }}>
      <PrintSettledContext.Provider value={settled}>
        <SectionBoundary id="demo-a" title="Demo section"><Boom /></SectionBoundary>
        <SectionBoundary id="demo-b" title="Other section"><p>Other content</p></SectionBoundary>
      </PrintSettledContext.Provider>
    </PrintModeProvider>,
  );
  expect(screen.getByRole("heading", { name: "Demo section" })).toBeInTheDocument();
  expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(settled).toHaveBeenCalledWith("demo-a", true);
  expect(screen.getByText("Other content")).toBeInTheDocument();
});
