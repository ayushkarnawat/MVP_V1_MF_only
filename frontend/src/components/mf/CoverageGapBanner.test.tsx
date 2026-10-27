import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CoverageGapBanner } from "./CoverageGapBanner";

describe("CoverageGapBanner", () => {
  const gaps = [
    {
      folio_id: "fol-1",
      folio_number: "12345/67",
      scheme_id: "sch-1",
      scheme_name: "HDFC Top 100",
      deficit_units: "50.000",
      first_deficit_date: "2024-02-15",
    },
  ];

  it("renders nothing when there are no gaps", () => {
    const { container } = render(<CoverageGapBanner gaps={[]} onResolveGap={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders warning banner and triggers onResolveGap on click", () => {
    const onResolve = vi.fn();
    render(<CoverageGapBanner gaps={gaps} onResolveGap={onResolve} />);

    expect(screen.getByText(/coverage gap detected/i)).toBeInTheDocument();
    expect(screen.getByText(/1 folio/i)).toBeInTheDocument();

    const resolveBtn = screen.getByRole("button", { name: /resolve gap/i });
    fireEvent.click(resolveBtn);

    expect(onResolve).toHaveBeenCalledWith(gaps[0]);
  });
});
