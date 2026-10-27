import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import { buildStatusSentence } from "../homeCopy";
import type { SummaryResponse } from "../types";
import { Greeting } from "./Greeting";

const family = (changes: Partial<SummaryResponse> = {}) => ({ ...fixture<SummaryResponse>("summary_family"), ...changes });

function setup(summary: SummaryResponse, onTopMover: (() => void) | undefined = vi.fn()) {
  const view = render(<Greeting status="data" summary={summary} onImport={() => {}} onTopMover={onTopMover} />);
  return { ...view, onTopMover };
}

describe("Greeting: the top mover is a link to the movers popup (register C99, C120)", () => {
  it("makes the fund's name a button inside the sentence, without changing a word of the sentence", () => {
    const summary = family();
    const { onTopMover } = setup(summary);
    const sentence = screen.getByTestId("greeting-sentence");
    expect(sentence.textContent).toBe(buildStatusSentence(summary));
    const button = within(sentence).getByRole("button", { name: "Asha Large Cap" });
    expect(button).toHaveTextContent("Asha Large Cap");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("data-testid", "greeting-top-mover");
    expect(sentence.textContent).toMatch(/ Asha Large Cap drove most of the gains\.$/);
    fireEvent.click(button);
    expect(onTopMover).toHaveBeenCalledTimes(1);
  });

  it("is plain text when the page gives no handler", () => {
    const summary = family();
    render(<Greeting status="data" summary={summary} onImport={() => {}} />);
    expect(screen.getByTestId("greeting-sentence").textContent).toBe(buildStatusSentence(summary));
    expect(screen.queryByTestId("greeting-top-mover")).toBeNull();
  });

  it("is plain text when the server names no top contributor", () => {
    const summary = family({ top_contributor: null });
    setup(summary);
    expect(screen.getByTestId("greeting-sentence").textContent).toBe(buildStatusSentence(summary));
    expect(screen.queryByTestId("greeting-top-mover")).toBeNull();
  });

  it("has no link on a flat day, which names nobody", () => {
    const summary = family({ direction: "flat" });
    setup(summary);
    expect(screen.getByTestId("greeting-sentence").textContent).toBe(buildStatusSentence(summary));
    expect(screen.queryByTestId("greeting-top-mover")).toBeNull();
  });

  it("links the loser on a down day", () => {
    const summary = family({ direction: "down", change_amount: "-38.00", change_pct: "-0.7300", top_contributor: "Asha Flexi Cap" });
    const { onTopMover } = setup(summary);
    const sentence = screen.getByTestId("greeting-sentence");
    expect(sentence.textContent).toBe(buildStatusSentence(summary));
    expect(sentence.textContent).toMatch(/ Asha Flexi Cap drove most of the losses\.$/);
    fireEvent.click(within(sentence).getByRole("button", { name: "Asha Flexi Cap" }));
    expect(onTopMover).toHaveBeenCalledTimes(1);
  });

  it("links only the name in the closing clause when the same words also appear earlier in the sentence", () => {
    const summary = family({ scope_label: "Asha Large Cap", top_contributor: "Asha Large Cap" });
    setup(summary);
    const sentence = screen.getByTestId("greeting-sentence");
    expect(sentence.textContent).toBe(buildStatusSentence(summary));
    expect(sentence.textContent?.startsWith("Asha Large Cap is up")).toBe(true);
    expect(screen.getAllByTestId("greeting-top-mover")).toHaveLength(1);
    expect(sentence.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(sentence.firstChild?.textContent?.startsWith("Asha Large Cap is up")).toBe(true);
  });

  it("is plain text if the name is not in the sentence for any reason", () => {
    const summary = family();
    const { container } = render(<Greeting status="data" summary={{ ...summary, top_contributor: "" }} onImport={() => {}} onTopMover={() => {}} />);
    expect(container.querySelector("[data-testid='greeting-top-mover']")).toBeNull();
  });

  it("has no sentence and no link when there are no holdings", () => {
    setup(fixture<SummaryResponse>("summary_empty"));
    expect(screen.queryByTestId("greeting-sentence")).toBeNull();
    expect(screen.queryByTestId("greeting-top-mover")).toBeNull();
  });

  it("can be reached and used with the keyboard like any button", () => {
    setup(family());
    const button = screen.getByTestId("greeting-top-mover");
    button.focus();
    expect(button).toHaveFocus();
    expect(button.tagName).toBe("BUTTON");
  });
});
