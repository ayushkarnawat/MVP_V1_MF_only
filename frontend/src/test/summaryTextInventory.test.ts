import { describe, expect, it } from "vitest";
import { textInventory } from "@/test/summaryTextInventory";

describe("summary text inventory", () => {
  it("textInventory_treats_a_value_figure_as_one_entry_whatever_its_inner_spans", () => {
    const root = document.createElement("div");
    root.innerHTML = '<span data-testid="value-total">₹5,212</span>';
    expect(textInventory(root)).toEqual(["₹5,212"]);
    root.innerHTML = '<span data-testid="value-total"><span>₹</span>5,212</span>';
    expect(textInventory(root)).toEqual(["₹5,212"]);
  });

  it("keeps_root_and_descendant_attributes_duplicates_and_nonfigure_text_nodes", () => {
    const root = document.createElement("div");
    root.setAttribute("aria-label", "  Summary\u00a0 bar  ");
    root.setAttribute("title", "Summary bar");
    root.innerHTML = ' Left <span> Right </span><span data-testid="value-total" title=" Amount "><span aria-label=" Rupee ">₹</span>5,212</span>  ';
    expect(textInventory(root)).toEqual([
      "Amount", "Left", "Right", "Rupee", "Summary bar", "Summary bar", "₹5,212",
    ]);
  });
});
