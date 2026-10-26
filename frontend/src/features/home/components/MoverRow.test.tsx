import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MoverBarOut } from "../types";
import { MoverRow } from "./MoverRow";

const gain: MoverBarOut = {
  key: "Banks", label: "Banks", change: "38400.00",
  funds: [
    { scheme_id: "a", name: "Fund A", change: null },
    { scheme_id: "b", name: "Fund B", change: null },
    { scheme_id: "c", name: "Fund C", change: null },
  ],
};
const loss: MoverBarOut = { key: "Autos", label: "Autos", change: "-12600.00", funds: [{ scheme_id: "d", name: "Fund D", change: null }] };

describe("MoverRow", () => {
  it("shows the label, the number of funds and the signed amount", () => {
    render(<MoverRow bar={gain} view="sector" maxAbs={38400} onOpen={() => {}} />);
    const row = screen.getByTestId("mover-Banks");
    expect(row.textContent).toContain("Banks");
    expect(row.textContent).toContain("3 funds");
    expect(row.textContent).toContain("+₹38,400");
  });

  it("uses a minus before the rupee sign and the negative colour for a loss", () => {
    const { container } = render(<MoverRow bar={loss} view="sector" maxAbs={38400} onOpen={() => {}} />);
    const row = screen.getByTestId("mover-Autos");
    expect(row.textContent).toContain("-₹12,600");
    expect(row.textContent).toContain("1 fund");
    expect(container.innerHTML).toContain("var(--neg-text)");
  });

  it("uses the positive colour for a gain", () => {
    const { container } = render(<MoverRow bar={gain} view="sector" maxAbs={38400} onOpen={() => {}} />);
    expect(container.innerHTML).toContain("var(--pos-text)");
  });

  it("draws a centred bar: gains to the right of the middle, losses to the left, sized against the largest amount", () => {
    const first = render(<MoverRow bar={gain} view="sector" maxAbs={76800} onOpen={() => {}} />);
    const gainBar = screen.getByTestId("mover-bar-Banks");
    expect(gainBar.getAttribute("data-side")).toBe("gain");
    expect(gainBar.style.width).toBe("25%");
    first.unmount();
    render(<MoverRow bar={loss} view="sector" maxAbs={12600} onOpen={() => {}} />);
    const lossBar = screen.getByTestId("mover-bar-Autos");
    expect(lossBar.getAttribute("data-side")).toBe("loss");
    expect(lossBar.style.width).toBe("50%");
  });

  it("tells the view apart with a data attribute on the tile", () => {
    const { rerender } = render(<MoverRow bar={gain} view="sector" maxAbs={1} onOpen={() => {}} />);
    expect(screen.getByTestId("mover-tile-Banks").getAttribute("data-view")).toBe("sector");
    rerender(<MoverRow bar={gain} view="fund" maxAbs={1} onOpen={() => {}} />);
    expect(screen.getByTestId("mover-tile-Banks").getAttribute("data-view")).toBe("fund");
  });

  it("opens with the bar on click, Enter and Space", () => {
    const onOpen = vi.fn();
    render(<MoverRow bar={gain} view="sector" maxAbs={1} onOpen={onOpen} />);
    const row = screen.getByTestId("mover-Banks");
    expect(row.getAttribute("role")).toBe("button");
    expect(row.getAttribute("tabindex")).toBe("0");
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    row.dispatchEvent(space);
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenLastCalledWith(gain);
    expect(space.defaultPrevented).toBe(true);
    fireEvent.keyDown(row, { key: "q" });
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it("uses palette variables only", () => {
    const { container } = render(<MoverRow bar={gain} view="sector" maxAbs={1} onOpen={() => {}} />);
    expect(container.innerHTML).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });
});
