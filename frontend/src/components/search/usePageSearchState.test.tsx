import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { usePageSearchState, type SearchChip } from "./usePageSearchState";

const category: SearchChip = { kind: "category", value: "Flexi Cap" };
const member: SearchChip = { kind: "member", value: "Bela" };

function Probe() {
  const state = usePageSearchState("overview");
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  return <>
    <output data-testid="text">{state.text}</output>
    <output data-testid="chips">{JSON.stringify(state.chips)}</output>
    <output data-testid="address">{location.pathname + location.search}</output>
    <output data-testid="navigation">{navigationType}</output>
    <button onClick={() => state.setText("Example Growth Fund")}>Set text</button>
    <button onClick={() => state.setText("")}>Empty text</button>
    <button onClick={() => state.addChip(category)}>Add category</button>
    <button onClick={() => state.addChip(member)}>Add member</button>
    <button onClick={() => state.removeChip(category)}>Remove category</button>
    <button onClick={state.clear}>Clear</button>
    <button onClick={() => { void navigate(-1); }}>Back</button>
  </>;
}

function mount(search = "") {
  return render(<MemoryRouter initialEntries={["/previous", `/funds${search}`]} initialIndex={1}>
    <Probe />
  </MemoryRouter>);
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const params = () => new URL(screen.getByTestId("address").textContent ?? "", "https://example.test").searchParams;
const chips = () => JSON.parse(screen.getByTestId("chips").textContent ?? "[]") as SearchChip[];

afterEach(cleanup);

describe("usePageSearchState", () => {
  it("reads q and f from the address", () => {
    mount("?q=Example+Growth+Fund&f=category:Flexi+Cap&f=member:Bela&f=period:1y");
    expect(screen.getByTestId("text").textContent).toBe("Example Growth Fund");
    expect(chips()).toEqual([category, member, { kind: "period", value: "1y" }]);
  });

  it("setText writes q with replace and keeps sort and dir", () => {
    mount("?sort=name&dir=asc&extra=kept&f=member:Bela");
    click("Set text");
    expect(params().get("q")).toBe("Example Growth Fund");
    expect(params().get("sort")).toBe("name");
    expect(params().get("dir")).toBe("asc");
    expect(params().get("extra")).toBe("kept");
    expect(params().getAll("f")).toEqual(["member:Bela"]);
    expect(params().has("pageKey")).toBe(false);
    expect(screen.getByTestId("navigation").textContent).toBe("REPLACE");
  });

  it("an empty text removes q", () => {
    mount("?q=Example&sort=name&f=member:Bela");
    click("Empty text");
    expect(params().has("q")).toBe(false);
    expect(params().getAll("f")).toEqual(["member:Bela"]);
    expect(screen.getByTestId("text").textContent).toBe("");
  });

  it("addChip appends and ignores a duplicate", () => {
    mount("?q=Example&f=member:Bela&sort=name");
    click("Add category");
    click("Add category");
    expect(chips()).toEqual([member, category]);
    expect(params().getAll("f")).toEqual(["member:Bela", "category:Flexi Cap"]);
    expect(params().get("q")).toBe("Example");
    expect(params().get("sort")).toBe("name");
  });

  it("removeChip removes only that chip", () => {
    mount("?q=Example&sort=name&f=category:Flexi+Cap&f=member:Bela&f=category:Large+Cap");
    click("Remove category");
    expect(chips()).toEqual([member, { kind: "category", value: "Large Cap" }]);
    expect(params().getAll("f")).toEqual(["member:Bela", "category:Large Cap"]);
    expect(params().get("q")).toBe("Example");
    expect(params().get("sort")).toBe("name");
  });

  it("clear removes q and all f and keeps sort", () => {
    mount("?q=Example&f=member:Bela&f=period:1y&f=broken&sort=name&dir=asc&extra=kept");
    click("Clear");
    expect(params().has("q")).toBe(false);
    expect(params().has("f")).toBe(false);
    expect(Object.fromEntries(params())).toEqual({ sort: "name", dir: "asc", extra: "kept" });
    expect(chips()).toEqual([]);
    expect(screen.getByTestId("text").textContent).toBe("");
  });

  it("a malformed f is ignored", () => {
    mount("?f=broken&f=unknown:value&f=member:&f=:value&f=member:Bela");
    expect(chips()).toEqual([member]);
  });

  it("a value may contain a colon", () => {
    mount("?f=category%3AEquity%3AFlexi%20Cap");
    expect(chips()).toEqual([{ kind: "category", value: "Equity:Flexi Cap" }]);
  });

  it("history length does not grow on any write", () => {
    mount("?sort=name&dir=asc");
    const length = window.history.length;
    for (const action of ["Set text", "Add category", "Add member", "Remove category", "Empty text", "Clear"]) {
      click(action);
      expect(window.history.length).toBe(length);
      expect(screen.getByTestId("navigation").textContent).toBe("REPLACE");
      expect(params().get("sort")).toBe("name");
      expect(params().get("dir")).toBe("asc");
    }
    click("Back");
    expect(screen.getByTestId("address").textContent).toBe("/previous");
  });
});
