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
  it("is a dialog titled 'What brings you to Unifolio?' with the six life goals in order, and the hint", () => {
    mount(["wealth_creation"]);
    expect(screen.getByRole("dialog", { name: "What brings you to Unifolio?" })).toBeInTheDocument();
    expect(screen.getByText("Select all that apply")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(6);
    expect(boxes.map(item => item.closest("label")?.textContent)).toEqual([
      "Build my wealth", "Plan for retirement", "Fund my children's education", "Buy a home", "Achieve financial freedom", "Plan my taxes",
    ]);
  });

  it("starts with the stored known goals ticked and the rest not; a code it does not know gets no box", () => {
    mount(["x_y", "childrens_education", "wealth_creation"]);
    expect(box(/Build my wealth/)).toBeChecked();
    expect(box(/Fund my children's education/)).toBeChecked();
    expect(box(/Plan for retirement/)).not.toBeChecked();
    expect(box(/Buy a home/)).not.toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
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
    mount(["wealth_creation"]);
    fireEvent.click(box(/Buy a home/));
    expect(box(/Buy a home/)).toBeChecked();
    fireEvent.click(box(/Buy a home/));
    expect(box(/Buy a home/)).not.toBeChecked();
  });

  it("'Why choose? All of it.' ticks all six, and a second press clears them", () => {
    mount(["wealth_creation"]);
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
    fireEvent.click(box(/Fund my children's education/));
    expect(screen.queryByText("Choose at least one goal.")).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });
});

describe("GoalsDialog: saving", () => {
  it("saves the ticked goals in onboarding order whatever order they were ticked in, then closes", async () => {
    mount(null);
    fireEvent.click(box(/Fund my children's education/));
    fireEvent.click(box(/Build my wealth/));
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(auth.updateMe).toHaveBeenCalledTimes(1);
    expect(auth.updateMe).toHaveBeenCalledWith({ primary_goals: ["wealth_creation", "childrens_education"] });
  });

  it("keeps a stored code this build does not know, and drops a known goal that was unticked", async () => {
    mount(["x_y", "wealth_creation"]);
    fireEvent.click(box(/Build my wealth/));
    fireEvent.click(box(/Fund my children's education/));
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(auth.updateMe).toHaveBeenCalledWith({ primary_goals: ["childrens_education", "x_y"] });
  });

  it("saves all six after 'All of it', and keeps an unknown code too", async () => {
    mount(["retirement_planning"]);
    fireEvent.click(screen.getByRole("button", { name: "Why choose? All of it." }));
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(auth.updateMe).toHaveBeenCalledWith({
      primary_goals: ["wealth_creation", "retirement", "childrens_education", "buy_home", "financial_freedom", "tax_planning", "retirement_planning"],
    });
  });

  it("allows choosing all six by hand and saves the six codes in order", async () => {
    mount(["x_y"]);
    for (const name of [/Plan my taxes/, /Achieve financial freedom/, /Buy a home/, /Fund my children's education/, /Plan for retirement/, /Build my wealth/]) fireEvent.click(box(name));
    for (const item of screen.getAllByRole("checkbox")) expect(item).toBeChecked();
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(auth.updateMe).toHaveBeenCalledWith({ primary_goals: ["wealth_creation", "retirement", "childrens_education", "buy_home", "financial_freedom", "tax_planning", "x_y"] });
  });

  it("cannot save an empty selection, even when the stored list holds an unknown code", () => {
    mount(["x_y"]);
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(auth.updateMe).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("an emptied selection cannot be saved either", () => {
    mount(["wealth_creation"]);
    fireEvent.click(box(/Build my wealth/));
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(auth.updateMe).not.toHaveBeenCalled();
  });

  it("shows 'Saving…' on a disabled button while the request is pending, and sends only one request", async () => {
    let finish: () => void = () => {};
    auth.updateMe.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    mount(["wealth_creation"]);
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
    mount(["wealth_creation"]);
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
    mount(["wealth_creation"]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(auth.updateMe).not.toHaveBeenCalled();
  });

  it("the close button of the dialog closes and saves nothing", () => {
    mount(["wealth_creation"]);
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(auth.updateMe).not.toHaveBeenCalled();
  });
});
