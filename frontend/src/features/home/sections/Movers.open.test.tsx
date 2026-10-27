import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import { formatSignedRupees } from "../homeFormat";
import type { MoversResponse } from "../types";
import { Movers, type MoversProps } from "./Movers";

const sector = () => fixture<MoversResponse>("movers_sector");
const byFund = () => fixture<MoversResponse>("movers_fund");

function props(overrides: Partial<MoversProps> = {}): MoversProps {
  return { status: "data", data: byFund(), view: "fund", onViewChange: vi.fn(), onRetry: vi.fn(), ...overrides };
}

describe("Movers: opening a popup on request (the greeting's top-mover link)", () => {
  it("opens the popup of the gainer named in the request and moves focus into it", () => {
    render(<Movers {...props({ openRequest: { name: "Asha Large Cap", token: 1 } })} />);
    const dialog = screen.getByRole("dialog", { name: "Asha Large Cap funds" });
    expect(dialog).toHaveFocus();
    expect(within(dialog).getAllByText("Asha Large Cap").length).toBeGreaterThan(0);
    expect(within(dialog).getByText(formatSignedRupees("10.00"))).toBeInTheDocument();
  });

  it("finds a loser too", () => {
    render(<Movers {...props({ openRequest: { name: "Asha Flexi Cap", token: 1 } })} />);
    expect(screen.getByRole("dialog", { name: "Asha Flexi Cap funds" })).toBeInTheDocument();
  });

  it("opens nothing without a request", () => {
    render(<Movers {...props()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens nothing, and does not keep waiting, when no row has that name", () => {
    const { rerender } = render(<Movers {...props({ openRequest: { name: "Nobody Fund", token: 1 } })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Movers {...props({ openRequest: { name: "Nobody Fund", token: 1 } })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("waits while the rows are still the old grouping, then opens when the fund rows arrive", () => {
    const request = { name: "Asha Large Cap", token: 1 };
    const { rerender } = render(<Movers {...props({ data: sector(), view: "fund", openRequest: request })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Movers {...props({ data: byFund(), view: "fund", openRequest: request })} />);
    expect(screen.getByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
  });

  it("waits while the grouping shown is not the fund grouping", () => {
    const request = { name: "Asha Large Cap", token: 1 };
    const { rerender } = render(<Movers {...props({ data: byFund(), view: "sector", openRequest: request })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Movers {...props({ data: byFund(), view: "fund", openRequest: request })} />);
    expect(screen.getByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
  });

  it("waits while loading", () => {
    const request = { name: "Asha Large Cap", token: 1 };
    const { rerender } = render(<Movers {...props({ status: "loading", data: null, openRequest: request })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Movers {...props({ openRequest: request })} />);
    expect(screen.getByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
  });

  it("does not reopen the same request after the user closed the popup", () => {
    const request = { name: "Asha Large Cap", token: 1 };
    const { rerender } = render(<Movers {...props({ openRequest: request })} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Movers {...props({ openRequest: { ...request } })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Movers {...props({ data: { ...byFund() }, openRequest: request })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens again for a new token", () => {
    const { rerender } = render(<Movers {...props({ openRequest: { name: "Asha Large Cap", token: 1 } })} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    rerender(<Movers {...props({ openRequest: { name: "Asha Large Cap", token: 2 } })} />);
    expect(screen.getByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
  });

  it("leaves the normal row click working next to a request", () => {
    render(<Movers {...props({ openRequest: { name: "Asha Large Cap", token: 1 } })} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByTestId("mover-7c906599-2ff8-5de4-83f9-b94651c683f2"));
    expect(screen.getByRole("dialog", { name: "Dev Gold Fund funds" })).toBeInTheDocument();
  });
});
