import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoalsDialog } from "./GoalsDialog";

const auth = vi.hoisted(() => ({ updateMe: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

const onClose = vi.fn();

function mount(stored: readonly string[] | null | undefined) {
  return render(<GoalsDialog stored={stored} onClose={onClose} />);
}

const box = (name: RegExp) => screen.getByRole("checkbox", { name });
const save = () => screen.getByRole("button", { name: /^Sav(e|ing…)$/ });

beforeEach(() => {
  vi.clearAllMocks();
  auth.updateMe.mockResolvedValue(undefined);
});

describe("GoalsDialog: what it shows", () => {
  it("is a dialog titled 'What brings you to Unifolio?' with the four onboarding goals in order, each with its subtitle", () => {
    mount(["consolidated_view"]);
    expect(screen.getByRole("dialog", { name: "What brings you to Unifolio?" })).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(4);
    expect(boxes.map(item => item.closest("label")?.textContent)).toEqual([
      "Consolidated portfolio viewSee all my mutual funds across every broker and fund house in one place",
      "Understand true performanceSee your true returns after fees, taxes and plan type",
      "Family wealth trackingManaging investments for family members under one dashboard",
      "Compare distributor feesCompare returns and costs across different distributors",
    ]);
  });

  it("starts with the stored known goals ticked and the rest not; a code it does not know gets no box", () => {
    mount(["x_y", "family_management", "consolidated_view"]);
    expect(box(/Consolidated portfolio view/)).toBeChecked();
    expect(box(/Family wealth tracking/)).toBeChecked();
    expect(box(/Understand true performance/)).not.toBeChecked();
    expect(box(/Compare distributor fees/)).not.toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.queryByText(/x y/i)).not.toBeInTheDocument();
  });

  it.each([[null], [undefined], [[]]])("starts with nothing ticked and Save disabled for %j, with a hint", stored => {
    mount(stored);
    for (const item of screen.getAllByRole("checkbox")) expect(item).not.toBeChecked();
    expect(save()).toBeDisabled();
    expect(screen.getByText("Choose at least one goal.")).toBeInTheDocument();
  });
});

describe("GoalsDialog: choosing", () => {
  it("ticks and unticks a goal", () => {
    mount(["consolidated_view"]);
    fireEvent.click(box(/Compare distributor fees/));
    expect(box(/Compare distributor fees/)).toBeChecked();
    fireEvent.click(box(/Compare distributor fees/));
    expect(box(/Compare distributor fees/)).not.toBeChecked();
  });

  it("'Why choose? All of it.' ticks all four, and a second press clears them", () => {
    mount(["consolidated_view"]);
    fireEvent.click(screen.getByRole("button", { name: "Why choose? All of it." }));
    for (const item of screen.getAllByRole("checkbox")) expect(item).toBeChecked();
    expect(screen.queryByText("Choose at least one goal.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Why choose? All of it." }));
    for (const item of screen.getAllByRole("checkbox")) expect(item).not.toBeChecked();
    expect(save()).toBeDisabled();
  });

  it("hides the hint again once something is ticked", () => {
    mount(null);
    expect(screen.getByText("Choose at least one goal.")).toBeInTheDocument();
    fireEvent.click(box(/Family wealth tracking/));
    expect(screen.queryByText("Choose at least one goal.")).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });
});

describe("GoalsDialog: saving", () => {
  it("saves the ticked goals in onboarding order whatever order they were ticked in, then closes", async () => {
    mount(null);
    fireEvent.click(box(/Family wealth tracking/));
    fireEvent.click(box(/Consolidated portfolio view/));
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(auth.updateMe).toHaveBeenCalledTimes(1);
    expect(auth.updateMe).toHaveBeenCalledWith({ primary_goals: ["consolidated_view", "family_management"] });
  });

  it("keeps a stored code this build does not know, and drops a known goal that was unticked", async () => {
    mount(["x_y", "consolidated_view"]);
    fireEvent.click(box(/Consolidated portfolio view/));
    fireEvent.click(box(/Family wealth tracking/));
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(auth.updateMe).toHaveBeenCalledWith({ primary_goals: ["family_management", "x_y"] });
  });

  it("saves all four after 'All of it', and keeps an unknown code too", async () => {
    mount(["retirement_planning"]);
    fireEvent.click(screen.getByRole("button", { name: "Why choose? All of it." }));
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(auth.updateMe).toHaveBeenCalledWith({
      primary_goals: ["consolidated_view", "understand_holdings", "family_management", "performance_comparison", "retirement_planning"],
    });
  });

  it("cannot save an empty selection, even when the stored list holds an unknown code", () => {
    mount(["x_y"]);
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(auth.updateMe).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("an emptied selection cannot be saved either", () => {
    mount(["consolidated_view"]);
    fireEvent.click(box(/Consolidated portfolio view/));
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(auth.updateMe).not.toHaveBeenCalled();
  });

  it("shows 'Saving…' on a disabled button while the request is pending, and sends only one request", async () => {
    let finish: () => void = () => {};
    auth.updateMe.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    mount(["consolidated_view"]);
    fireEvent.click(save());
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(auth.updateMe).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("on failure: shows the error, stays open, re-enables Save, and a second try can succeed", async () => {
    auth.updateMe.mockRejectedValueOnce(new Error("boom"));
    mount(["consolidated_view"]);
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your goals. Please try again.");
    expect(onClose).not.toHaveBeenCalled();
    expect(save()).toBeEnabled();
    expect(screen.getByRole("dialog", { name: "What brings you to Unifolio?" })).toBeInTheDocument();
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(auth.updateMe).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("GoalsDialog: leaving without saving", () => {
  it("Cancel closes and saves nothing", () => {
    mount(["consolidated_view"]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(auth.updateMe).not.toHaveBeenCalled();
  });

  it("the close button of the dialog closes and saves nothing", () => {
    mount(["consolidated_view"]);
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(auth.updateMe).not.toHaveBeenCalled();
  });
});
