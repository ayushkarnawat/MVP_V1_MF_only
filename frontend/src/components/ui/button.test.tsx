import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("primary_button_is_brand_green_with_white_text", () => {
    const { unmount } = render(<Button>Save changes</Button>);
    const defaultBtn = screen.getByRole("button", { name: "Save changes" });
    expect(defaultBtn.className).toContain("bg-[var(--pos)]");
    expect(defaultBtn.className).toContain("text-white");
    expect(defaultBtn.className).not.toContain("bg-[var(--color-accent)]");
    expect(defaultBtn.className).not.toContain("text-black");
    unmount();

    render(<Button variant="primary">Confirm</Button>);
    const primaryBtn = screen.getByRole("button", { name: "Confirm" });
    expect(primaryBtn.className).toContain("bg-[var(--pos)]");
    expect(primaryBtn.className).toContain("text-white");
    expect(primaryBtn.className).not.toContain("bg-[var(--color-accent)]");
    expect(primaryBtn.className).not.toContain("text-black");
  });
});
