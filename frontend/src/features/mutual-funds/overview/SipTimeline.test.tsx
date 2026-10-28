import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../fixtures";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity, failedLoad, loaded, loadingLoad } from "../testing";

const mocks = vi.hoisted(() => ({ getSipsMonthly: vi.fn() }));
vi.mock("../api", () => mocks);

import { SipTimeline } from "./SipTimeline";
import type { SipRow } from "../types";

const members = [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }];
const mount = (sips: ReturnType<typeof loaded<SipRow[]>> = loaded(fx.sips().sips), scope: Parameters<typeof renderInShell>[1] = { scope: { members } }) =>
  renderInShell(<SipTimeline sips={sips} />, { path: "/portfolio/mutual-funds", ...scope });

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-26T10:00:00Z")); mocks.getSipsMonthly.mockReset(); mocks.getSipsMonthly.mockResolvedValue(fx.sipsMonthly().sips); });
afterEach(() => { vi.useRealTimers(); });

describe("SipTimeline", () => {
  it("shows the heading, the next SIP chip and the monthly total pill", () => {
    mount();
    expect(screen.getByRole("heading", { name: "SIPs" })).toBeInTheDocument();
    expect(screen.getByTestId("sip-next")).toHaveTextContent("Next: Kotak Multi Cap Fund · 24 Oct · ₹3,336");
    expect(screen.getByTestId("sip-total")).toHaveTextContent("Monthly SIP total ₹50,575");
    expect(screen.getByTestId("info-sips")).toHaveAttribute("title", "Every active and stopped systematic investment plan across your family, scoped to the selected member.");
  });
  it("has three equal tabs with counts, Upcoming selected first", () => {
    mount();
    const tabs = within(screen.getByRole("tablist", { name: "SIP view" })).getAllByRole("tab");
    expect(tabs.map(tab => tab.textContent)).toEqual(["Upcoming (4)", "This Month", "Stopped (1)"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });
  it("draws one date capsule per due date with the day's total and instalment dots", () => {
    mount();
    for (const date of ["2026-10-24", "2026-10-26", "2026-10-27"]) expect(screen.getByTestId(`sip-cap-${date}`)).toBeInTheDocument();
    expect(screen.queryByTestId("sip-cap-2026-11-05")).not.toBeInTheDocument();
    const busy = screen.getByTestId("sip-cap-2026-10-27");
    expect(busy).toHaveAttribute("data-count", "2");
    expect(busy).toHaveTextContent("27");
    expect(busy).toHaveTextContent("Oct");
    expect(busy).toHaveTextContent("₹42,234");
    expect(screen.getByTestId("sip-cap-2026-10-24")).toHaveAttribute("aria-pressed", "true");
  });
  it("shows the first date's SIPs at first, titled with that date", () => {
    mount();
    const detail = screen.getByTestId("sip-detail");
    expect(within(detail).getByRole("heading", { name: "SIPs on 24 Oct" })).toBeInTheDocument();
    expect(detail).toHaveTextContent("Kotak Multi Cap Fund");
    expect(detail).toHaveTextContent("Siddharth · 24 Oct 2026");
    expect(detail).toHaveTextContent("₹3,336");
    expect(detail).not.toHaveTextContent("JM Flexi Cap Fund");
  });
  it("a click on a capsule swaps the detail to that date and the capsule keeps the selected state", () => {
    mount();
    fireEvent.click(screen.getByTestId("sip-cap-2026-10-26"));
    expect(screen.getByTestId("sip-cap-2026-10-26")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("sip-cap-2026-10-24")).toHaveAttribute("aria-pressed", "false");
    const detail = screen.getByTestId("sip-detail");
    expect(within(detail).getByRole("heading", { name: "SIPs on 26 Oct" })).toBeInTheDocument();
    expect(detail).toHaveTextContent("JM Flexi Cap Fund");
    expect(detail).toHaveTextContent("Aarohi · 26 Oct 2026");
    expect(detail).not.toHaveTextContent("Kotak Multi Cap Fund");
  });
  it("counts a twin SIP twice in its date's amount", () => {
    mount();
    fireEvent.click(screen.getByTestId("sip-cap-2026-10-27"));
    const detail = screen.getByTestId("sip-detail");
    expect(detail).toHaveTextContent("HDFC Mid-Cap Opportunities Fund");
    expect(detail).toHaveTextContent("₹25,990");
    expect(detail).toHaveTextContent("Parag Parikh Flexi Cap Fund");
  });
  it("Stopped is a full tab listing the stopped SIPs with a badge", () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Stopped (1)" }));
    expect(screen.getByRole("tab", { name: "Stopped (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("sip-cap-2026-10-24")).not.toBeInTheDocument();
    const row = screen.getByTestId("sip-stopped-S-SBI");
    expect(row).toHaveTextContent("SBI Bluechip Fund");
    expect(row).toHaveTextContent("Parents");
    expect(row).toHaveTextContent("₹4,873");
    expect(row).toHaveTextContent("Stopped");
  });
  it("This Month loads the month of the current date and steps backwards and forwards", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "This Month" }));
    expect(await screen.findByText("October 2026")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("sip-month-S-KOTAK")).toHaveTextContent("₹3,336"));
    expect(mocks.getSipsMonthly.mock.calls[0].slice(0, 3)).toEqual([{ viewMode: "aggregate", memberId: null }, 2026, 10]);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByText("November 2026")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getSipsMonthly.mock.calls.at(-1)!.slice(1, 3)).toEqual([2026, 11]));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByText("September 2026")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getSipsMonthly.mock.calls.at(-1)!.slice(1, 3)).toEqual([2026, 9]));
  });
  it("rolls the year over when stepping past December and before January", async () => {
    vi.setSystemTime(new Date("2026-12-10T10:00:00Z"));
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "This Month" }));
    await screen.findByText("December 2026");
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByText("January 2027")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getSipsMonthly.mock.calls.at(-1)!.slice(1, 3)).toEqual([2027, 1]));
  });
  it("derives the current month in Asia/Kolkata, not the browser time zone", async () => {
    const original = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      // 07:30 on 1 Nov in India, still 31 Oct evening in Los Angeles.
      vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
      mount();
      fireEvent.click(screen.getByRole("tab", { name: "This Month" }));
      expect(await screen.findByText("November 2026")).toBeInTheDocument();
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });
  it("shows its own error with Retry when the month fails to load", async () => {
    mocks.getSipsMonthly.mockRejectedValueOnce(new Error("x")).mockResolvedValue(fx.sipsMonthly().sips);
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "This Month" }));
    expect(await screen.findByText("Couldn't load this month")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("sip-month-S-KOTAK")).toBeInTheDocument());
  });
  it("says so when there are no active SIPs and shows no next chip", () => {
    mount(loaded(fx.sips().sips.filter(row => row.status === "stopped")));
    expect(screen.getByText("No active SIPs.")).toBeInTheDocument();
    expect(screen.queryByTestId("sip-next")).not.toBeInTheDocument();
    expect(screen.getByTestId("sip-total")).toHaveTextContent("Monthly SIP total ₹0");
  });
  it("shows a loading state and a failure card with Retry", () => {
    const { unmount } = mount(loadingLoad());
    expect(screen.getByRole("status", { name: "Loading SIPs" })).toBeInTheDocument();
    unmount();
    const sips = failedLoad<SipRow[]>();
    mount(sips);
    expect(screen.getByRole("heading", { name: "Couldn't load your SIPs" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(sips.retry).toHaveBeenCalledTimes(1);
  });
  it("asks the month route for the selected member in a member view", async () => {
    mount(loaded(fx.sips().sips), { scope: { members, viewMode: "member", memberId: "b" } });
    fireEvent.click(screen.getByRole("tab", { name: "This Month" }));
    await waitFor(() => expect(mocks.getSipsMonthly).toHaveBeenCalled());
    expect(mocks.getSipsMonthly.mock.calls[0][0]).toEqual({ viewMode: "member", memberId: "b" });
  });
  it("marks every control with its effect (interactivity rule)", () => {
    const { container } = mount();
    expectInteractivity(container, 5);
  });
});

describe("SipTimeline: fund names open the fund page (IF-E)", () => {
  const page = (id: string) => `/portfolio/mutual-funds/funds/${id}`;
  it("links the fund in the Next SIP chip, without changing the chip's words", () => {
    mount();
    expect(screen.getByTestId("sip-next")).toHaveTextContent("Next: Kotak Multi Cap Fund · 24 Oct · ₹3,336");
    expect(within(screen.getByTestId("sip-next")).getByRole("link", { name: "Kotak Multi Cap Fund" })).toHaveAttribute("href", page("S-KOTAK"));
  });
  it("links each fund of the selected date's SIPs, and follows the date", () => {
    mount();
    expect(within(screen.getByTestId("sip-detail")).getByRole("link", { name: "Kotak Multi Cap Fund" })).toHaveAttribute("href", page("S-KOTAK"));
    fireEvent.click(screen.getByTestId("sip-cap-2026-10-27"));
    const links = within(screen.getByTestId("sip-detail")).getAllByRole("link");
    expect(links.map(link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["HDFC Mid-Cap Opportunities Fund", page("S-HDFC")],
      ["Parag Parikh Flexi Cap Fund", page("S-PPFAS")],
    ]);
  });
  it("links the stopped SIPs too", () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Stopped (1)" }));
    expect(within(screen.getByTestId("sip-stopped-S-SBI")).getByRole("link", { name: "SBI Bluechip Fund" })).toHaveAttribute("href", page("S-SBI"));
  });
  it("links the funds of the month list once it has loaded", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "This Month" }));
    const row = await screen.findByTestId("sip-month-S-KOTAK");
    expect(within(row).getByRole("link", { name: "Kotak Multi Cap Fund" })).toHaveAttribute("href", page("S-KOTAK"));
  });
  it("leaves the tabs and the month buttons as buttons, and shows an id-less SIP as plain text", () => {
    const rows = fx.sips().sips.map((sip, index) => (index === 0 ? { ...sip, scheme_id: "" } : sip));
    mount(loaded(rows));
    expect(within(screen.getByTestId("sip-next")).queryByRole("link")).toBeNull();
    expect(screen.getByTestId("sip-next")).toHaveTextContent("Next: Kotak Multi Cap Fund · 24 Oct · ₹3,336");
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });
});
