import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFolioVisibilityForTests } from "@/lib/folioVisibility";
import { FolioNumber } from "./FolioNumber";

// Batch C 17c (C-7): the one shared "folio number plus its eye" component. Design: Docs/orchestration/2026-11-12-batch-c-planning-workbook.html,
// section 4 ("How the eye icon works"). Red until C-7 builds it.
const writeText = vi.fn();
const setClipboard = (value: unknown) => Object.defineProperty(navigator, "clipboard", { value, configurable: true });

beforeEach(() => {
  resetFolioVisibilityForTests();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  setClipboard({ writeText });
});
afterEach(() => setClipboard(undefined));

describe("FolioNumber", () => {
  it("shows the full number by default, in the monospace style, wrapping instead of being cut off (overflow-wrap anywhere)", () => {
    render(<FolioNumber value="10234567 / 0" />);
    const number = screen.getByText("10234567 / 0");
    expect(number).toHaveClass("font-mono");
    expect(number).toHaveClass("[overflow-wrap:anywhere]");
  });

  it('has an eye button labelled "Hide folio numbers" with aria-pressed false, and no visible text in the button', () => {
    render(<FolioNumber value="10234567 / 0" />);
    const eye = screen.getByRole("button", { name: "Hide folio numbers" });
    expect(eye).toHaveAttribute("type", "button");
    expect(eye).toHaveAttribute("aria-pressed", "false");
    expect(eye.textContent).toBe("");
    expect(eye.querySelector("svg")).not.toBeNull();
  });

  it('one click hides it as XXXX4567 / 0 and the button becomes "Show folio numbers" (pressed); another click shows it again', () => {
    render(<FolioNumber value="10234567 / 0" />);
    fireEvent.click(screen.getByRole("button", { name: "Hide folio numbers" }));
    expect(screen.getByText("XXXX4567 / 0")).toBeInTheDocument();
    expect(screen.queryByText("10234567 / 0")).toBeNull();
    const show = screen.getByRole("button", { name: "Show folio numbers" });
    expect(show).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(show);
    expect(screen.getByText("10234567 / 0")).toBeInTheDocument();
  });

  it("hides all instances at once, however many are on the page", () => {
    render(<><FolioNumber value="10234567 / 0" /><FolioNumber value="55501234 / 1" /><FolioNumber value="ABC12345" /></>);
    fireEvent.click(screen.getAllByRole("button", { name: "Hide folio numbers" })[1]);
    expect(screen.getByText("XXXX4567 / 0")).toBeInTheDocument();
    expect(screen.getByText("XXXX1234 / 1")).toBeInTheDocument();
    expect(screen.getByText("XXXX2345")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Show folio numbers" })).toHaveLength(3);
  });

  it("a short number and a number with letters hide by the same rule", () => {
    render(<><FolioNumber value="123" /><FolioNumber value="KFN-00123 / 12" /></>);
    fireEvent.click(screen.getAllByRole("button", { name: "Hide folio numbers" })[0]);
    expect(screen.getByText("XXXX123")).toBeInTheDocument();
    expect(screen.getByText("XXXX0123 / 12")).toBeInTheDocument();
  });

  it("is still hidden after a remount (the choice is remembered in this browser)", () => {
    const first = render(<FolioNumber value="10234567 / 0" />);
    fireEvent.click(screen.getByRole("button", { name: "Hide folio numbers" }));
    first.unmount();
    act(() => resetFolioVisibilityForTests({ rereadStorage: true }));
    render(<FolioNumber value="10234567 / 0" />);
    expect(screen.getByText("XXXX4567 / 0")).toBeInTheDocument();
  });

  it("has no Copy button unless asked for one", () => {
    render(<FolioNumber value="10234567 / 0" />);
    expect(screen.queryByRole("button", { name: /Copy folio number/ })).toBeNull();
  });

  describe("with showCopy (the fund page)", () => {
    it("Copy copies the number that is shown and says Copied", async () => {
      render(<FolioNumber value="10234567 / 0" showCopy />);
      fireEvent.click(screen.getByRole("button", { name: "Copy folio number 10234567 / 0" }));
      expect(await screen.findByText("Copied")).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith("10234567 / 0");
    });
    it('while hidden, Copy is dimmed (aria-disabled), carries the tip "Show the number to copy it", copies nothing and does not leak the number in its name', async () => {
      render(<FolioNumber value="10234567 / 0" showCopy />);
      fireEvent.click(screen.getByRole("button", { name: "Hide folio numbers" }));
      const copy = screen.getByRole("button", { name: "Copy folio number XXXX4567 / 0" });
      expect(copy).toHaveAttribute("aria-disabled", "true");
      expect(copy).toHaveAttribute("title", "Show the number to copy it");
      fireEvent.click(copy);
      await act(async () => {});
      expect(writeText).not.toHaveBeenCalled();
      expect(screen.queryByText("Copied")).toBeNull();
      expect(document.body.textContent).not.toContain("10234567");
    });
    it("a refusing or missing clipboard says Couldn't copy the folio number.", async () => {
      writeText.mockRejectedValue(new Error("denied"));
      render(<FolioNumber value="10234567 / 0" showCopy />);
      fireEvent.click(screen.getByRole("button", { name: "Copy folio number 10234567 / 0" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't copy the folio number.");
      setClipboard(undefined);
      fireEvent.click(screen.getByRole("button", { name: "Copy folio number 10234567 / 0" }));
      await act(async () => {});
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't copy the folio number.");
    });
    it("the Copied note goes away after about two seconds and its timer is cleared on unmount", async () => {
      vi.useFakeTimers();
      try {
        const view = render(<FolioNumber value="10234567 / 0" showCopy />);
        fireEvent.click(screen.getByRole("button", { name: "Copy folio number 10234567 / 0" }));
        await act(async () => { await vi.advanceTimersByTimeAsync(10); });
        expect(screen.getByText("Copied")).toBeInTheDocument();
        await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
        expect(screen.queryByText("Copied")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Copy folio number 10234567 / 0" }));
        await act(async () => { await vi.advanceTimersByTimeAsync(10); });
        view.unmount();
        await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("never asks the server for anything and never logs the number", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    render(<FolioNumber value="10234567 / 0" showCopy />);
    fireEvent.click(screen.getByRole("button", { name: "Hide folio numbers" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    log.mockRestore();
  });
});
