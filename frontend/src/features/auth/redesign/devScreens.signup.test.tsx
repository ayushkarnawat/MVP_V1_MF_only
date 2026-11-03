import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEV_SCREENS } from "./devScreens";
import { DevIndex } from "./DevIndex";

describe("the dev index lists the sign-up screens (S6 tasks 6.8 to 6.10)", () => {
  it("has an entry for each sign-up screen and state", () => {
    expect(DEV_SCREENS.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["signup-phone", "signup-phone-exists", "signup-code", "signup-account", "signup-account-locked", "signup-email-code"]),
    );
  });
  it("renders them all with fake props", () => {
    render(<DevIndex />);
    expect(screen.getByRole("heading", { level: 2, name: "Sign-up, step 1 (Let's get started)" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1, name: "Create your account" }).length).toBeGreaterThanOrEqual(2);
  });
});
