import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders button label and handles click events", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);

    const btn = screen.getByRole("button", { name: /submit/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("applies variant and size classes", () => {
    render(
      <Button variant="secondary" size="lg">
        Cancel
      </Button>
    );

    const btn = screen.getByRole("button", { name: /cancel/i });
    expect(btn.className).toContain("secondary");
    expect(btn.className).toContain("lg");
  });
});
