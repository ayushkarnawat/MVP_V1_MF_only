import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEV_SCREENS } from "./devScreens";
import { DevIndex } from "./DevIndex";

describe("the dev index lists screens 4 to 6 (S6 tasks 6.12 to 6.14)", () => {
  it("has an entry for each", () => {
    expect(DEV_SCREENS.map((entry) => entry.id)).toEqual(expect.arrayContaining(["signup-profile", "signup-connect", "signup-all-set"]));
  });
  it("renders them with fake props", () => {
    render(<DevIndex />);
    expect(screen.getByRole("heading", { level: 2, name: "Sign-up, step 4 (investor profile)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "What would you like to connect first?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Getting your accounts ready" })).toBeInTheDocument();
  });
});
