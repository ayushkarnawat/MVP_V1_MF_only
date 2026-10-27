import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "@/features/auth/types";
import { ME_EMPTY_FIXTURE, ME_FIXTURE } from "../fixtures/me";
import { HOUSEHOLD_FIXTURE, HOUSEHOLD_SOLO_FIXTURE } from "../fixtures/members";
import { HeaderCard } from "./HeaderCard";
import type { HeaderCardProps } from "./HeaderCard";

const onEditProfile = vi.fn();

function mount(overrides: Partial<HeaderCardProps> = {}) {
  return render(
    <HeaderCard me={ME_FIXTURE} members={HOUSEHOLD_FIXTURE} status="ready" onEditProfile={onEditProfile} {...overrides} />,
  );
}

const card = () => screen.getByTestId("profile-header-card");

beforeEach(() => { vi.clearAllMocks(); });

describe("HeaderCard: who you are", () => {
  it("shows the name, email and phone from the account", () => {
    mount();
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Siddharth Surve");
    expect(screen.getByTestId("profile-email")).toHaveTextContent("siddharth@example.in");
    expect(screen.getByTestId("profile-phone")).toHaveTextContent("+919876543210");
  });

  it("draws the initials of the displayed name, not of the '(Me)' member name", () => {
    mount();
    expect(within(card()).getByTestId("initials-avatar")).toHaveTextContent("SS");
    expect(within(card()).getByTestId("initials-avatar")).toHaveStyle({ width: "76px" });
  });

  it.each([
    ["no name: the email", { self_name: null }, "siddharth@example.in"],
    ["a blank name: the email", { self_name: "   " }, "siddharth@example.in"],
    ["no name and no email: the phone", { self_name: null, email: null }, "+919876543210"],
  ] as Array<[string, Partial<MeResponse>, string]>)("falls back to %s", (_label, patch, expected) => {
    mount({ me: { ...ME_FIXTURE, ...patch } });
    expect(screen.getByTestId("profile-name").textContent).toBe(expected);
  });

  it("leaves out the email line when the account has no email", () => {
    mount({ me: ME_EMPTY_FIXTURE });
    expect(screen.queryByTestId("profile-email")).not.toBeInTheDocument();
    expect(screen.getByTestId("profile-name")).toHaveTextContent("+919876543210");
  });
});

describe("HeaderCard: the three facts", () => {
  it("shows the self member's masked PAN and no other member's", () => {
    mount();
    expect(within(screen.getByTestId("fact-pan")).getByTestId("pan-value")).toHaveTextContent("AB******4F");
    expect(card()).not.toHaveTextContent("CD******7K");
  });

  it("finds the self member wherever it sits in the list", () => {
    const [self, ...others] = HOUSEHOLD_FIXTURE;
    mount({ members: [...others, self] });
    expect(screen.getByTestId("pan-value")).toHaveTextContent("AB******4F");
    expect(card()).not.toHaveTextContent("CD******7K");
  });

  it("has no Show or Hide control: the only button is Edit Profile", () => {
    mount();
    expect(within(card()).getAllByRole("button").map(button => button.textContent)).toEqual(["Edit Profile"]);
    expect(within(card()).queryByText(/\b(show|hide)\b/i)).not.toBeInTheDocument();
  });

  it("shows 'Not added' when the self member has no PAN, and the tag when it is on another account", () => {
    const [self, ...others] = HOUSEHOLD_FIXTURE;
    const { rerender } = mount({ members: [{ ...self, pan_masked: null }, ...others] });
    expect(screen.getByTestId("fact-pan")).toHaveTextContent("Not added");
    rerender(<HeaderCard me={ME_FIXTURE} members={[{ ...self, pan_conflict: "other_account" }, ...others]} status="ready" onEditProfile={onEditProfile} />);
    expect(screen.getByTestId("pan-conflict")).toHaveTextContent("On another Unifolio account");
    expect(screen.getByTestId("pan-value")).toHaveTextContent("AB******4F");
  });

  it("derives the account type from the member count: Family for three, Individual for one", () => {
    const { rerender } = mount();
    expect(screen.getByTestId("fact-account-type")).toHaveTextContent("Account typeFamily");
    rerender(<HeaderCard me={ME_FIXTURE} members={HOUSEHOLD_SOLO_FIXTURE} status="ready" onEditProfile={onEditProfile} />);
    expect(screen.getByTestId("fact-account-type")).toHaveTextContent("Account typeIndividual");
  });

  it("shows 'Member since' as the month and year", () => {
    mount();
    expect(screen.getByTestId("fact-member-since")).toHaveTextContent("Member sinceOct 2025");
  });

  it.each([
    ["an empty string", ""],
    ["a blank string", "   "],
    ["text that is not a date", "not a date"],
    ["a missing field", undefined],
  ])("hides 'Member since' for %s", (_label, value) => {
    mount({ me: { ...ME_FIXTURE, created_at: value as unknown as string } });
    expect(screen.queryByTestId("fact-member-since")).not.toBeInTheDocument();
    expect(card()).not.toHaveTextContent("Member since");
  });

  it("shows no date of birth, address, photo or camera control", () => {
    mount();
    expect(card()).not.toHaveTextContent(/birth|address|photo|camera|upload/i);
  });
});

