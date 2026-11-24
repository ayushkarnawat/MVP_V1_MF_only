import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SECTION_LISTS } from "../../lib/pageSections";
import { ExportDialog } from "./ExportDialog";
import type { ExportDialogProps } from "./exportTypes";

const MEMBERS = [
  { id: "m1", name: "Asha Rao" },
  { id: "m2", name: "Ravi Rao" },
  { id: "m3", name: "Meera Rao" },
];

function makeProps(overrides: Partial<ExportDialogProps> = {}): ExportDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    stage: "choose",
    members: MEMBERS,
    currentTab: "overview",
    defaults: { who: "family", preset: "full", showFolios: true },
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onKeepWorking: vi.fn(),
    progress: { subtitle: "", percent: 0, rows: [] },
    ready: { fileName: "Unifolio-portfolio-report-2026-11-13.pdf", chips: [] },
    onDownloadAgain: vi.fn(),
    onExportAnother: vi.fn(),
    onDone: vi.fn(),
    failed: { code: null, canTryFewer: false, canExportMember: false },
    onTryAgain: vi.fn(),
    onFewerSections: vi.fn(),
    onPrintInstead: vi.fn(),
    onExportMember: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("ExportDialog — stage 1 (choose)", () => {
  it("lists Family Combined with the member count and each member, and omits Family Combined for one member", () => {
    const { rerender } = render(<ExportDialog {...makeProps()} />);
    const whoGroup = screen.getByRole("radiogroup", { name: "Who is it for" });
    expect(within(whoGroup).getByRole("radio", { name: "Family Combined (3 members)" })).toBeChecked();
    expect(within(whoGroup).getByRole("radio", { name: "Asha Rao" })).toBeInTheDocument();
    expect(within(whoGroup).getByRole("radio", { name: "Ravi Rao" })).toBeInTheDocument();
    expect(within(whoGroup).getByRole("radio", { name: "Meera Rao" })).toBeInTheDocument();

    rerender(
      <ExportDialog
        {...makeProps({
          members: [{ id: "m1", name: "Asha Rao" }],
          defaults: { who: "m1", preset: "full", showFolios: true },
        })}
      />,
    );
    expect(screen.queryByText(/Family Combined/)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Asha Rao" })).toBeChecked();
  });

  it("This tab is offered only when currentTab is set", () => {
    const { rerender } = render(<ExportDialog {...makeProps({ currentTab: "overview" })} />);
    const presetGroup = screen.getByRole("radiogroup", { name: "What to include" });
    expect(within(presetGroup).getByRole("radio", { name: "This tab" })).toBeInTheDocument();

    rerender(<ExportDialog {...makeProps({ currentTab: null })} />);
    expect(screen.queryByRole("radio", { name: "This tab" })).not.toBeInTheDocument();
  });

  it("Full report ticks every tab; This tab ticks only that tab; ticking a row switches the pill to Custom", () => {
    render(<ExportDialog {...makeProps({ currentTab: "performance" })} />);
    expect(screen.getByRole("checkbox", { name: /Overview/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Performance/ })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "This tab" }));
    expect(screen.getByRole("checkbox", { name: /Overview/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Performance/ })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: /Overview/ }));
    expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
  });

  it("tab rows show counts and a mixed state; expanding shows that tab's sections from SECTION_LISTS", () => {
    render(<ExportDialog {...makeProps()} />);
    expect(screen.getAllByText(`(${SECTION_LISTS.overview.length})`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`(${SECTION_LISTS.performance.length})`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`(${SECTION_LISTS.analytics.length})`).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Expand Overview sections" }));
    for (const sec of SECTION_LISTS.overview) {
      expect(screen.getByRole("checkbox", { name: sec.title })).toBeChecked();
    }

    fireEvent.click(screen.getByRole("checkbox", { name: SECTION_LISTS.overview[0].title }));
    const overviewCheckbox = screen.getByRole("checkbox", { name: /Overview/ }) as HTMLInputElement;
    expect(overviewCheckbox.indeterminate).toBe(true);
    expect(overviewCheckbox).toHaveAttribute("aria-checked", "mixed");
  });

  it("options start from defaults (folio option off when defaults.showFolios is false)", () => {
    render(
      <ExportDialog
        {...makeProps({ defaults: { who: "family", preset: "full", showFolios: false } })}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Cover page" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Data dates on every page" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Show folio numbers/ })).not.toBeChecked();
  });

  it('Export PDF is disabled with no section ticked and shows "Choose at least one section"', () => {
    render(<ExportDialog {...makeProps({ currentTab: "overview", defaults: { who: "family", preset: "tab", showFolios: true } })} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Overview/ }));
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeDisabled();
    expect(screen.getByText("Choose at least one section")).toBeInTheDocument();
  });

  it("onStart receives who, section ids in list order, and the three options", () => {
    const onStart = vi.fn();
    render(<ExportDialog {...makeProps({ currentTab: "holdings", onStart, defaults: { who: "family", preset: "tab", showFolios: true } })} />);

    fireEvent.click(screen.getByRole("radio", { name: "Ravi Rao" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Cover page" }));
    fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    expect(onStart).toHaveBeenCalledWith({
      who: "m2",
      sectionIds: SECTION_LISTS.holdings.map((s) => s.id),
      cover: false,
      dataDates: true,
      showFolios: true,
    });
  });

  it("allowedTiers hides pro sections", () => {
    const proExists = Object.values(SECTION_LISTS).flat().some((s) => s.tier === "pro");
    render(<ExportDialog {...makeProps({ allowedTiers: ["standard"] })} />);
    const expectedOverviewCount = SECTION_LISTS.overview.filter((s) => s.tier === "standard").length;
    expect(screen.getByText(`(${expectedOverviewCount})`)).toBeInTheDocument();
    if (!proExists) {
      expect(expectedOverviewCount).toBe(SECTION_LISTS.overview.length);
    }
  });
});
