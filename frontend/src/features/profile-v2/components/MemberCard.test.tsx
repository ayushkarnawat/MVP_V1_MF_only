import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HouseholdMember } from "@/features/auth/types";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import { MemberCard } from "./MemberCard";

const [SELF, SPOUSE, FATHER] = HOUSEHOLD_FIXTURE;

const handlers = {
  onEdit: vi.fn(),
  onChangeInAccountInfo: vi.fn(),
  onDeleteMember: vi.fn(),
  onDeleteFunds: vi.fn(),
};

interface Options {
  tone?: number;
  accountPhone?: string;
  accountEmail?: string | null;
  highlighted?: boolean;
  deleteFundsDisabled?: boolean;
}

function mount(member: HouseholdMember, options: Options = {}) {
  return render(
    <MemberCard
      member={member}
      tone={options.tone ?? 0}
      accountPhone={options.accountPhone}
      accountEmail={options.accountEmail}
      highlighted={options.highlighted}
      deleteFundsDisabled={options.deleteFundsDisabled ?? false}
      {...handlers}
    />,
  );
}

const card = () => screen.getByTestId("member-card");
const field = (key: string) => within(card()).getByTestId(`field-${key}`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MemberCard: the header", () => {
  it("is an article named after the member (without '(Me)'), tagged with the member id", () => {
    mount(SELF);
    expect(screen.getByRole("article", { name: "Siddharth Surve" })).toBe(card());
    expect(card()).toHaveAttribute("data-member-id", "m-self");
  });

  it("shows the name, an initials avatar (hidden from assistive technology) in the tone it was given, and the access pill", () => {
    mount(SPOUSE, { tone: 6 });
    expect(within(card()).getByTestId("member-name")).toHaveTextContent("Aditi Surve");
    const avatar = within(card()).getByTestId("initials-avatar");
    expect(avatar).toHaveTextContent("AS");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
    expect(avatar).toHaveAttribute("data-tone", "2");
    expect(within(card()).getByTestId("access-pill")).toHaveTextContent("Member");
  });

  it("the self member's pill says Admin in the brand tint; the others' pill says Member in the neutral tint", () => {
    const view = mount(SELF);
    expect(within(card()).getByTestId("access-pill")).toHaveTextContent("Admin");
    expect(within(card()).getByTestId("access-pill")).toHaveClass("text-[var(--pos-text)]");
    view.unmount();
    mount(FATHER);
    expect(within(card()).getByTestId("access-pill")).toHaveTextContent("Member");
    expect(within(card()).getByTestId("access-pill")).toHaveClass("text-[var(--ui-text-muted)]");
  });

  it("adds the caption 'from your statement' only when the name came from a statement", () => {
    const view = mount(SPOUSE);
    expect(within(card()).getByTestId("name-caption")).toHaveTextContent("from your statement");
    view.unmount();
    mount(SELF);
    expect(within(card()).queryByTestId("name-caption")).not.toBeInTheDocument();
    expect(card()).not.toHaveTextContent("from your statement");
  });

  it("a name of 120 characters is kept whole but truncated on screen, with the full name as its tooltip", () => {
    const long = "B".repeat(120);
    mount({ ...SPOUSE, name: long });
    const name = within(card()).getByTestId("member-name");
    expect(name).toHaveTextContent(long);
    expect(name).toHaveClass("truncate");
    expect(name).toHaveAttribute("title", long);
    expect(card()).toHaveAttribute("aria-label", long);
  });

  it("an empty name reads 'Not added', muted, and the card is still a labelled article", () => {
    mount({ ...SPOUSE, name: "" });
    const name = within(card()).getByTestId("member-name");
    expect(name).toHaveTextContent("Not added");
    expect(name).toHaveClass("text-[var(--ui-text-muted)]");
    expect(within(card()).getByTestId("initials-avatar")).toHaveTextContent("?");
    expect(card()).toHaveAttribute("aria-label", "Family member");
  });

  it("a null name (a record the server sent without one) is treated like an empty one", () => {
    mount({ ...SPOUSE, name: null as unknown as string });
    expect(within(card()).getByTestId("member-name")).toHaveTextContent("Not added");
  });
});