describe("HeaderCard: when the household list is not available", () => {
  it("while loading: skeletons for the PAN and the account type, never 'Not available', Edit Profile disabled", () => {
    mount({ members: [], status: "loading" });
    expect(screen.getByTestId("pan-loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("account-type-loading")).toHaveAttribute("aria-busy", "true");
    expect(card()).not.toHaveTextContent("Not available");
    expect(screen.getByRole("button", { name: "Edit Profile" })).toBeDisabled();
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Siddharth Surve");
  });

  it("after a failure: the account still shows, the PAN reads 'Not available', the account type is hidden, Edit Profile is disabled", () => {
    mount({ members: [], status: "error" });
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Siddharth Surve");
    expect(screen.getByTestId("profile-email")).toHaveTextContent("siddharth@example.in");
    expect(screen.getByTestId("profile-phone")).toHaveTextContent("+919876543210");
    expect(screen.getByTestId("fact-pan")).toHaveTextContent("Not available");
    expect(screen.queryByTestId("fact-account-type")).not.toBeInTheDocument();
    expect(card()).not.toHaveTextContent("Account type");
    expect(screen.getByRole("button", { name: "Edit Profile" })).toBeDisabled();
    expect(screen.getByTestId("fact-member-since")).toHaveTextContent("Oct 2025");
  });

  it("ignores any members passed with an error status (nothing is guessed from a failed list)", () => {
    mount({ members: HOUSEHOLD_FIXTURE, status: "error" });
    expect(screen.getByTestId("fact-pan")).toHaveTextContent("Not available");
    expect(screen.queryByTestId("fact-account-type")).not.toBeInTheDocument();
  });

  it("with a list that has no self member: PAN 'Not available', the type from the count, Edit Profile disabled", () => {
    mount({ members: [HOUSEHOLD_FIXTURE[1]] });
    expect(screen.getByTestId("fact-pan")).toHaveTextContent("Not available");
    expect(card()).not.toHaveTextContent("CD******7K");
    expect(screen.getByTestId("fact-account-type")).toHaveTextContent("Individual");
    expect(screen.getByRole("button", { name: "Edit Profile" })).toBeDisabled();
  });

  it("with an empty list: PAN 'Not available', no account type, Edit Profile disabled", () => {
    mount({ members: [] });
    expect(screen.getByTestId("fact-pan")).toHaveTextContent("Not available");
    expect(screen.queryByTestId("fact-account-type")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Profile" })).toBeDisabled();
  });
});

describe("HeaderCard: Edit Profile", () => {
  it("is enabled with a self member and calls the handler once per click", () => {
    mount();
    const button = screen.getByRole("button", { name: "Edit Profile" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onEditProfile).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", () => {
    mount({ members: [], status: "error" });
    fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
    expect(onEditProfile).not.toHaveBeenCalled();
  });
});
