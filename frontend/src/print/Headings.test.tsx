import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SectionHeading } from "./SectionHeading";
import { TabHeading } from "./TabHeading";

afterEach(cleanup);

describe("TabHeading", () => {
  it("tab heading has the eyebrow TAB and the tab name and breaks before the page", () => {
    const { container } = render(<TabHeading tab="Overview" />);
    expect(screen.getByText("TAB")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("print-tab-heading");
  });
});

describe("SectionHeading", () => {
  it("section heading shows the subtitle only when given", () => {
    const { container } = render(
      <SectionHeading title="Summary" subtitle="Family Combined · 3 members · 6 funds" />,
    );
    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByText("Family Combined · 3 members · 6 funds")).toBeInTheDocument();
    expect(container.querySelector("[data-section-subtitle]")).toBeInTheDocument();

    cleanup();
    const withoutSubtitle = render(<SectionHeading title="Summary" />);
    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(withoutSubtitle.container.querySelector("[data-section-subtitle]")).not.toBeInTheDocument();
  });
});
