import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { InfoGlyph } from "@/components/info/InfoGlyph";
import { INFO_GLYPH_CLASS } from "./infoGlyph";

it("InfoGlyph_renders_the_shared_class_and_the_accessible_name", () => {
  render(<InfoGlyph text="About this figure" testId="info-figure" />);
  const glyph = screen.getByRole("img", { name: "About this figure" });
  expect(glyph).toBe(screen.getByTestId("info-figure"));
  expect(glyph.tagName).toBe("SPAN");
  expect(glyph).toHaveAttribute("tabindex", "0");
  expect(glyph).toHaveAttribute("title", "About this figure");
  expect(glyph.className).toBe(INFO_GLYPH_CLASS);
  expect(glyph.textContent).toBe("i");
  glyph.focus();
  expect(glyph).toHaveFocus();
});
