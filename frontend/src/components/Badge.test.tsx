import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders the label text", () => {
    render(<Badge variant="positive">confirmed</Badge>);
    expect(screen.getByText("confirmed")).toBeInTheDocument();
  });

  it("applies the variant class", () => {
    render(<Badge variant="warning">stale</Badge>);
    expect(screen.getByText("stale").className).toContain("warning");
  });
});
