import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvestorTypeDialog } from "./InvestorTypeDialog";

const auth = vi.hoisted(() => ({ updateMe: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

const onClose = vi.fn();

function mount(stored: string | null) {
  return render(<InvestorTypeDialog stored={stored} onClose={onClose} />);
}

const radio = (name: RegExp) => screen.getByRole("radio", { name });
const save = () => screen.getByRole("button", { name: /^Sav(e|ing…)$/ });

beforeEach(() => {
  vi.clearAllMocks();
  auth.updateMe.mockResolvedValue(undefined);
});

describe("InvestorTypeDialog", () => {
  it("is a dialog titled 'How do you invest today?' with the four onboarding choices in order, each with its subtitle", () => {
    mount("mixed");
    expect(screen.getByRole("dialog", { name: "How do you invest today?" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map(item => item.closest("label")?.textContent)).toEqual([
      "Mostly on my ownDirect SIPs, mutual funds, maybe some stocks",
      "Through an advisor or distributorDistributor, bank advisor or family office, alongside my own tracking",
      "A mix of bothA bit of self-directed investing and a bit through an advisor",
      "Just getting startedHaven't invested much yet, building my portfolio",
    ]);
  });

  it("starts with the stored choice selected", () => {
    mount("mixed");
    expect(radio(/A mix of both/)).toBeChecked();
    expect(screen.getAllByRole("radio").filter(item => (item as HTMLInputElement).checked)).toHaveLength(1);
    expect(save()).toBeEnabled();
  });

  it.each([[null], ["x_y"], [""]])("starts with nothing selected and Save disabled for %j", stored => {
    mount(stored);
    for (const item of screen.getAllByRole("radio")) expect(item).not.toBeChecked();
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(auth.updateMe).not.toHaveBeenCalled();
  });

  it("saves the chosen type, then closes", async () => {
    mount("mixed");
    fireEvent.click(radio(/Just getting started/));
    expect(radio(/Just getting started/)).toBeChecked();
    expect(radio(/A mix of both/)).not.toBeChecked();
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(auth.updateMe).toHaveBeenCalledTimes(1);
    expect(auth.updateMe).toHaveBeenCalledWith({ investor_type: "beginner" });
  });

  it("can set a first answer from an empty account", async () => {
    mount(null);
    fireEvent.click(radio(/Through an advisor or distributor/));
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(auth.updateMe).toHaveBeenCalledWith({ investor_type: "advisor_assisted" });
  });

  it("shows 'Saving…' on a disabled button while the request is pending, and sends only one request", async () => {
    let finish: () => void = () => {};
    auth.updateMe.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    mount("mixed");
    fireEvent.click(save());
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(auth.updateMe).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("on failure: shows the error, stays open, and Save works again", async () => {
    auth.updateMe.mockRejectedValueOnce(new Error("boom"));
    mount("mixed");
    fireEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your investor type. Please try again.");
    expect(onClose).not.toHaveBeenCalled();
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(auth.updateMe).toHaveBeenCalledTimes(2);
  });

  it("Cancel and the dialog's close button close without saving", () => {
    mount("mixed");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(auth.updateMe).not.toHaveBeenCalled();
  });
});
