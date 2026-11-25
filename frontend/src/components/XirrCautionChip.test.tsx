import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CAUTION_CHIP, type XirrCaution } from "@/lib/xirrDisplay";
import { XirrCautionChip } from "./XirrCautionChip";

describe("shared XIRR caution variants", () => {
  it.each(["young", "single_transaction"] as const)("note_variant_shows_a_dot_and_the_same_words: %s", caution => {
    const props = { caution, variant: "note" as const };
    render(<XirrCautionChip {...props} />);
    const chip = screen.getByTestId("xirr-caution");
    expect(chip).toHaveAttribute("data-variant", "note");
    expect(chip.textContent).toBe(CAUTION_CHIP[caution].text);
    expect(chip).toHaveAttribute("title", CAUTION_CHIP[caution].tip);
    expect(chip).toHaveAttribute("aria-label", CAUTION_CHIP[caution].tip);
    expect(chip).toHaveAttribute("role", "note");
    expect(within(chip).getByTestId("caution-dot")).toHaveAttribute("aria-hidden", "true");
  });

  it.each(["young", "single_transaction"] as const)("pill_variant_is_unchanged_in_words_and_tooltip: %s", caution => {
    const props: { caution: XirrCaution; variant?: "pill" } = { caution };
    const { rerender } = render(<XirrCautionChip {...props} />);
    const check = () => {
      const chip = screen.getByTestId("xirr-caution");
      expect(chip).toHaveAttribute("data-variant", "pill");
      expect(chip.textContent).toBe(CAUTION_CHIP[caution].text);
      expect(chip).toHaveAttribute("title", CAUTION_CHIP[caution].tip);
      expect(chip).toHaveAttribute("aria-label", CAUTION_CHIP[caution].tip);
      expect(chip).toHaveAttribute("role", "note");
    };
    check();
    props.variant = "pill";
    rerender(<XirrCautionChip {...props} />);
    check();
  });
});
