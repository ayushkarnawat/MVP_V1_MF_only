import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AllSet } from "./AllSet";

afterEach(() => vi.useRealTimers());

describe("AllSet, sign-up screen 6 (task 6.14)", () => {
  it("has the Done bar with every segment full and the tick sketch", () => {
    render(<AllSet onFinish={vi.fn()} onViewDetails={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Done" })).toBeInTheDocument();
    expect(screen.getAllByTestId("step-segment").every((segment) => segment.getAttribute("data-filled") === "true")).toBe(true);
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/wallet.svg");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
  it("has the left headline, paragraph and the three status rows", () => {
    render(<AllSet onFinish={vi.fn()} onViewDetails={vi.fn()} />);
    const left = screen.getByTestId("auth-left-text");
    expect(within(left).getByRole("heading", { level: 2, name: "You're all set!" })).toBeInTheDocument();
    expect(within(left).getByText("We're importing your investment data and getting your dashboard ready. This may take a few minutes.")).toBeInTheDocument();
    expect(within(left).getAllByTestId("status-row").map((row) => row.getAttribute("data-state"))).toEqual(["done", "done", "active"]);
    expect(within(left).getByText("Your account connections have been initiated.")).toBeInTheDocument();
    expect(within(left).getByText("We're retrieving your holdings from the connected accounts.")).toBeInTheDocument();
    expect(within(left).getByText("Your investments will come together in one view as your data becomes available.")).toBeInTheDocument();
  });
  it("lists only the real row, Mutual Funds imported via a CAS statement", () => {
    render(<AllSet onFinish={vi.fn()} onViewDetails={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Getting your accounts ready" })).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Accounts being imported" });
    expect(within(section).getAllByRole("listitem")).toHaveLength(1);
    expect(within(section).getByText("Mutual Funds")).toBeInTheDocument();
    expect(within(section).getByText("Imported via CAS statement")).toBeInTheDocument();
    expect(screen.queryByText(/stocks|real estate/i)).toBeNull();
    expect(screen.getByText("While we fetch your data...")).toBeInTheDocument();
  });
  it("Go to my dashboard asks to finish once, even when clicked twice", async () => {
    let finish: () => void = () => {};
    const onFinish = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<AllSet onFinish={onFinish} onViewDetails={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Opening..." })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Opening..." }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith("home");
    await act(async () => finish());
  });
  it("View details opens the import details and does not finish", () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    const onViewDetails = vi.fn();
    render(<AllSet onFinish={onFinish} onViewDetails={onViewDetails} />);
    fireEvent.click(screen.getByRole("button", { name: "View details ›" }));
    expect(onViewDetails).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });
  it("View details is not blocked while a finish is running, and Go to my dashboard asks for home only", async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    render(<AllSet onFinish={onFinish} onViewDetails={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith("home"));
  });
  it("a failed finish shows the message and the button works again", async () => {
    const onFinish = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    render(<AllSet onFinish={onFinish} onViewDetails={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your statement is saved, but we couldn't finish setting up your account. Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
  it("never redirects by itself", () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<AllSet onFinish={onFinish} onViewDetails={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
    expect(onFinish).not.toHaveBeenCalled();
  });
  it("renders the tick sketch in the right panel and the arrow on Go to my dashboard", () => {
    render(<AllSet onFinish={vi.fn()} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId("right-sketch-tick")).toHaveAttribute("src", "/illustrations/auth/tick.svg");
    expect(screen.getByTestId("auth-btn-arrow")).toBeInTheDocument();
  });
});

// Batch B item 6 (B-10): the spinner on the third row turns for 2.5 seconds, becomes a tick that pops, and the texts change.
// Design: Docs/orchestration/2026-11-12-batch-b-planning-workbook.html, section 4 ("0 s", "2.5 s: the tick pops", "About 3 s: settled").
// The tests above describe the first moment (0 s) and still hold; these are red until B-10 builds the timer.
describe("AllSet: the spinner turns into a tick after 2.5 seconds (Batch B, item 6)", () => {
  const READY_TITLE = "Your dashboard is ready";
  const READY_LINE = "Go to my dashboard to start your journey.";
  const READY_PARAGRAPH = "Your investment data is in and your dashboard is ready.";
  const OLD_TITLE = "Preparing your dashboard";
  const OLD_LINE = "Your investments will come together in one view as your data becomes available.";
  const OLD_PARAGRAPH = "We're importing your investment data and getting your dashboard ready. This may take a few minutes.";
  const mount = (onFinish = vi.fn()) => {
    vi.useFakeTimers();
    return { onFinish, ...render(<AllSet onFinish={onFinish} onViewDetails={vi.fn()} />) };
  };
  const left = () => screen.getByTestId("auth-left-text");
  const states = () => within(left()).getAllByTestId("status-row").map((row) => row.getAttribute("data-state"));
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  const setReducedMotion = (reduce: boolean) => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: reduce && query.includes("prefers-reduced-motion"), media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
      }),
    });
  };
  afterEach(() => { Reflect.deleteProperty(window, "matchMedia"); });

  it("at 0 s the third row is spinning and every text is today's", () => {
    mount();
    expect(states()).toEqual(["done", "done", "active"]);
    expect(within(left()).getByText(OLD_TITLE)).toBeInTheDocument();
    expect(within(left()).getByText(OLD_LINE)).toBeInTheDocument();
    expect(within(left()).getByText(OLD_PARAGRAPH)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Getting your accounts ready" })).toBeInTheDocument();
  });
  it("just before 2.5 s nothing has changed; at 2.5 s the third row is done", () => {
    mount();
    tick(2499);
    expect(states()).toEqual(["done", "done", "active"]);
    tick(1);
    expect(states()).toEqual(["done", "done", "done"]);
  });
  it("at 2.5 s the third row says the work is done; the paragraph and the right heading still have their old words", () => {
    mount();
    tick(2500);
    expect(within(left()).getByText(READY_TITLE)).toBeInTheDocument();
    expect(within(left()).getByText(READY_LINE)).toBeInTheDocument();
    expect(within(left()).getByText(OLD_PARAGRAPH)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Getting your accounts ready" })).toBeInTheDocument();
  });
  it("at about 3 s, after the tick, the left paragraph and the right heading change to match", () => {
    mount();
    tick(2999);
    expect(within(left()).getByText(OLD_PARAGRAPH)).toBeInTheDocument();
    tick(1);
    expect(within(left()).getByText(READY_PARAGRAPH)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Your accounts are ready" })).toBeInTheDocument();
  });
  it("once settled none of the old texts is left", () => {
    mount();
    tick(3000);
    expect(screen.queryByText(OLD_TITLE)).toBeNull();
    expect(screen.queryByText(OLD_LINE)).toBeNull();
    expect(screen.queryByText(OLD_PARAGRAPH)).toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "Getting your accounts ready" })).toBeNull();
  });
  it("the other texts on the screen are not touched (the grey card and the accounts card stay as they are)", () => {
    mount();
    tick(2500);
    expect(screen.getByText("While we fetch your data...")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Accounts being imported" })).toBeInTheDocument();
    expect(within(left()).getByRole("heading", { level: 2, name: "You're all set!" })).toBeInTheDocument();
    expect(within(left()).getByText("Your account connections have been initiated.")).toBeInTheDocument();
  });
  it("the row that just turned done pops; the two rows that were done from the start do not", () => {
    mount();
    tick(2500);
    const circles = within(left()).getAllByTestId("status-row").map((row) => row.querySelector(".auth-tick-pop"));
    expect(circles[0]).toBeNull();
    expect(circles[1]).toBeNull();
    expect(circles[2]).not.toBeNull();
  });
  it("with reduced motion on there is no pop", () => {
    setReducedMotion(true);
    mount();
    tick(2500);
    expect(states()).toEqual(["done", "done", "done"]);
    expect(left().querySelector(".auth-tick-pop")).toBeNull();
  });
  it("a screen reader hears one polite announcement when it settles, and nothing before", () => {
    mount();
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("");
    tick(2500);
    expect(screen.getByRole("status")).toHaveTextContent(READY_TITLE);
  });
  it("never redirects by itself, before or after the tick", () => {
    const { onFinish } = mount();
    tick(2500);
    tick(10 * 60 * 1000);
    expect(onFinish).not.toHaveBeenCalled();
  });
  it("Go to my dashboard is never held back: it works before the tick and after it", async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    mount(onFinish);
    expect(screen.getByRole("button", { name: "Go to my dashboard" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    await act(async () => { await Promise.resolve(); });
    expect(onFinish).toHaveBeenCalledTimes(1);
    tick(2500);
    expect(screen.getByRole("button", { name: "Go to my dashboard" })).toBeEnabled();
  });
  it("the timers run once and never flip back", () => {
    mount();
    tick(2500);
    tick(30 * 1000);
    expect(states()).toEqual(["done", "done", "done"]);
    expect(within(left()).getByText(READY_TITLE)).toBeInTheDocument();
  });
  it("starts a 2500 ms and a 3000 ms timer and clears both when the screen closes", () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(globalThis, "setTimeout");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const view = render(<AllSet onFinish={vi.fn()} onViewDetails={vi.fn()} />);
    const index = setSpy.mock.calls.findIndex(([, delay]) => delay === 2500);
    expect(index, "no 2500 ms timer was started").toBeGreaterThan(-1);
    expect(setSpy.mock.calls.filter(([, delay]) => delay === 2500)).toHaveLength(1);
    const settleIndex = setSpy.mock.calls.findIndex(([, delay]) => delay === 3000);
    expect(settleIndex, "no 3000 ms timer was started").toBeGreaterThan(-1);
    const id = setSpy.mock.results[index].value;
    const settleId = setSpy.mock.results[settleIndex].value;
    view.unmount();
    expect(clearSpy).toHaveBeenCalledWith(id);
    expect(clearSpy).toHaveBeenCalledWith(settleId);
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
});


describe("AllSet: spacing while the retry message is showing (Codex review of B, finding 6)", () => {
  it("is dense only after a failed finish", async () => {
    const onFinish = vi.fn().mockRejectedValue(new Error("offline"));
    render(<AllSet onFinish={onFinish} onViewDetails={vi.fn()} />);
    expect(screen.getByTestId("auth-card")).not.toHaveAttribute("data-dense");
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByTestId("auth-card")).toHaveAttribute("data-dense", "true");
  });
});
