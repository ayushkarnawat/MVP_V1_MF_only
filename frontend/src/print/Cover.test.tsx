import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Cover, type CoverProps } from "./Cover";

afterEach(cleanup);

const baseFamilyProps: CoverProps = {
  holderName: "Rohan Mehta",
  scope: { kind: "family" },
  memberCount: 3,
  fundCount: 6,
  folioCount: 5,
  generatedOn: "17 Nov 2026",
  scopeLabel: "Family Combined, full report",
  dataDates: [
    { label: "Prices", value: "5 Oct 2026" },
    { label: "Holdings", value: "September 2026" },
  ],
};

describe("Cover", () => {
  it("shows the title, the eyebrow with the generated date in capitals, and the scope label", () => {
    render(<Cover {...baseFamilyProps} />);
    expect(screen.getByText(/Mutual Fund/)).toBeInTheDocument();
    expect(screen.getByText(/Portfolio Report/)).toBeInTheDocument();
    expect(screen.getByText("CONFIDENTIAL · PREPARED ON 17 NOV 2026")).toBeInTheDocument();
    expect(screen.getByText("Family Combined, full report")).toBeInTheDocument();
  });

  it('family report shows "<name> and family"', () => {
    render(<Cover {...baseFamilyProps} />);
    expect(screen.getByText("Rohan Mehta and family")).toBeInTheDocument();
    expect(screen.getByText("Family combined · 3 members · 6 funds · 5 folios")).toBeInTheDocument();
  });

  it('family report with no name shows "Your family"', () => {
    render(<Cover {...baseFamilyProps} holderName={null} />);
    expect(screen.getByText("Your family")).toBeInTheDocument();
  });

  it('member report shows the member\'s name and "Member report"', () => {
    render(
      <Cover
        {...baseFamilyProps}
        scope={{ kind: "member", memberName: "Ananya Mehta" }}
        memberCount={1}
        fundCount={4}
        folioCount={3}
        scopeLabel="Ananya Mehta, full report"
      />,
    );
    expect(screen.getByText("Ananya Mehta")).toBeInTheDocument();
    expect(screen.getByText("Member report · 4 funds · 3 folios")).toBeInTheDocument();
  });

  it("sub line uses singular forms for 1", () => {
    render(<Cover {...baseFamilyProps} memberCount={1} fundCount={1} folioCount={1} />);
    expect(screen.getByText("Family combined · 1 member · 1 fund · 1 folio")).toBeInTheDocument();

    cleanup();
    render(
      <Cover
        {...baseFamilyProps}
        scope={{ kind: "member", memberName: "Ananya Mehta" }}
        memberCount={1}
        fundCount={1}
        folioCount={1}
      />,
    );
    expect(screen.getByText("Member report · 1 fund · 1 folio")).toBeInTheDocument();
  });

  it("shows each data date label and value", () => {
    render(<Cover {...baseFamilyProps} />);
    expect(screen.getByText("Prices")).toBeInTheDocument();
    expect(screen.getByText("5 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("Holdings")).toBeInTheDocument();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
  });

  it("no PAN, folio, email or phone text is produced from the props it takes", () => {
    const { container } = render(<Cover {...baseFamilyProps} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/\b\d{10}\b/);
    const allowedTokens = [
      "CONFIDENTIAL · PREPARED ON 17 NOV 2026",
      "Mutual Fund",
      "Portfolio Report",
      "PREPARED FOR",
      "Rohan Mehta and family",
      "Family combined · 3 members · 6 funds · 5 folios",
      "Scope",
      "Family Combined, full report",
      "Prices",
      "5 Oct 2026",
      "Holdings",
      "September 2026",
      "This report is generated from the statements imported into Unifolio and is meant for your own use. It contains no PAN. Figures are indicators of past performance and are not a recommendation to buy, sell or hold any fund.",
    ];
    expect(text.replace(/\s+/g, "")).toBe(allowedTokens.join("").replace(/\s+/g, ""));
  });

  it('carries no sample-only wording ("Sample", "synthetic")', () => {
    const { container } = render(<Cover {...baseFamilyProps} />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toContain("sample");
    expect(text).not.toContain("synthetic");
  });
});
