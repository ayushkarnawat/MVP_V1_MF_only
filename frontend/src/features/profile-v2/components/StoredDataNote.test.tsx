import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoredDataNote } from "./StoredDataNote";

describe("StoredDataNote (profile spec section 7; the lawyer reviews this text before launch)", () => {
  it("is a card titled 'What we store' with the sub-title 'In plain words.'", () => {
    render(<StoredDataNote />);
    const card = screen.getByTestId("stored-data-card");
    expect(within(card).getByRole("heading", { level: 2, name: "What we store" })).toBeInTheDocument();
    expect(within(card).getByText("In plain words.")).toBeInTheDocument();
  });

  it("says exactly these four things, in this order", () => {
    render(<StoredDataNote />);
    const items = within(screen.getByRole("list", { name: "What we store" })).getAllByRole("listitem");
    expect(items.map(item => item.textContent)).toEqual([
      "Your PAN is stored encrypted.",
      "The statement file you upload is kept for 30 days.",
      "Your imported portfolio data is kept until you delete it or delete your account.",
      "If you delete your account, your data is removed after a 30-day grace period.",
    ]);
  });

  it("hides the tick icons from assistive technology", () => {
    render(<StoredDataNote />);
    const icons = screen.getByRole("list", { name: "What we store" }).querySelectorAll("svg");
    expect(icons).toHaveLength(4);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("does not show the mockup's reviewer note ('Draft text: ...'), which is not for customers", () => {
    render(<StoredDataNote />);
    expect(screen.queryByText(/draft text/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lawyer/i)).not.toBeInTheDocument();
  });

  it("is static: no button, no link, no field", () => {
    render(<StoredDataNote />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
