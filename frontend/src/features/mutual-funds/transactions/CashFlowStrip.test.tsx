import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { formatRupees } from "../../../lib/format";
import { CashFlowStrip } from "./CashFlowStrip";
import { investmentWithdrawal } from "../fixtures/mfB";
it("adds decimal strings exactly without changing the payload or net invested", () => {
  const data = { ...investmentWithdrawal(), total_invested: "9007199254740993.01", total_withdrawn: "0.02",
    total_switched_in: "0.03", total_switched_out: "0.04" };
  const before = structuredClone(data);
  const { rerender } = render(<CashFlowStrip data={data} filter="all" onFilter={vi.fn()} />);
  const net = screen.getByTestId("tile-net-value").textContent;
  rerender(<CashFlowStrip data={data} filter="all" onFilter={vi.fn()} includeSwitches />);
  expect(screen.getByTestId("tile-invested-value").textContent).toBe(formatRupees("9007199254740993.04"));
  expect(screen.getByTestId("tile-net-value").textContent).toBe(net);
  expect(data).toEqual(before);
});
