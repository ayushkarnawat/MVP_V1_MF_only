import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HandDrawnUnderline } from "./HandDrawnUnderline";

describe("HandDrawnUnderline component", () => {
  it("renders text content with double hand-drawn underline SVG strokes", () => {
    render(<HandDrawnUnderline>Log in</HandDrawnUnderline>);
    expect(screen.getByText("Log in")).toBeInTheDocument();
    
    // SVG stroke paths for double scratch underline
    const paths = document.querySelectorAll("path");
    expect(paths.length).toBe(2);
    expect(paths[0]).toHaveAttribute("stroke-width", "1.8");
    expect(paths[1]).toHaveAttribute("stroke-width", "1.4");
  });
});
