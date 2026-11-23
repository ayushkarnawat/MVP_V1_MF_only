import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderInShell } from "../../../shell/testing";
import { MutualFundsFrame } from "./MutualFundsFrame";

// A search result that goes to a section (a "go to section" row) arrives as router state { searchIntent: { section } }.
// The frame is shared by all seven tabs, so it is where the jump is carried out: scroll to the section and outline it.
let scrollSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined); });
afterEach(() => { cleanup(); scrollSpy.mockRestore(); });

function Page() {
  return <main>
    <MutualFundsFrame tab="performance">
      <section id="performance-returns"><h3>Returns</h3></section>
      <section id="performance-portfolio-history"><h3>Portfolio History</h3></section>
    </MutualFundsFrame>
  </main>;
}

it("a search jump to a section scrolls to it and outlines it", async () => {
  renderInShell(<Page />, { path: "/portfolio/mutual-funds/performance", state: { searchIntent: { section: "performance-portfolio-history" } } });
  await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
  expect(scrollSpy.mock.contexts[0]).toBe(document.getElementById("performance-portfolio-history"));
  expect(document.getElementById("performance-portfolio-history")).toHaveAttribute("data-search-highlight", "true");
  expect(document.getElementById("performance-returns")).not.toHaveAttribute("data-search-highlight");
});

it("without a search jump nothing scrolls and nothing is outlined", () => {
  renderInShell(<Page />, { path: "/portfolio/mutual-funds/performance" });
  expect(screen.getByRole("heading", { name: "Returns" })).toBeInTheDocument();
  expect(scrollSpy).not.toHaveBeenCalled();
  expect(document.querySelector("[data-search-highlight]")).toBeNull();
});
