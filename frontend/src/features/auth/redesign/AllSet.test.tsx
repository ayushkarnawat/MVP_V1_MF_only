import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AllSet } from "./AllSet";

afterEach(() => vi.useRealTimers());

describe("AllSet, sign-up screen 6 (task 6.14)", () => {
  it("has the Done bar with every segment full and the tick sketch", () => {
    render(<AllSet onFinish={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Done" })).toBeInTheDocument();
    expect(screen.getAllByTestId("step-segment").every((segment) => segment.getAttribute("data-filled") === "true")).toBe(true);
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/tick.webp");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
  it("has the left headline, paragraph and the three status rows", () => {
    render(<AllSet onFinish={vi.fn()} />);
    const left = screen.getByTestId("auth-left-text");
    expect(within(left).getByRole("heading", { level: 2, name: "You're all set!" })).toBeInTheDocument();
    expect(within(left).getByText("We're importing your investment data and getting your dashboard ready. This may take a few minutes.")).toBeInTheDocument();
    expect(within(left).getAllByTestId("status-row").map((row) => row.getAttribute("data-state"))).toEqual(["done", "done", "active"]);
    expect(within(left).getByText("Your account connections have been initiated.")).toBeInTheDocument();
    expect(within(left).getByText("We're retrieving your holdings from the connected accounts.")).toBeInTheDocument();
    expect(within(left).getByText("Your investments will come together in one view as your data becomes available.")).toBeInTheDocument();
  });
  it("lists only the real row, Mutual Funds imported via a CAS statement", () => {
    render(<AllSet onFinish={vi.fn()} />);
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
    render(<AllSet onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Opening..." })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Opening..." }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith("home");
    await act(async () => finish());
  });
  it("View details asks to finish and open Import History", async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    render(<AllSet onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: "View details ›" }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith("import-history"));
  });
  it("a failed finish shows the message and the button works again", async () => {
    const onFinish = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    render(<AllSet onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your statement is saved, but we couldn't finish setting up your account. Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Go to my dashboard" }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
  it("never redirects by itself", () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<AllSet onFinish={onFinish} />);
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
    expect(onFinish).not.toHaveBeenCalled();
  });
});
