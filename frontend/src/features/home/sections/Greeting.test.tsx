import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { SummaryResponse } from "../types";
import { Greeting } from "./Greeting";

const family = () => fixture<SummaryResponse>("summary_family");

describe("Greeting: states", () => {
  it("shows a loading placeholder with an accessible name and no heading", () => {
    render(<Greeting status="loading" summary={null} onImport={() => {}} />);
    expect(screen.getByRole("status", { name: "Loading greeting" })).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("shows only a neutral heading when the summary could not be loaded", () => {
    render(<Greeting status="error" summary={null} onImport={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome back");
    expect(screen.queryByTestId("greeting-sentence")).toBeNull();
    expect(screen.queryByTestId("members-chip")).toBeNull();
  });

  it("treats data status without a summary like an error", () => {
    render(<Greeting status="data" summary={null} onImport={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome back");
  });

  it("asks for an import when there are no holdings, still greeting by name", () => {
    const onImport = vi.fn();
    render(<Greeting status="data" summary={fixture<SummaryResponse>("summary_empty")} onImport={onImport} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Good evening, Asha");
    expect(screen.getByText("Import a statement to see your portfolio.")).toBeInTheDocument();
    expect(screen.queryByTestId("greeting-sentence")).toBeNull();
    expect(screen.queryByTestId("members-chip")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import statement" }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0]).toBeUndefined();
  });
});

describe("Greeting: normal state", () => {
  it("greets by name with the server's greeting word", () => {
    render(<Greeting status="data" summary={family()} onImport={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Good evening, Asha");
  });

  it.each([["morning"], ["afternoon"], ["evening"]] as const)("uses the %s word", greeting => {
    render(<Greeting status="data" summary={{ ...family(), greeting }} onImport={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(`Good ${greeting}, Asha`);
  });

  it("greets without a comma when there is no name", () => {
    render(<Greeting status="data" summary={{ ...family(), display_name: "" }} onImport={() => {}} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Good evening");
  });

  it("shows a sun by day and a moon in the evening", () => {
    const day = render(<Greeting status="data" summary={{ ...family(), greeting: "afternoon" }} onImport={() => {}} />);
    expect(screen.getByTestId("greeting-icon").getAttribute("data-icon")).toBe("sun");
    day.unmount();
    render(<Greeting status="data" summary={family()} onImport={() => {}} />);
    expect(screen.getByTestId("greeting-icon").getAttribute("data-icon")).toBe("moon");
  });

  it("writes the status sentence from the summary", () => {
    render(<Greeting status="data" summary={family()} onImport={() => {}} />);
    expect(screen.getByTestId("greeting-sentence").textContent).toBe(
      "Your family portfolio is up ₹12 (0.23%) today. Asha Large Cap drove most of the gains.",
    );
  });

  it("shows the data line as a chip in a family with several members, and nothing in a member's view", () => {
    const { unmount } = render(<Greeting status="data" summary={family()} onImport={() => {}} />);
    expect(screen.getByTestId("members-chip").textContent).toContain("Data from 2 of 2 family members");
    unmount();
    render(<Greeting status="data" summary={fixture<SummaryResponse>("summary_member")} onImport={() => {}} />);
    expect(screen.queryByTestId("members-chip")).toBeNull();
  });
});

describe("Greeting: the members list behind the chip", () => {
  const withMissing = (): SummaryResponse => ({
    ...family(),
    data_line: "Data from 1 of 2 family members",
    members: [
      { id: "m-1", name: "ASHA RAO", has_data: true },
      { id: "m-2", name: "Dev Rao", has_data: false },
    ],
  });

  it("is closed at first and toggles open and closed with the chip", () => {
    render(<Greeting status="data" summary={withMissing()} onImport={() => {}} />);
    const chip = screen.getByTestId("members-chip");
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog", { name: "Family members" })).toBeNull();
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Family members" })).toBeInTheDocument();
    fireEvent.click(chip);
    expect(screen.queryByRole("dialog", { name: "Family members" })).toBeNull();
  });

  it("lists every member with whether their data is in", () => {
    render(<Greeting status="data" summary={withMissing()} onImport={() => {}} />);
    fireEvent.click(screen.getByTestId("members-chip"));
    const items = within(screen.getByRole("dialog", { name: "Family members" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("ASHA RAO");
    expect(items[0].textContent).toContain("Data imported");
    expect(items[1].textContent).toContain("Dev Rao");
    expect(items[1].textContent).toContain("No data yet");
  });

  it("offers an import only for a member without data, and passes that member's id", () => {
    const onImport = vi.fn();
    render(<Greeting status="data" summary={withMissing()} onImport={onImport} />);
    fireEvent.click(screen.getByTestId("members-chip"));
    const buttons = within(screen.getByRole("dialog", { name: "Family members" })).getAllByRole("button", { name: "Import statement" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onImport).toHaveBeenCalledWith("m-2");
  });

  it("closes with Escape", () => {
    render(<Greeting status="data" summary={withMissing()} onImport={() => {}} />);
    fireEvent.click(screen.getByTestId("members-chip"));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Family members" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Family members" })).toBeNull();
  });
});
