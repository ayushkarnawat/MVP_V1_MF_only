import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HouseholdMember } from "../../auth/types";
import { ProfileNudge } from "./ProfileNudge";
import { PanConflictBanner } from "./PanConflictBanner";
import { ProfileCompleteSuccess } from "./ProfileCompleteSuccess";

const member = (over: Partial<HouseholdMember> = {}): HouseholdMember => ({
  id: "m-r", name: "Ramesh Sharma", relationship: null, relationship_other_label: null, origin: "cas_detected",
  pan_masked: "AB******4K", phone_number: null, email: null, name_from_statement: true,
  pan_conflict: null, pan_editable: false, profile_completion: 40,
  missing_fields: ["relationship", "phone_number", "email"], removed_with_last_import: true, ...over,
});

describe("ProfileNudge", () => {
  it("shows the % and opens on click", () => {
    const onOpen = vi.fn();
    render(<ProfileNudge member={member()} onOpen={onOpen} />);
    const btn = screen.getByRole("button", { name: /40% complete.*finish profile/i });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalled();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  });
  it("names the last missing field", () => {
    render(<ProfileNudge member={member({ profile_completion: 80, missing_fields: ["email"] })} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: /80% complete.*add email/i })).toBeInTheDocument();
  });
  it("renders nothing at 100%", () => {
    const { container } = render(<ProfileNudge member={member({ profile_completion: 100, missing_fields: [] })} onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PanConflictBanner", () => {
  it("is a visible alert", () => {
    render(<PanConflictBanner memberName="Vikram Kapoor" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Vikram Kapoor’s PAN is on another Unifolio account");
  });
});

describe("ProfileCompleteSuccess", () => {
  it("announces completion and returns", () => {
    const onDone = vi.fn();
    render(<ProfileCompleteSuccess isOpen memberName="Ramesh Sharma" onDone={onDone} />);
    expect(screen.getByText("Ramesh Sharma’s profile is complete")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(onDone).toHaveBeenCalled();
  });
});
