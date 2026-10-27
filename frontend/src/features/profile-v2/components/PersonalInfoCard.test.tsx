import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalInfoCard } from "./PersonalInfoCard";

// The dialog has its own tests; here it is a stand-in that shows which channel was opened and lets the test close it.
vi.mock("./ContactChangeDialog", () => ({
  ContactChangeDialog: (props: { channel: string; onClose: () => void; onChanged: () => void }) => (
    <div role="dialog" aria-label={`stub dialog ${props.channel}`}>
      <button type="button" onClick={props.onClose}>stub close</button>
      <button type="button" onClick={props.onChanged}>stub changed</button>
    </div>
  ),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe("PersonalInfoCard", () => {
  it("has the heading, the subtitle and exactly two rows: email address and mobile number", () => {
    const { container } = render(<PersonalInfoCard email="siddharth@example.in" phone="+919876543210" />);
    expect(screen.getByRole("heading", { level: 2, name: "Personal Information" })).toBeInTheDocument();
    expect(screen.getByText("Keep your contact details up to date.")).toBeInTheDocument();
    expect([...container.querySelectorAll("dt")].map(term => term.textContent)).toEqual(["Email address", "Mobile number"]);
    expect(screen.getByTestId("row-email")).toHaveTextContent("siddharth@example.in");
    expect(screen.getByTestId("row-phone")).toHaveTextContent("+919876543210");
  });

  it("does not repeat the name or the PAN (they are in the header card)", () => {
    const { container } = render(<PersonalInfoCard email="siddharth@example.in" phone="+919876543210" />);
    expect(container).not.toHaveTextContent(/full name|pan number|\bpan\b/i);
  });

  it("reads 'Not added' for a missing email or an empty phone", () => {
    render(<PersonalInfoCard email={null} phone="" />);
    expect(screen.getByTestId("row-email")).toHaveTextContent("Not added");
    expect(screen.getByTestId("row-phone")).toHaveTextContent("Not added");
  });

  it("offers exactly two change buttons, named for the field", () => {
    render(<PersonalInfoCard email="siddharth@example.in" phone="+919876543210" />);
    expect(screen.getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual([
      "Change email address",
      "Change mobile number",
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the contact-change dialog for the email, then for the mobile number, one at a time", () => {
    render(<PersonalInfoCard email="siddharth@example.in" phone="+919876543210" />);
    fireEvent.click(screen.getByRole("button", { name: "Change email address" }));
    expect(screen.getByRole("dialog", { name: "stub dialog email" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "stub close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change mobile number" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "stub dialog phone" })).toBeInTheDocument();
  });

  it("closes the dialog once the change is done", () => {
    render(<PersonalInfoCard email="siddharth@example.in" phone="+919876543210" />);
    fireEvent.click(screen.getByRole("button", { name: "Change mobile number" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "stub changed" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
