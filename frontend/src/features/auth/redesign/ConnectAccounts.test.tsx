import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectAccounts } from "./ConnectAccounts";

function mount() {
  const handlers = { onContinue: vi.fn(), onBack: vi.fn() };
  render(<ConnectAccounts {...handlers} />);
  return handlers;
}
const rows = () => within(screen.getByRole("radiogroup", { name: "What would you like to connect first?" })).getAllByRole("radio");

describe("ConnectAccounts, sign-up screen 5 (task 6.13)", () => {
  it("has the step bar, the left panel with the wallet sketch and the three rows", () => {
    mount();
    expect(screen.getByRole("group", { name: "Step 5 of 5" })).toBeInTheDocument();
    const left = screen.getByTestId("auth-left-text");
    expect(within(left).getByRole("heading", { level: 2 })).toHaveTextContent("Bring your investments together.");
    expect(within(left).getByText("Connect your accounts to see your family's investments in one place and understand how they fit together.")).toBeInTheDocument();
    for (const row of ["Secure & Private", "Takes just a few minutes", "All major asset types"]) expect(within(left).getByText(row)).toBeInTheDocument();
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/wallet-folder.webp");
  });
  it("lists the six sources in order with the drawn wording", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "What would you like to connect first?" })).toBeInTheDocument();
    expect(screen.getByText("You can always add more accounts later.")).toBeInTheDocument();
    expect(rows().map((row) => row.textContent)).toEqual([
      "Mutual fundsImport your holdings via CAMS or MF Central",
      "Stocks & ETFsConnect your demat accounts (NSDL / CDSL)Coming soon",
      "PMS & AIFsAdd your PMS and alternative investmentsComing soon",
      "Real estateTrack the value of your propertiesComing soon",
      "GoldTrack your digital and physical goldComing soon",
      "Bank accounts, loans & credit cardsTrack your cash, loans and credit cardsComing soon",
    ]);
  });
  it("only Mutual funds is selectable and it starts selected", () => {
    mount();
    expect(rows().map((row) => row.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false", "false", "false"]);
    expect(rows().map((row) => row.getAttribute("aria-disabled"))).toEqual([null, "true", "true", "true", "true", "true"]);
    expect(screen.getAllByText("Coming soon")).toHaveLength(5);
  });
  it("coming-soon rows ignore clicks and keys", () => {
    const { onContinue } = mount();
    for (const row of rows().slice(1)) {
      fireEvent.click(row);
      fireEvent.keyDown(row, { key: "Enter" });
      fireEvent.keyDown(row, { key: " " });
    }
    expect(rows().map((row) => row.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false", "false", "false"]);
    expect(onContinue).not.toHaveBeenCalled();
  });
  it("Continue goes on to the import, Back goes to screen 4, and there is no skip", () => {
    const { onContinue, onBack } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/skip/i)).toBeNull();
  });
});
