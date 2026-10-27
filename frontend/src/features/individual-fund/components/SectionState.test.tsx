import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionState } from "./SectionState";

describe("SectionState", () => {
  it("loading shows a status named after the section, and not the children", () => {
    render(<SectionState status="loading" label="performance"><p>content</p></SectionState>);
    expect(screen.getByRole("status", { name: "Loading performance" })).toBeInTheDocument();
    expect(screen.queryByText("content")).toBeNull();
  });

  it("loading can draw a custom skeleton inside the status", () => {
    render(<SectionState status="loading" label="returns" skeleton={<span>custom skeleton</span>}><p>content</p></SectionState>);
    expect(screen.getByRole("status", { name: "Loading returns" })).toHaveTextContent("custom skeleton");
  });

  it("unavailable shows the sentence for the reason code", () => {
    render(<SectionState status="unavailable" label="risk" reason="no_history"><p>content</p></SectionState>);
    expect(screen.getByTestId("section-unavailable")).toHaveTextContent("No price history yet for this fund.");
    expect(screen.queryByText("content")).toBeNull();
  });

  it("unavailable with an unknown reason shows the generic line", () => {
    render(<SectionState status="unavailable" label="risk" reason="odd"><p>content</p></SectionState>);
    expect(screen.getByTestId("section-unavailable")).toHaveTextContent("Not available right now.");
  });

  it("error shows its own message and a Retry button that calls onRetry", () => {
    const onRetry = vi.fn();
    render(<SectionState status="error" label="returns" onRetry={onRetry}><p>content</p></SectionState>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load returns.");
    expect(alert).toHaveTextContent("This section failed to load, but the rest of the page is unaffected.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("error without onRetry has no button", () => {
    render(<SectionState status="error" label="returns"><p>content</p></SectionState>);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ready renders the children", () => {
    render(<SectionState status="ready" label="returns"><p>content</p></SectionState>);
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
