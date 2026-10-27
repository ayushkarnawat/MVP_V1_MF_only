import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateRangeCalendar, type DateRange } from "./DateRangeCalendar";

const TODAY = "2026-10-23";
const EMPTY: DateRange = { from: null, to: null };

function dayButtons() {
  return screen.getAllByRole("button").filter(button => /^\d{1,2}$/.test(button.textContent ?? ""));
}

function day(label: string) {
  return screen.getByRole("button", { name: label });
}

describe("DateRangeCalendar: month grid", () => {
  it("opens on today's month when nothing is selected", () => {
    render(<DateRangeCalendar today={TODAY} value={EMPTY} onChange={() => {}} />);
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(dayButtons()).toHaveLength(31);
  });

  it("labels each day with its full date and shows Monday first", () => {
    render(<DateRangeCalendar today={TODAY} value={EMPTY} onChange={() => {}} />);
    expect(day("1 October 2026").textContent).toBe("1");
    expect(day("23 October 2026").textContent).toBe("23");
    const headers = screen.getAllByRole("columnheader").map(header => header.textContent);
    expect(headers).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  });

  it("starts on the month of the selected end date, or of the start date", () => {
    const { unmount } = render(<DateRangeCalendar today={TODAY} value={{ from: "2026-08-03", to: "2026-09-10" }} onChange={() => {}} />);
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(dayButtons()).toHaveLength(30);
    unmount();
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-08-03", to: null }} onChange={() => {}} />);
    expect(screen.getByText("August 2026")).toBeInTheDocument();
    expect(dayButtons()).toHaveLength(31);
  });

  it("shows 29 days for February in a leap year", () => {
    render(<DateRangeCalendar today="2028-03-10" value={{ from: "2028-02-05", to: null }} onChange={() => {}} />);
    expect(screen.getByText("February 2028")).toBeInTheDocument();
    expect(dayButtons()).toHaveLength(29);
  });

  it("moves between months with the previous and next buttons", () => {
    render(<DateRangeCalendar today={TODAY} value={EMPTY} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(dayButtons()).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });

  it("crosses a year boundary", () => {
    render(<DateRangeCalendar today="2026-02-10" value={EMPTY} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("December 2025")).toBeInTheDocument();
  });
});

describe("DateRangeCalendar: limits", () => {
  it("disables days after today and cannot go to a later month", () => {
    render(<DateRangeCalendar today={TODAY} value={EMPTY} onChange={() => {}} />);
    expect(day("23 October 2026")).toBeEnabled();
    expect(day("24 October 2026")).toBeDisabled();
    expect(day("31 October 2026")).toBeDisabled();
    expect(day("1 October 2026")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("disables days before the ten-year limit and cannot go to an earlier month", () => {
    render(<DateRangeCalendar today={TODAY} value={{ from: "2016-10-25", to: null }} onChange={() => {}} />);
    expect(screen.getByText("October 2016")).toBeInTheDocument();
    expect(day("22 October 2016")).toBeDisabled();
    expect(day("23 October 2016")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
  });

  it("does not call onChange when a disabled day is clicked", () => {
    const onChange = vi.fn();
    render(<DateRangeCalendar today={TODAY} value={EMPTY} onChange={onChange} />);
    fireEvent.click(day("24 October 2026"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("takes the number of years", () => {
    render(<DateRangeCalendar today={TODAY} maxYears={1} value={{ from: "2025-10-25", to: null }} onChange={() => {}} />);
    expect(day("22 October 2025")).toBeDisabled();
    expect(day("23 October 2025")).toBeEnabled();
  });
});

describe("DateRangeCalendar: choosing a range", () => {
  it("the first click sets the start and clears the end", () => {
    const onChange = vi.fn();
    render(<DateRangeCalendar today={TODAY} value={EMPTY} onChange={onChange} />);
    fireEvent.click(day("5 October 2026"));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-05", to: null });
  });

  it("the second click on a later day sets the end", () => {
    const onChange = vi.fn();
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-10-05", to: null }} onChange={onChange} />);
    fireEvent.click(day("12 October 2026"));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-05", to: "2026-10-12" });
  });

  it("the second click on the same day gives a one-day range", () => {
    const onChange = vi.fn();
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-10-05", to: null }} onChange={onChange} />);
    fireEvent.click(day("5 October 2026"));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-05", to: "2026-10-05" });
  });

  it("a second click on an earlier day starts over from that day", () => {
    const onChange = vi.fn();
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-10-05", to: null }} onChange={onChange} />);
    fireEvent.click(day("2 October 2026"));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-02", to: null });
  });

  it("a click after a complete range starts a new range", () => {
    const onChange = vi.fn();
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-10-05", to: "2026-10-09" }} onChange={onChange} />);
    fireEvent.click(day("15 October 2026"));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-10-15", to: null });
  });

  it("lets the range span two months", () => {
    const onChange = vi.fn();
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-09-20", to: null }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(day("3 October 2026"));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-09-20", to: "2026-10-03" });
  });
});

describe("DateRangeCalendar: marking the range", () => {
  it("marks the start, the middle and the end", () => {
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-10-05", to: "2026-10-09" }} onChange={() => {}} />);
    expect(day("5 October 2026").getAttribute("data-range")).toBe("start");
    expect(day("6 October 2026").getAttribute("data-range")).toBe("middle");
    expect(day("8 October 2026").getAttribute("data-range")).toBe("middle");
    expect(day("9 October 2026").getAttribute("data-range")).toBe("end");
    expect(day("4 October 2026").hasAttribute("data-range")).toBe(false);
    expect(day("10 October 2026").hasAttribute("data-range")).toBe(false);
  });

  it("marks a one-day range as single", () => {
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-10-05", to: "2026-10-05" }} onChange={() => {}} />);
    expect(day("5 October 2026").getAttribute("data-range")).toBe("single");
  });

  it("marks only the start while the end is not chosen", () => {
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-10-05", to: null }} onChange={() => {}} />);
    expect(day("5 October 2026").getAttribute("data-range")).toBe("start");
    expect(day("6 October 2026").hasAttribute("data-range")).toBe(false);
  });

  it("marks the part of a range that falls inside the visible month", () => {
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-09-25", to: "2026-10-03" }} onChange={() => {}} />);
    expect(day("1 October 2026").getAttribute("data-range")).toBe("middle");
    expect(day("3 October 2026").getAttribute("data-range")).toBe("end");
    expect(day("4 October 2026").hasAttribute("data-range")).toBe(false);
  });

  it("marks selected days as pressed for assistive technology", () => {
    render(<DateRangeCalendar today={TODAY} value={{ from: "2026-10-05", to: "2026-10-07" }} onChange={() => {}} />);
    expect(day("5 October 2026").getAttribute("aria-pressed")).toBe("true");
    expect(day("6 October 2026").getAttribute("aria-pressed")).toBe("true");
    expect(day("8 October 2026").getAttribute("aria-pressed")).toBe("false");
  });
});
