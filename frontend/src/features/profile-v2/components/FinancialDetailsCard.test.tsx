import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinancialDetailsCard } from "./FinancialDetailsCard";

// The two dialogs have their own tests; here they are stand-ins that show what they were given.
vi.mock("./GoalsDialog", () => ({
  GoalsDialog: (props: { stored: readonly string[] | null | undefined; onClose: () => void }) => (
    <div role="dialog" aria-label="stub goals">
      <output data-testid="stub-stored">{JSON.stringify(props.stored ?? null)}</output>
      <button type="button" onClick={props.onClose}>stub close goals</button>
    </div>
  ),
}));
vi.mock("./InvestorTypeDialog", () => ({
  InvestorTypeDialog: (props: { stored: string | null; onClose: () => void }) => (
    <div role="dialog" aria-label="stub investor">
      <output data-testid="stub-stored">{JSON.stringify(props.stored)}</output>
      <button type="button" onClick={props.onClose}>stub close investor</button>
    </div>
  ),
}));

const chipTexts = () => screen.queryAllByTestId("goal-chip").map(chip => chip.textContent);

beforeEach(() => { vi.clearAllMocks(); });

describe("FinancialDetailsCard: investor type", () => {
  it("has the heading and the subtitle", () => {
    render(<FinancialDetailsCard investorType="mixed" goals={["consolidated_view"]} />);
    expect(screen.getByRole("heading", { level: 2, name: "Financial Details" })).toBeInTheDocument();
    expect(screen.getByText("From your onboarding answers. Used to personalise insights.")).toBeInTheDocument();
  });

  it.each([
    ["self_directed", "Mostly on my own"],
    ["advisor_assisted", "Through an advisor or distributor"],
    ["mixed", "A mix of both"],
    ["beginner", "Just getting started"],
    ["family_office", "Family office"],
  ])("shows %s as %j", (code, label) => {
    render(<FinancialDetailsCard investorType={code} goals={null} />);
    expect(screen.getByTestId("row-investor-type")).toHaveTextContent(`Investor type${label}`);
  });

  it("shows 'Not answered' when there is no investor type", () => {
    render(<FinancialDetailsCard investorType={null} goals={["consolidated_view"]} />);
    expect(screen.getByTestId("row-investor-type")).toHaveTextContent("Investor typeNot answered");
  });
});

describe("FinancialDetailsCard: goals", () => {
  it("shows the known goals as chips with their onboarding titles, in onboarding order, not stored order", () => {
    render(<FinancialDetailsCard investorType="mixed" goals={["family_management", "consolidated_view"]} />);
    expect(chipTexts()).toEqual(["Consolidated portfolio view", "Family wealth tracking"]);
    for (const chip of screen.getAllByTestId("goal-chip")) {
      expect(chip).toHaveAttribute("data-unknown", "false");
      expect(chip.className).not.toContain("border-dashed");
    }
  });

  it("collapses all four known goals into one 'All of it' chip", () => {
    render(
      <FinancialDetailsCard
        investorType="mixed"
        goals={["performance_comparison", "family_management", "understand_holdings", "consolidated_view"]}
      />,
    );
    expect(chipTexts()).toEqual(["All of it"]);
  });

  it("keeps a code it does not know, humanised, in a dashed chip after the known ones", () => {
    render(<FinancialDetailsCard investorType="mixed" goals={["retirement_planning", "consolidated_view"]} />);
    expect(chipTexts()).toEqual(["Consolidated portfolio view", "Retirement planning"]);
    const unknown = screen.getAllByTestId("goal-chip")[1];
    expect(unknown).toHaveAttribute("data-unknown", "true");
    expect(unknown.className).toContain("border-dashed");
    expect(unknown).toHaveAttribute("title", "A newer option this screen does not know yet");
  });

  it("shows 'All of it' and the unknown chip when all four known goals and an unknown one are stored", () => {
    render(
      <FinancialDetailsCard
        investorType={null}
        goals={["consolidated_view", "understand_holdings", "family_management", "performance_comparison", "retirement_planning"]}
      />,
    );
    expect(chipTexts()).toEqual(["All of it", "Retirement planning"]);
  });

  it.each([[null], [undefined], [[]]])("shows 'Not answered' and an Add goals button for %j", goals => {
    render(<FinancialDetailsCard investorType="mixed" goals={goals} />);
    expect(chipTexts()).toEqual([]);
    expect(screen.getByTestId("row-goals")).toHaveTextContent("GoalsNot answered");
    expect(screen.getByRole("button", { name: "Add goals" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit goals" })).not.toBeInTheDocument();
  });

  it("offers Edit goals (not Add goals) when goals are stored", () => {
    render(<FinancialDetailsCard investorType="mixed" goals={["consolidated_view"]} />);
    expect(screen.getByRole("button", { name: "Edit goals" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add goals" })).not.toBeInTheDocument();
  });
});

describe("FinancialDetailsCard: the greyed rows", () => {
  it("lists the six future fields in order, each marked Coming soon, with no lock icon", () => {
    const { container } = render(<FinancialDetailsCard investorType="mixed" goals={null} />);
    const list = screen.getByRole("list", { name: "Financial details coming soon" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map(row => row.textContent)).toEqual([
      "OccupationComing soon",
      "IndustryComing soon",
      "Annual income rangeComing soon",
      "Net worth rangeComing soon",
      "Risk profileComing soon",
      "Investment experienceComing soon",
    ]);
    for (const row of rows) expect(row).toHaveAttribute("data-status", "soon");
    expect(container.querySelector(".lucide-lock")).toBeNull();
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    expect(within(list).queryAllByRole("link")).toHaveLength(0);
  });
});

describe("FinancialDetailsCard: editing", () => {
  it("opens the investor type dialog with the stored value, and closes it", () => {
    render(<FinancialDetailsCard investorType="mixed" goals={["consolidated_view"]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit investor type" }));
    expect(screen.getByRole("dialog", { name: "stub investor" })).toBeInTheDocument();
    expect(screen.getByTestId("stub-stored")).toHaveTextContent('"mixed"');
    fireEvent.click(screen.getByRole("button", { name: "stub close investor" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the goals dialog with the stored list as it is (unknown codes included), and closes it", () => {
    render(<FinancialDetailsCard investorType="mixed" goals={["retirement_planning", "consolidated_view"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit goals" }));
    expect(screen.getByRole("dialog", { name: "stub goals" })).toBeInTheDocument();
    expect(screen.getByTestId("stub-stored")).toHaveTextContent('["retirement_planning","consolidated_view"]');
    fireEvent.click(screen.getByRole("button", { name: "stub close goals" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the goals dialog from Add goals when nothing is stored", () => {
    render(<FinancialDetailsCard investorType={null} goals={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Add goals" }));
    expect(screen.getByTestId("stub-stored")).toHaveTextContent("null");
  });

  it("has only the two edit buttons and never two dialogs at once", () => {
    render(<FinancialDetailsCard investorType="mixed" goals={["consolidated_view"]} />);
    expect(screen.getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(["Edit investor type", "Edit goals"]);
    fireEvent.click(screen.getByRole("button", { name: "Edit investor type" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit goals" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "stub goals" })).toBeInTheDocument();
  });
});
