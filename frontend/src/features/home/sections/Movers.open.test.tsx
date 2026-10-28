import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import { formatSignedRupees } from "../homeFormat";
import type { MoversResponse } from "../types";
import { Movers, type MoversProps } from "./Movers";
import { renderInShell as render } from "@/shell/testing";

const sector = () => fixture<MoversResponse>("movers_sector");
const byFund = () => fixture<MoversResponse>("movers_fund");

function props(overrides: Partial<MoversProps> = {}): MoversProps {
  return { status: "data", data: byFund(), view: "fund", onViewChange: vi.fn(), onRetry: vi.fn(), ...overrides };
}

describe("Movers: closing the inline popup", () => {
  it("returns focus to the row that opened it, for Escape and for the close button", () => {
    render(<Movers {...props({ view: "sector", data: sector() })} />);
    const row = screen.getAllByRole("button").find(el => el.getAttribute("data-testid")?.startsWith("mover-") && !el.getAttribute("data-testid")?.startsWith("mover-tile"))!;
    fireEvent.click(row);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(row).toHaveFocus();
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(row).toHaveFocus();
  });
});

describe("Movers: closing the popup of a fund row that holds a link", () => {
  it("returns focus to the row's own open button, for Escape and for the close button", () => {
    render(<Movers {...props()} />);
    const rowElement = screen.getAllByTestId(/^mover-(?!bar|tile)/)[0];
    expect(rowElement).not.toHaveAttribute("role");
    const opener = within(rowElement).getByRole("button");
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});

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

  it("matches by scheme id when one is given, even if the name is different or wrong", () => {
    render(<Movers {...props({ openRequest: { name: "Old Display Name", schemeId: "54b8755e-6b2b-5f4f-a8fe-b41125031af6", token: 1 } })} />);
    expect(screen.getByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
  });

  it("matches a loser by scheme id", () => {
    render(<Movers {...props({ openRequest: { name: "Whatever", schemeId: "fe06ac21-f8c7-5dbf-a877-5c703ddbcdef", token: 1 } })} />);
    expect(screen.getByRole("dialog", { name: "Asha Flexi Cap funds" })).toBeInTheDocument();
  });

  it("lets the id win when the name belongs to a different row", () => {
    render(<Movers {...props({ openRequest: { name: "Asha Large Cap", schemeId: "7c906599-2ff8-5de4-83f9-b94651c683f2", token: 1 } })} />);
    expect(screen.getByRole("dialog", { name: "Dev Gold Fund funds" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Asha Large Cap funds" })).toBeNull();
  });

  it("opens nothing, and does not fall back to the name, when the id is given but no row has it", () => {
    render(<Movers {...props({ openRequest: { name: "Asha Large Cap", schemeId: "00000000-0000-4000-8000-000000000000", token: 1 } })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("falls back to the name only when the id is null or missing", () => {
    const first = render(<Movers {...props({ openRequest: { name: "Dev Gold Fund", schemeId: null, token: 1 } })} />);
    expect(screen.getByRole("dialog", { name: "Dev Gold Fund funds" })).toBeInTheDocument();
    first.unmount();
    render(<Movers {...props({ openRequest: { name: "Asha Flexi Cap", token: 1 } })} />);
    expect(screen.getByRole("dialog", { name: "Asha Flexi Cap funds" })).toBeInTheDocument();
  });

  it("still waits for the fund rows when matching by id", () => {
    const request = { name: "Asha Large Cap", schemeId: "54b8755e-6b2b-5f4f-a8fe-b41125031af6", token: 1 };
    const { rerender } = render(<Movers {...props({ data: sector(), view: "fund", openRequest: request })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Movers {...props({ data: byFund(), view: "fund", openRequest: request })} />);
    expect(screen.getByRole("dialog", { name: "Asha Large Cap funds" })).toBeInTheDocument();
  });

  it("leaves the normal row click working next to a request", () => {
    render(<Movers {...props({ openRequest: { name: "Asha Large Cap", token: 1 } })} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByTestId("mover-7c906599-2ff8-5de4-83f9-b94651c683f2"));
    expect(screen.getByRole("dialog", { name: "Dev Gold Fund funds" })).toBeInTheDocument();
  });
});
