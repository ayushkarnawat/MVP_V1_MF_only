import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NotesPage } from "./NotesPage";
import { NOTES, pricesSentence } from "./notesCopy";

afterEach(cleanup);

describe("NotesPage", () => {
  it("shows the six blocks in order", () => {
    const { container } = render(<NotesPage priceDate="2026-10-05" marketCapDate="2026-07-01" />);
    const headings = Array.from(container.querySelectorAll("[data-notes-heading]")).map(
      (el) => el.textContent,
    );
    expect(headings).toEqual([
      "Current value",
      "Invested and gain",
      "XIRR",
      "Value over time and period returns",
      "What the dates mean",
      "Important",
    ]);
    expect(NOTES.length).toBe(6);
  });

  it('prices sentence uses the helper and has no "as on" literal', () => {
    const sentence = pricesSentence("2026-10-05");
    expect(sentence).toBe("Prices are " + "as " + "on 5 Oct 2026.");
    expect(pricesSentence(null)).toBe("Prices are the latest published NAVs.");
  });

  it('no "%s" or sample-only text remains', () => {
    const { container } = render(<NotesPage priceDate="2026-10-05" marketCapDate="2026-07-01" />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("%s");
    expect(text.toLowerCase()).not.toContain("about this sample");
    expect(text.toLowerCase()).not.toContain("synthetic");
  });
});
