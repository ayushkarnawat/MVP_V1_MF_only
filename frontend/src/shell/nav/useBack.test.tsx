import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { useBack } from "./useBack";

function Harness() {
  const back = useBack("/profile/settings");
  const location = useLocation();
  return (
    <>
      <output data-testid="where">{location.pathname}</output>
      <button type="button" onClick={back}>go back</button>
    </>
  );
}
const mount = (entries: string[], index = entries.length - 1) =>
  render(<MemoryRouter initialEntries={entries} initialIndex={index}><Harness /></MemoryRouter>);

describe("useBack (QA fixes, B3)", () => {
  it("goes back one screen when the person arrived from another screen in the app", () => {
    mount(["/portfolio/mutual-funds", "/profile/settings/import-history"]);
    fireEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/portfolio/mutual-funds");
  });
  it("goes to the fallback when this is the first screen of the visit (a pasted link, a reload)", () => {
    mount(["/profile/settings/import-history"]);
    fireEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/profile/settings");
  });
  it("the fallback replaces the entry, so Back from Settings does not return to Import History", () => {
    mount(["/profile/settings/import-history"]);
    fireEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/profile/settings");
  });
  it("returns a function that can be called more than once", () => {
    mount(["/a", "/b", "/profile/settings/import-history"]);
    fireEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/b");
    fireEvent.click(screen.getByRole("button", { name: "go back" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/a");
  });
});