describe("MemberCard: the PAN field", () => {
  it("shows the masked PAN, exactly as the server sent it, and no Show, Hide or Reveal control anywhere on the card", () => {
    mount(SELF);
    expect(within(field("pan")).getByTestId("pan-value")).toHaveTextContent("AB******4F");
    expect(screen.queryByRole("button", { name: /show|hide|reveal|copy/i })).not.toBeInTheDocument();
    expect(card().textContent).not.toMatch(/[A-Z]{5}[0-9]{4}[A-Z]/);
  });

  it("shows 'Not added' when there is no PAN, with no conflict note", () => {
    mount(FATHER);
    expect(within(field("pan")).getByTestId("pan-field")).toHaveAttribute("data-state", "empty");
    expect(field("pan")).toHaveTextContent("Not added");
    expect(within(card()).queryByTestId("pan-conflict")).not.toBeInTheDocument();
    expect(within(card()).queryByTestId("pan-conflict-caption")).not.toBeInTheDocument();
  });

  it("OWNER DECISION C130: a PAN held by another account shows BOTH the pill and the caption, each reading 'On another Unifolio account'", () => {
    mount(SPOUSE);
    expect(within(field("pan")).getByTestId("pan-value")).toHaveTextContent("CD******7K");
    const pill = within(field("pan")).getByTestId("pan-conflict");
    const caption = within(field("pan")).getByTestId("pan-conflict-caption");
    expect(pill).toHaveTextContent("On another Unifolio account");
    expect(caption).toHaveTextContent("On another Unifolio account");
    expect(pill).not.toBe(caption);
    expect(within(card()).getAllByText("On another Unifolio account")).toHaveLength(2);
  });

  it("is announced once: the visible caption is hidden from assistive tech, the pill is not", () => {
    mount(SPOUSE);
    const announced = within(card()).getAllByText("On another Unifolio account").filter(el => !el.closest('[aria-hidden="true"]'));
    expect(announced).toHaveLength(1);
    expect(within(field("pan")).getByTestId("pan-conflict-caption")).toHaveAttribute("aria-hidden", "true");
  });

  it("the caption sits after the pill, below it, inside the PAN field's own cell", () => {
    mount(SPOUSE);
    const pill = within(field("pan")).getByTestId("pan-conflict");
    const caption = within(field("pan")).getByTestId("pan-conflict-caption");
    expect(pill.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caption.tagName).toBe("P");
    expect(caption).toHaveClass("text-xs");
  });

  it("neither the pill nor the caption shows without a conflict", () => {
    mount(SELF);
    expect(within(card()).queryByTestId("pan-conflict")).not.toBeInTheDocument();
    expect(within(card()).queryByTestId("pan-conflict-caption")).not.toBeInTheDocument();
    expect(card()).not.toHaveTextContent("On another Unifolio account");
  });

  it("a conflict on a member with no PAN shows neither (there is no PAN to be held elsewhere)", () => {
    mount({ ...FATHER, pan_conflict: "other_account" });
    expect(within(card()).queryByTestId("pan-conflict")).not.toBeInTheDocument();
    expect(within(card()).queryByTestId("pan-conflict-caption")).not.toBeInTheDocument();
    expect(field("pan")).toHaveTextContent("Not added");
  });
});

describe("MemberCard: relationship, phone and email", () => {
  it("shows the four fields with their labels, in order: PAN, Relationship, Phone, Email", () => {
    mount(FATHER);
    const rows = within(card()).getAllByRole("term").map(term => term.textContent);
    expect(rows).toEqual(["PAN", "Relationship", "Phone", "Email"]);
    expect(field("relationship")).toHaveTextContent("Parent");
    expect(field("phone")).toHaveTextContent("+919812345678");
    expect(field("email")).toHaveTextContent("ramesh@example.in");
  });

  it("shows 'Me' for the self member's relationship and 'Not set' when none was chosen", () => {
    const view = mount(SELF);
    expect(field("relationship")).toHaveTextContent("Me");
    view.unmount();
    mount({ ...SPOUSE, relationship: null });
    expect(field("relationship")).toHaveTextContent("Not set");
  });

  it("shows 'Not added' for a missing phone and a missing email, and not for the one that is there", () => {
    mount(SPOUSE);
    expect(field("phone")).toHaveTextContent("Not added");
    expect(field("email")).toHaveTextContent("Not added");
    expect(field("relationship")).not.toHaveTextContent("Not added");
  });

  it("treats an empty string like a missing value", () => {
    mount({ ...FATHER, phone_number: "", email: "" });
    expect(field("phone")).toHaveTextContent("Not added");
    expect(field("email")).toHaveTextContent("Not added");
  });

  it("the self card shows the ACCOUNT's own phone and email, not the member record's", () => {
    mount(SELF, { accountPhone: "+919000000001", accountEmail: "account@example.in" });
    expect(field("phone")).toHaveTextContent("+919000000001");
    expect(field("email")).toHaveTextContent("account@example.in");
    expect(card()).not.toHaveTextContent("siddharth@example.in");
  });

  it("the self card says 'Not added' when the account has no email, even if the member record has one", () => {
    mount(SELF, { accountPhone: "+919000000001", accountEmail: null });
    expect(field("email")).toHaveTextContent("Not added");
  });

  it("another member's card ignores the account's contact details", () => {
    mount(FATHER, { accountPhone: "+919000000001", accountEmail: "account@example.in" });
    expect(field("phone")).toHaveTextContent("+919812345678");
    expect(field("email")).toHaveTextContent("ramesh@example.in");
  });

  it("a very long email truncates instead of breaking the card", () => {
    const email = `${"x".repeat(100)}@example.in`;
    mount({ ...FATHER, email });
    expect(field("email")).toHaveTextContent(email);
    expect(within(field("email")).getByText(email)).toHaveClass("truncate");
  });
});

