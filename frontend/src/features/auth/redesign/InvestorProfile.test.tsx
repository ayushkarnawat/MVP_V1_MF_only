import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvestorProfile } from "./InvestorProfile";

function mount(over: Partial<Parameters<typeof InvestorProfile>[0]> = {}) {
  const handlers = { onSubmit: vi.fn(), onBack: vi.fn() };
  render(<InvestorProfile {...handlers} {...over} />);
  return handlers;
}
const SIX = ["Build my wealth", "Plan for retirement", "Fund my children's education", "Buy a home", "Achieve financial freedom", "Plan my taxes"];
const goalBoxes = () => within(screen.getByRole("group", { name: "What are you working towards?" })).getAllByRole("checkbox");
const options = () => within(screen.getByRole("radiogroup", { name: "How do you usually invest?" })).getAllByRole("radio");
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));

describe("InvestorProfile, sign-up screen 4 (task 6.12)", () => {
  it("has the step bar, the left panel with three rows and the person sketch", () => {
    mount();
    expect(screen.getByRole("group", { name: "Step 4 of 5" })).toBeInTheDocument();
    const left = screen.getByTestId("auth-left-text");
    expect(within(left).getByRole("heading", { level: 2 })).toHaveTextContent("Help us personalise your experience.");
    expect(within(left).getByText("Tell us a little about how you invest and what you're working towards, so we can make your insights more relevant.")).toBeInTheDocument();
    for (const row of ["More relevant insights", "A tailored experience", "You're always in control"]) expect(within(left).getByText(row)).toBeInTheDocument();
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/person.png");
  });
  it("asks the first question with the four designed answers, in order, and the second with the six goals", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "How do you usually invest?" })).toBeInTheDocument();
    expect(options().map((option) => within(option).getByText(/./, { selector: "span.font-semibold" }).textContent)).toEqual([
      "I'm just getting started", "I manage my own investments", "I work with a financial professional", "A mix of both",
    ]);
    expect(screen.getByText("I'm new to investing or still building my portfolio.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /What are you working towards\?/ })).toHaveTextContent("(Select all that apply)");
    expect(goalBoxes().map((box) => box.textContent)).toEqual(SIX);
  });
  it("pre-selects nothing and has no Skip", () => {
    mount();
    for (const option of options()) expect(option).toHaveAttribute("aria-checked", "false");
    for (const box of goalBoxes()) expect(box).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText(/skip/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
  it("Continue with neither answered shows both errors, announced, and focuses the first question", () => {
    const { onSubmit } = mount();
    next();
    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toEqual(["Choose how you usually invest.", "Choose at least one goal."]);
    expect(document.activeElement).toBe(options()[0]);
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("one answered and one not shows only the missing error and focuses it", () => {
    mount();
    fireEvent.click(options()[1]);
    next();
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual(["Choose at least one goal."]);
    expect(document.activeElement).toBe(goalBoxes()[0]);
  });
  it("the first question takes a single choice", () => {
    mount();
    fireEvent.click(options()[0]);
    fireEvent.click(options()[2]);
    expect(options().map((option) => option.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false"]);
  });
  it("the four answers are one Tab stop: the chosen one (or the first when none), and the arrow keys move and choose", () => {
    mount();
    expect(options().map((option) => option.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    options()[0].focus();
    fireEvent.keyDown(options()[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(options()[1]);
    expect(options()[1]).toHaveAttribute("aria-checked", "true");
    expect(options().map((option) => option.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1"]);
    fireEvent.keyDown(options()[1], { key: "ArrowRight" });
    expect(options()[2]).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(options()[2], { key: "ArrowUp" });
    expect(document.activeElement).toBe(options()[1]);
    fireEvent.keyDown(options()[1], { key: "ArrowLeft" });
    fireEvent.keyDown(options()[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(options()[3]);
    expect(options()[3]).toHaveAttribute("aria-checked", "true");
  });
  it("a saved answer is the Tab stop", () => {
    mount({ initialInvestorType: "advisor_assisted" });
    expect(options().map((option) => option.getAttribute("tabindex"))).toEqual(["-1", "-1", "0", "-1"]);
  });
  it("Select all picks all six and becomes Clear all, which clears them", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(goalBoxes().every((box) => box.getAttribute("aria-checked") === "true")).toBe(true);
    expect(screen.queryByRole("button", { name: "Select all" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(goalBoxes().every((box) => box.getAttribute("aria-checked") === "false")).toBe(true);
    expect(screen.getByRole("button", { name: "Select all" })).toBeInTheDocument();
  });
  it("picking the six one by one also turns the link into Clear all; unticking one turns it back", () => {
    mount();
    goalBoxes().forEach((box) => fireEvent.click(box));
    expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument();
    fireEvent.click(goalBoxes()[0]);
    expect(screen.getByRole("button", { name: "Select all" })).toBeInTheDocument();
  });
  it("Continue sends the investor type and the goals together, once", async () => {
    const { onSubmit } = mount();
    fireEvent.click(options()[3]);
    fireEvent.click(goalBoxes()[3]);
    fireEvent.click(goalBoxes()[5]);
    next();
    fireEvent.click(screen.getByRole("button", { name: /Saving|Continue/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ investorType: "mixed", goals: ["buy_home", "tax_planning"] });
  });
  it("comes back with saved answers filled", () => {
    mount({ initialInvestorType: "advisor_assisted", initialGoals: ["retirement", "buy_home"] });
    expect(options()[2]).toHaveAttribute("aria-checked", "true");
    expect(goalBoxes().filter((box) => box.getAttribute("aria-checked") === "true").map((box) => box.textContent)).toEqual(["Plan for retirement", "Buy a home"]);
  });
  it("an error from the save is shown and the person can try again", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    mount({ onSubmit, initialInvestorType: "mixed", initialGoals: ["buy_home"] });
    next();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your answers. Try again.");
    next();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });
  it("Back calls onBack", () => {
    const { onBack } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it("renders option rows with icon badge and radio indicator, with inner dot when selected", () => {
    mount();
    const rows = options();
    rows.forEach((row) => {
      expect(within(row).getByTestId("icon-badge")).toBeInTheDocument();
      expect(within(row).getByTestId("option-radio")).toBeInTheDocument();
    });
    expect(rows[0].querySelector("[data-testid='option-radio'] span")).toBeNull();
    fireEvent.click(rows[0]);
    const dot = rows[0].querySelector("[data-testid='option-radio'] span");
    expect(dot).toBeInTheDocument();
    expect(dot?.className).toContain("rounded-full");
  });
  it("renders six chips with icon and chip-box, inside a grid-cols-3 container", () => {
    mount();
    const boxes = goalBoxes();
    expect(boxes).toHaveLength(6);
    boxes.forEach((box) => {
      expect(box.querySelector("svg")).toBeInTheDocument();
      expect(within(box).getByTestId("chip-box")).toBeInTheDocument();
    });
    const grid = screen.getByRole("group", { name: "What are you working towards?" });
    expect(grid).toHaveClass("grid-cols-3");
  });
  it("goals heading is a flex row with whitespace-nowrap and Select all / Clear all button", () => {
    mount();
    const headingRow = screen.getByRole("heading", { level: 2, name: /What are you working towards\?/ }).parentElement;
    expect(headingRow).toHaveClass("flex");
    expect(headingRow).toHaveClass("whitespace-nowrap");
  });
});
