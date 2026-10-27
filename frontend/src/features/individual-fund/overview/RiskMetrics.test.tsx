import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../__support__/deferred";
import { IDS, fixture } from "../fixtures";
import type { RiskResponse, Unavailable } from "../types";
import { RiskMetrics } from "./RiskMetrics";

const api = vi.hoisted(() => ({ risk: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const equity = () => fixture<RiskResponse>("risk_equity");
const ROWS = ["volatility", "max_drawdown", "sharpe", "beta"] as const;

function mount() {
  return render(<RiskMetrics schemeId={IDS.scheme} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.risk.mockImplementation(() => Promise.resolve(equity()));
});

describe("RiskMetrics", () => {
  it("asks for the fund's risk figures once, with no scope", async () => {
    mount();
    await screen.findByTestId("risk-row-volatility");
    expect(api.risk).toHaveBeenCalledTimes(1);
    expect(api.risk).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
  });

  it("has the heading Risk Metrics (3Y) and shows a loading status until the answer arrives", async () => {
    const pending = deferred<RiskResponse>();
    api.risk.mockReturnValue(pending.promise);
    mount();
    expect(screen.getByRole("heading", { name: "Risk Metrics (3Y)" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading risk metrics" })).toBeInTheDocument();
    pending.resolve(equity());
    expect(await screen.findByTestId("risk-row-volatility")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading risk metrics" })).toBeNull();
  });

  it("test_four_rows_with_band_chips_and_neutral_indigo_bar: volatility, drawdown, Sharpe and beta, each with its value, bar and band chip", async () => {
    mount();
    await screen.findByTestId("risk-row-volatility");
    expect(screen.getAllByRole("button").map(button => button.getAttribute("data-testid"))).toEqual(ROWS.map(key => `risk-row-${key}`));
    const labels = ["Volatility", "Maximum drawdown", "Sharpe ratio", "Beta (vs benchmark)"];
    ROWS.forEach((key, index) => expect(screen.getByTestId(`risk-row-${key}`)).toHaveTextContent(labels[index]));
    expect(ROWS.map(key => screen.getByTestId(`risk-${key}-value`).textContent)).toEqual(["14.2%", "-18.4%", "0.82", "0.98"]);
    expect(ROWS.map(key => screen.getByTestId(`risk-${key}-chip`).textContent)).toEqual(["Moderate", "Moderate", "Fair", "Market-like"]);
    expect(ROWS.map(key => screen.getByTestId(`risk-${key}-chip`).getAttribute("data-tone"))).toEqual(["warn", "warn", "warn", "neu"]);
    expect(screen.getByTestId("risk-volatility-chip").className).toContain("bg-[var(--warn-bg)]");
    expect(screen.getByTestId("risk-volatility-chip").className).toContain("text-[var(--warn-text)]");
    expect(screen.getByTestId("risk-beta-chip").className).toContain("text-[var(--ui-text-muted)]");
    // The bar is one neutral indigo colour whatever the band is; only its length carries the value.
    for (const key of ROWS) expect(screen.getByTestId(`risk-${key}-bar`).className).toContain("bg-[var(--c4)]");
    expect(ROWS.map(key => screen.getByTestId(`risk-${key}-bar`).style.width)).toEqual(["47.3%", "40.9%", "41%", "65.3%"]);
  });

  it("the bands follow the API's tones: good is green, bad is red", async () => {
    const body = equity();
    body.volatility = { value: "9.0000", band: "Low", tone: "pos" };
    body.max_drawdown = { value: "-40.0000", band: "High", tone: "neg" };
    api.risk.mockResolvedValue(body);
    mount();
    await screen.findByTestId("risk-row-volatility");
    expect(screen.getByTestId("risk-volatility-chip").className).toContain("bg-[var(--pos-bg)]");
    expect(screen.getByTestId("risk-volatility-chip").className).toContain("text-[var(--pos-text)]");
    expect(screen.getByTestId("risk-max_drawdown-chip").className).toContain("bg-[var(--neg-bg)]");
    expect(screen.getByTestId("risk-max_drawdown-chip").className).toContain("text-[var(--neg-text)]");
  });

  it("test_window_and_rate_footnote_printed: the dates, the number of daily points and the risk-free rate", async () => {
    mount();
    expect(await screen.findByTestId("risk-footnote")).toHaveTextContent("23 Oct 2023 to 23 Oct 2026, 1095 daily points. Risk-free rate 6.5%.");
    expect(screen.queryByTestId("risk-life-note")).toBeNull();
  });

  it("test_short_history_prints_life_window: a fund younger than three years says its whole history is used, and a beta without shared dates is a dash with no chip", async () => {
    api.risk.mockResolvedValue(fixture<RiskResponse>("risk_life_window"));
    mount();
    await screen.findByTestId("risk-row-volatility");
    expect(screen.getByRole("heading", { name: "Risk Metrics (since launch)" })).toBeInTheDocument();
    expect(screen.getByTestId("risk-footnote")).toHaveTextContent("20 Mar 2025 to 23 Oct 2026, 582 daily points. Risk-free rate 6.5%.");
    expect(screen.getByTestId("risk-life-note")).toHaveTextContent("This fund is younger than 3 years, so its whole history is used.");
    expect(screen.getByTestId("risk-beta-value")).toHaveTextContent("—");
    expect(screen.getByTestId("risk-beta-value")).toHaveAttribute("title", "Not enough overlapping history with the benchmark.");
    expect(screen.queryByTestId("risk-beta-chip")).toBeNull();
    expect(screen.getByTestId("risk-volatility-chip")).toHaveTextContent("Low");
    expect(screen.getByTestId("risk-sharpe-chip")).toHaveTextContent("Good");
  });

  it("test_under_one_year_shows_not_enough_history: the no_history answer reads as a short message, not as a failure", async () => {
    api.risk.mockResolvedValue(fixture<Unavailable>("risk_no_history"));
    mount();
    expect(await screen.findByTestId("risk-unavailable")).toHaveTextContent("Not enough history to show risk figures yet. About a year of prices is needed.");
    expect(screen.queryByTestId("risk-row-volatility")).toBeNull();
    expect(screen.getByRole("heading", { name: "Risk Metrics (3Y)" })).toBeInTheDocument();
  });

  it("any other unavailable reason uses the shared wording", async () => {
    api.risk.mockResolvedValue({ status: "unavailable", reason: "something_new" });
    mount();
    expect(await screen.findByTestId("risk-unavailable")).toHaveTextContent("Not available right now.");
  });

  it("test_non_equity_hides_beta_row: a fund with no benchmark has no beta row at all", async () => {
    const body = equity();
    body.beta = { value: null, band: null, tone: null };
    body.beta_reason = "no_benchmark";
    api.risk.mockResolvedValue(body);
    mount();
    await screen.findByTestId("risk-row-volatility");
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByTestId("risk-row-beta")).toBeNull();
  });

  it("test_band_null_hides_chip_keeps_value: a non-equity fund shows its figures without band chips", async () => {
    const body = equity();
    for (const key of ROWS) body[key] = { ...body[key], band: null, tone: null };
    api.risk.mockResolvedValue(body);
    mount();
    await screen.findByTestId("risk-row-volatility");
    for (const key of ROWS) expect(screen.queryByTestId(`risk-${key}-chip`)).toBeNull();
    expect(ROWS.map(key => screen.getByTestId(`risk-${key}-value`).textContent)).toEqual(["14.2%", "-18.4%", "0.82", "0.98"]);
  });

  it("a Sharpe ratio that cannot be computed reads a dash with an empty bar", async () => {
    const body = equity();
    body.sharpe = { value: null, band: null, tone: null };
    api.risk.mockResolvedValue(body);
    mount();
    await screen.findByTestId("risk-row-sharpe");
    expect(screen.getByTestId("risk-sharpe-value")).toHaveTextContent("—");
    expect(screen.getByTestId("risk-sharpe-bar").style.width).toBe("0%");
    expect(screen.queryByTestId("risk-sharpe-chip")).toBeNull();
  });

  it("test_row_opens_definition_popup_with_enter: Enter, Space and click open the row's definition, Escape closes it", async () => {
    mount();
    const row = await screen.findByTestId("risk-row-volatility");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.keyDown(row, { key: "Enter" });
    let dialog = screen.getByRole("dialog", { name: "Volatility" });
    expect(within(dialog).getByTestId("risk-definition")).toHaveTextContent("How much the fund's daily returns vary, annualised.");
    const value = (label: string) => within(dialog).getByText(label, { selector: "dt" }).nextElementSibling!.textContent;
    expect(value("Value")).toBe("14.2%");
    expect(value("Band")).toBe("Moderate");
    expect(value("Window")).toBe("23 Oct 2023 to 23 Oct 2026");
    expect(value("Daily points")).toBe("1095");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(screen.getByTestId("risk-row-max_drawdown"), { key: " " });
    expect(screen.getByRole("dialog", { name: "Maximum drawdown" })).toHaveTextContent("The largest fall from a peak to a low in the window.");
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

    fireEvent.click(screen.getByTestId("risk-row-sharpe"));
    dialog = screen.getByRole("dialog", { name: "Sharpe ratio" });
    expect(dialog).toHaveTextContent("Return above the risk-free rate for each unit of volatility.");
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

    fireEvent.click(screen.getByTestId("risk-row-beta"));
    expect(screen.getByRole("dialog", { name: "Beta (vs benchmark)" })).toHaveTextContent("How far the fund moves with its benchmark: 1.0 moves with it.");
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

    fireEvent.keyDown(row, { key: "a" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the definition popup leaves out the band row when there is no band", async () => {
    const body = equity();
    body.volatility = { value: "14.2000", band: null, tone: null };
    api.risk.mockResolvedValue(body);
    mount();
    fireEvent.click(await screen.findByTestId("risk-row-volatility"));
    expect(within(screen.getByRole("dialog")).queryByText("Band", { selector: "dt" })).toBeNull();
  });

  it("a failed request shows its own error with Retry, and Retry asks again", async () => {
    api.risk.mockRejectedValueOnce(new Error("down"));
    mount();
    expect(await screen.findByText("Couldn't load risk metrics.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Risk Metrics (3Y)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("risk-row-volatility")).toBeInTheDocument();
    expect(api.risk).toHaveBeenCalledTimes(2);
  });
});
