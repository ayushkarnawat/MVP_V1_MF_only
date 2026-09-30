import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SamePersonDialog } from "./SamePersonDialog";

describe("SamePersonDialog name_only (staging-QA 5B)", () => {
  it("asks whether the statement's person is the member you already have", () => {
    const onYes = vi.fn();
    const onNo = vi.fn();
    render(
      <SamePersonDialog isOpen kind="name_only" memberName="Kavita Shanbhag" memberFundCount={1}
        enteredPanMasked="" statementPanMasked="BN******1M" statementName="Kavita Shanbhag"
        onYes={onYes} onNo={onNo} />,
    );
    expect(screen.getByText("Is this the Kavita Shanbhag you already have?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This statement shows Kavita Shanbhag with PAN BN******1M. Your family list already has Kavita Shanbhag · PAN not on statement · 1 fund.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, same person" }));
    fireEvent.click(screen.getByRole("button", { name: "No, add as a new person" }));
    expect(onYes).toHaveBeenCalledTimes(1);
    expect(onNo).toHaveBeenCalledTimes(1);
  });

  it("keeps the typed-PAN wording by default (U13)", () => {
    render(
      <SamePersonDialog isOpen memberName="Ramesh Sharma" enteredPanMasked="BX******8L"
        statementPanMasked="BX******9M" onYes={vi.fn()} onNo={vi.fn()} />,
    );
    expect(screen.getByText("Is this Ramesh Sharma?")).toBeInTheDocument();
  });
});