describe("MemberCard: the completion chip", () => {
  it("below 100% shows the existing profile chip with its text and ring, and no Edit profile button", () => {
    mount(SPOUSE);
    expect(screen.getByRole("button", { name: /60% complete/ })).toHaveTextContent("60% complete · Finish profile");
    expect(within(card()).getByRole("progressbar", { name: "Profile completion" })).toHaveAttribute("aria-valuenow", "60");
    expect(screen.queryByRole("button", { name: "Edit profile" })).not.toBeInTheDocument();
  });

  it("asks for the one missing field by name", () => {
    mount(FATHER);
    expect(screen.getByRole("button", { name: /80% complete/ })).toHaveTextContent("80% complete · Add PAN");
  });

  it("pressing the chip calls onEdit", () => {
    mount(SPOUSE);
    fireEvent.click(screen.getByRole("button", { name: /60% complete/ }));
    expect(handlers.onEdit).toHaveBeenCalledTimes(1);
  });

  it("at 100% the chip is replaced by an Edit profile button, which calls onEdit", () => {
    mount(SELF);
    expect(screen.queryByText(/% complete/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(handlers.onEdit).toHaveBeenCalledTimes(1);
  });
});

describe("MemberCard: Change in Account Info", () => {
  it("is on the self card only, and calls its own handler", () => {
    const view = mount(SELF);
    fireEvent.click(screen.getByRole("button", { name: "Change in Account Info" }));
    expect(handlers.onChangeInAccountInfo).toHaveBeenCalledTimes(1);
    expect(handlers.onEdit).not.toHaveBeenCalled();
    view.unmount();
    mount(SPOUSE);
    expect(screen.queryByRole("button", { name: "Change in Account Info" })).not.toBeInTheDocument();
  });
});

describe("MemberCard: Delete member and Delete all funds", () => {
  it("the self card has NO Delete member (the account holder is never removed) but does have Delete all funds", () => {
    mount(SELF);
    expect(screen.queryByRole("button", { name: /Delete .* from your family/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Delete member")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete all funds for Siddharth Surve" })).toBeInTheDocument();
  });

  it("every other card has Delete member ABOVE Delete all funds, each named after the person", () => {
    mount(SPOUSE);
    const member = screen.getByRole("button", { name: "Delete Aditi Surve from your family" });
    const funds = screen.getByRole("button", { name: "Delete all funds for Aditi Surve" });
    expect(member).toHaveTextContent("Delete member");
    expect(funds).toHaveTextContent("Delete all funds");
    expect(member.compareDocumentPosition(funds) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("both are in the negative colour and their icons are hidden from assistive technology", () => {
    mount(SPOUSE);
    for (const name of ["Delete Aditi Surve from your family", "Delete all funds for Aditi Surve"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveClass("text-[var(--neg-text)]");
      for (const icon of button.querySelectorAll("svg")) expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("each button calls its own handler and no other", () => {
    mount(SPOUSE);
    fireEvent.click(screen.getByRole("button", { name: "Delete Aditi Surve from your family" }));
    expect(handlers.onDeleteMember).toHaveBeenCalledTimes(1);
    expect(handlers.onDeleteFunds).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete all funds for Aditi Surve" }));
    expect(handlers.onDeleteFunds).toHaveBeenCalledTimes(1);
    expect(handlers.onDeleteMember).toHaveBeenCalledTimes(1);
  });

  it("when the statements could not be loaded, Delete all funds is disabled and Delete member still works", () => {
    mount(SPOUSE, { deleteFundsDisabled: true });
    expect(screen.getByRole("button", { name: "Delete all funds for Aditi Surve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Aditi Surve from your family" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Delete all funds for Aditi Surve" }));
    expect(handlers.onDeleteFunds).not.toHaveBeenCalled();
  });

  it("names the buttons sensibly for a member with no name", () => {
    mount({ ...SPOUSE, name: "" });
    expect(screen.getByRole("button", { name: "Delete this member from your family" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete all funds for this member" })).toBeInTheDocument();
  });
});

describe("MemberCard: highlight from the strip", () => {
  it("is not highlighted by default", () => {
    mount(SPOUSE);
    expect(card()).toHaveAttribute("data-highlighted", "false");
    expect(card()).not.toHaveClass("ring-2");
  });

  it("is highlighted with a ring when asked", () => {
    mount(SPOUSE, { highlighted: true });
    expect(card()).toHaveAttribute("data-highlighted", "true");
    expect(card()).toHaveClass("ring-2");
  });
});

describe("MemberCard: nothing it should not have", () => {
  it("has no Add Member, no date of birth and no menu button", () => {
    mount(SPOUSE);
    expect(card()).not.toHaveTextContent(/add member|date of birth|merge/i);
    expect(screen.queryByRole("button", { name: /menu|more actions/i })).not.toBeInTheDocument();
  });
});
