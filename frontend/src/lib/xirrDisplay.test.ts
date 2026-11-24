import { expect, it } from "vitest";
import { CAUTION_CHIP, resolveFigures, RETURNS_CAPTION, XIRR_CAPTION } from "./xirrDisplay";

it("resolveFigures_passes_both_numbers_and_the_caution", () => {
  expect(resolveFigures("0.418", "0.065", "young")).toEqual({ xirr: "0.418", returns: "0.065", caution: "young" });
  expect(resolveFigures(null, null, null)).toEqual({ xirr: null, returns: null, caution: null });
});
it("resolveFigures_turns_undefined_into_null", () => {
  expect(resolveFigures(undefined, undefined, undefined)).toEqual({ xirr: null, returns: null, caution: null });
});
it("resolveFigures_keeps_a_zero_return_as_the_string_0", () => {
  expect(resolveFigures("0", "0", null)).toEqual({ xirr: "0", returns: "0", caution: null });
});
it("caution_chip_text_and_tip_match_the_owner_wording", () => {
  expect(CAUTION_CHIP).toEqual({
    young: { text: "held under 1 yr", tip: "Held under 1 year: an annualised rate can look very large over a short period. Open Returns to see the plain gain." },
    single_transaction: { text: "one transaction", tip: "One purchase only, so this is the yearly rate of a single investment." },
  });
});
it("captions_match_the_owner_wording", () => {
  expect(XIRR_CAPTION).toBe("Annualised since your first investment");
  expect(RETURNS_CAPTION).toBe("Since purchase, not annualised");
});
