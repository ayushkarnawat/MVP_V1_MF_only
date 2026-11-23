import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SearchNotice } from "./SearchNotice";

const mocks = vi.hoisted(() => ({
  undo: vi.fn(),
  scopeJump: undefined as { label: string; undo: () => void } | null | undefined,
}));
vi.mock("../../shell/scope/ScopeContext", () => ({
  useScope: () => ({ scopeJump: mocks.scopeJump }),
}));

beforeEach(() => {
  mocks.undo.mockClear();
  mocks.scopeJump = { label: "Asha", undo: mocks.undo };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("9. Search notice", () => {
  it("notice: announces the scope switch and Undo calls the provider", () => {
    render(<SearchNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("Switched to Asha.");
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toHaveAttribute("data-clickable", "");
    fireEvent.click(undo);
    expect(mocks.undo).toHaveBeenCalledTimes(1);
  });
  it.each([null, undefined])("notice: renders nothing for scopeJump %s", (scopeJump) => {
    mocks.scopeJump = scopeJump;
    const { container } = render(<SearchNotice />);
    expect(container).toBeEmptyDOMElement();
  });
  it("notice: stays until the provider clears it, without an auto-dismiss timer", () => {
    vi.useFakeTimers();
    const { rerender, container } = render(<SearchNotice />);
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole("status")).toHaveTextContent("Switched to Asha.");
    expect(mocks.undo).not.toHaveBeenCalled();
    mocks.scopeJump = null;
    rerender(<SearchNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
