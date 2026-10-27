import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../__support__/deferred";
import { IDS, fixture } from "../fixtures";
import type { ManagerResponse, Unavailable } from "../types";
import { FundManagerCard } from "./FundManagerCard";

const api = vi.hoisted(() => ({ manager: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const manager = () => fixture<ManagerResponse>("manager");
const mount = () => render(<FundManagerCard schemeId={IDS.scheme} />);

beforeEach(() => {
  vi.clearAllMocks();
  api.manager.mockImplementation(() => Promise.resolve(manager()));
});

describe("FundManagerCard", () => {
  it("asks for the manager once, with no scope, and shows a loading status until it arrives", async () => {
    const pending = deferred<ManagerResponse>();
    api.manager.mockReturnValue(pending.promise);
    mount();
    expect(screen.getByRole("heading", { name: "Fund Manager and Strategy" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading fund manager" })).toBeInTheDocument();
    pending.resolve(manager());
    expect(await screen.findByTestId("manager-0")).toBeInTheDocument();
    expect(api.manager).toHaveBeenCalledTimes(1);
    expect(api.manager).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
  });

  it("test_initials_tile_name_role_since_and_tenure (M8 A): one row per manager, in the API order", async () => {
    mount();
    await screen.findByTestId("manager-0");
    const list = screen.getByRole("list", { name: "Fund managers" });
    expect(within(list).getAllByRole("button").map(row => row.getAttribute("data-testid"))).toEqual(["manager-0", "manager-1"]);
    const first = screen.getByTestId("manager-0");
    expect(within(first).getByTestId("manager-initials")).toHaveTextContent("AK");
    expect(within(first).getByTestId("manager-initials")).toHaveAttribute("aria-hidden", "true");
    expect(within(first).getByTestId("manager-name")).toHaveTextContent("A. Kumar");
    expect(within(first).getByTestId("manager-role")).toHaveTextContent("Fund Manager - Equity");
    expect(within(first).getByTestId("manager-since")).toHaveTextContent("Managing since 01 Mar 2019");
    expect(within(first).getByTestId("manager-tenure")).toHaveTextContent("7.6 years");
    const second = screen.getByTestId("manager-1");
    expect(within(second).getByTestId("manager-initials")).toHaveTextContent("RM");
    expect(within(second).getByTestId("manager-name")).toHaveTextContent("R. Menon");
    expect(within(second).getByTestId("manager-since")).toHaveTextContent("Managing since 15 Jun 2022");
    expect(within(second).getByTestId("manager-tenure")).toHaveTextContent("4.4 years");
    for (const row of [first, second]) {
      expect(row).toHaveAttribute("tabindex", "0");
      expect(row).toHaveAttribute("aria-haspopup", "dialog");
    }
  });

  it("a manager with no start date or tenure shows the name and role only", async () => {
    const body = manager();
    body.managers = [{ name: "Sunita Rao", role: "Fund Manager", managing_since: "", tenure_years: "" }];
    api.manager.mockImplementation(() => Promise.resolve(body));
    mount();
    const row = await screen.findByTestId("manager-0");
    expect(within(row).getByTestId("manager-name")).toHaveTextContent("Sunita Rao");
    expect(within(row).getByTestId("manager-initials")).toHaveTextContent("SR");
    expect(within(row).queryByTestId("manager-since")).toBeNull();
    expect(within(row).queryByTestId("manager-tenure")).toBeNull();
  });

  it("test_approach_and_style_chips_disabled_with_tooltip: both are greyed Coming soon, with no click handler", async () => {
    mount();
    await screen.findByTestId("manager-0");
    expect(screen.getByText("Investment approach")).toBeInTheDocument();
    expect(screen.getByText("Investment style")).toBeInTheDocument();
    for (const id of ["manager-approach-chip", "manager-style-chip"]) {
      const chip = screen.getByTestId(id);
      expect(chip).toHaveTextContent("Coming soon");
      expect(chip).toHaveAttribute("aria-disabled", "true");
      expect(chip).toHaveAttribute("title", "Coming soon");
      expect(chip.className).toContain("cursor-not-allowed");
      fireEvent.click(chip);
    }
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("test_manager_unavailable_message: no_manager_data prints the shared sentence and hides the chips and the list", async () => {
    api.manager.mockImplementation(() => Promise.resolve(fixture<Unavailable>("manager_none")));
    mount();
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("Manager details not available for this fund house.");
    expect(screen.getByRole("heading", { name: "Fund Manager and Strategy" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Fund managers" })).toBeNull();
    expect(screen.queryByTestId("manager-approach-chip")).toBeNull();
  });

  it("a ready answer with no managers says the same thing instead of an empty list", async () => {
    const body = manager();
    body.managers = [];
    api.manager.mockImplementation(() => Promise.resolve(body));
    mount();
    expect(await screen.findByTestId("manager-empty")).toHaveTextContent("Manager details not available for this fund house.");
    expect(screen.queryByRole("list", { name: "Fund managers" })).toBeNull();
  });

  it("test_manager_click_opens_popup: click, Enter and Space open the popup of that manager, with the name, role, start date, tenure and the coming-soon note", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("manager-1"));
    const dialog = screen.getByRole("dialog", { name: "Fund manager" });
    const rows = within(dialog).getAllByTestId("manager-popup-row").map(row => [within(row).getByRole("term").textContent, within(row).getByRole("definition").textContent]);
    expect(rows).toEqual([
      ["Name", "R. Menon"], ["Role", "Fund Manager - Debt"], ["Managing since", "15 Jun 2022"], ["Tenure", "4.4 years"], ["Details as of", "01 Sep 2026"],
    ]);
    expect(within(dialog).getByTestId("manager-note")).toHaveTextContent("Photo, biography and strategy are coming soon.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(screen.getByTestId("manager-0"), { key: "Enter" });
    expect(within(screen.getByRole("dialog", { name: "Fund manager" })).getAllByTestId("manager-popup-row")[0]).toHaveTextContent("NameA. Kumar");
    fireEvent.keyDown(window, { key: "Escape" });
    const spaceNotPrevented = fireEvent.keyDown(screen.getByTestId("manager-1"), { key: " " });
    expect(spaceNotPrevented).toBe(false);
    expect(screen.getByRole("dialog", { name: "Fund manager" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(screen.getByTestId("manager-0"), { key: "a" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a failed request shows the error with Retry, and Retry asks again", async () => {
    api.manager.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(manager()));
    mount();
    expect(await screen.findByText("Couldn't load fund manager.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("manager-0")).toBeInTheDocument();
    expect(api.manager).toHaveBeenCalledTimes(2);
  });

  it("is a card with 20 px padding", async () => {
    mount();
    await screen.findByTestId("manager-0");
    const card = screen.getByRole("heading", { name: "Fund Manager and Strategy" }).closest("section")!;
    expect(card.className).toContain("p-5");
  });
});
