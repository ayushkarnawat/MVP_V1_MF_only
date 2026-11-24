import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Contents, type ContentsEntry } from "./Contents";

afterEach(cleanup);

const sampleEntries: ContentsEntry[] = [
  { tab: "Overview", title: "Summary", page: 4 },
  { tab: "Overview", title: "Value over time", page: 5 },
  { tab: "Performance", title: "Returns", page: 9 },
  { tab: "Notes", title: "Notes", page: null },
];

describe("Contents", () => {
  it("groups entries by tab in the order given, tab names in capitals", () => {
    const { container } = render(<Contents entries={sampleEntries} />);
    const groupLabels = Array.from(container.querySelectorAll("[data-contents-group-label]")).map(
      (el) => el.textContent,
    );
    expect(groupLabels).toEqual(["OVERVIEW", "PERFORMANCE", "NOTES"]);
  });

  it("each entry shows its title and its page number", () => {
    render(<Contents entries={sampleEntries} />);
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Value over time")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Returns")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("a null page shows no number", () => {
    const { container } = render(<Contents entries={[{ tab: "Notes", title: "Notes", page: null }]} />);
    const pageEl = container.querySelector("[data-contents-page]");
    expect(pageEl?.textContent?.trim() ?? "").toBe("");
  });

  it("a group label is marked break-after avoid", () => {
    const { container } = render(<Contents entries={sampleEntries} />);
    const labels = container.querySelectorAll("[data-contents-group-label]");
    expect(labels.length).toBe(3);
    for (const label of labels) {
      expect(label.className).toContain("print-contents-group-label");
    }
  });

  it("renders every entry it is given (no cap)", () => {
    const manyEntries: ContentsEntry[] = Array.from({ length: 45 }, (_, index) => ({
      tab: `Tab ${Math.floor(index / 10) + 1}`,
      title: `Section ${index + 1}`,
      page: index + 4,
    }));
    const { container } = render(<Contents entries={manyEntries} />);
    expect(container.querySelectorAll("[data-contents-entry]").length).toBe(45);
  });
});
