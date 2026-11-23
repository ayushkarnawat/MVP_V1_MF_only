import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoMark } from "../common/SectionCard";
import { DateStrip } from "./DateStrip";
import { stripEntriesForTab } from "./stripEntries";

describe("DateStrip info reads one line per data kind", () => {
  it("the popover lists each explanation as its own paragraph, in strip order", async () => {
    const entries = stripEntriesForTab("analytics", { pricesIso: "2026-11-12", holdingsIso: "2026-09-30", ratiosIso: "2026-11-12", feesIso: "2026-09-30" });
    render(<DateStrip entries={entries} olderMarkers={[]} />);
    fireEvent.click(screen.getByTestId("date-strip-info"));
    const dialog = await screen.findByRole("dialog");
    const paragraphs = within(dialog).getAllByText(/.+/, { selector: "p" });
    expect(paragraphs.map(p => p.textContent)).toEqual(entries.map(entry => entry.explain));
  });

  it("the info mark keeps the joined text as its name and tooltip attribute (existing contract)", () => {
    const entries = stripEntriesForTab("allocation", { pricesIso: "2026-11-12", holdingsIso: "2026-09-30", marketCapListIso: "2026-07-01" });
    render(<DateStrip entries={entries} olderMarkers={[]} />);
    const info = screen.getByTestId("date-strip-info");
    expect(info).toHaveAttribute("data-tooltip", entries.map(entry => entry.explain).join(" "));
  });
});

describe("InfoMark content", () => {
  it("shows richer content in the popover while its name and tooltip stay the plain text", async () => {
    render(<InfoMark text="Plain words." content={<><p>First line.</p><p>Second line.</p></>} testId="rich" />);
    const trigger = screen.getByTestId("rich");
    expect(trigger).toHaveAttribute("aria-label", "Plain words.");
    expect(trigger).toHaveAttribute("data-tooltip", "Plain words.");
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("First line.")).toBeInTheDocument();
    expect(within(dialog).getByText("Second line.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Plain words.")).not.toBeInTheDocument();
  });
});
