import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportDialog } from "./ExportDialog";
import type { ExportDialogProps } from "./exportTypes";

function makeProps(overrides: Partial<ExportDialogProps> = {}): ExportDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    stage: "preparing",
    members: [
      { id: "m1", name: "Asha Rao" },
      { id: "m2", name: "Ravi Rao" },
    ],
    currentTab: "overview",
    defaults: { who: "family", preset: "full", showFolios: true },
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onKeepWorking: vi.fn(),
    progress: {
      subtitle: "Family Combined · Full report · 24 sections",
      percent: 58,
      rows: [
        { label: "Collected your holdings and transactions", state: "done" },
        { label: "Checked prices and data dates", state: "done", note: "12 Nov 2026" },
        { label: "Building the pages", state: "now", note: "14 of 24 sections" },
        { label: "Adding cover and contents", state: "todo" },
        { label: "Finishing the file", state: "todo" },
      ],
    },
    ready: {
      fileName: "Unifolio-portfolio-report-2026-11-13.pdf",
      chips: ["14 pages", "1.2 MB", "Family combined", "Full report"],
    },
    onDownloadAgain: vi.fn(),
    onExportAnother: vi.fn(),
    onDone: vi.fn(),
    failed: {
      code: "EXP-4F2A",
      canTryFewer: true,
      canExportMember: true,
    },
    onTryAgain: vi.fn(),
    onFewerSections: vi.fn(),
    onPrintInstead: vi.fn(),
    onExportMember: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("ExportDialog — stages 2 to 4", () => {
  it("preparing shows the title, the subtitle, each stage row with the right state, the progress bar value, and the footnote", () => {
    render(<ExportDialog {...makeProps()} />);
    expect(screen.getByText("Preparing your report")).toBeInTheDocument();
    expect(screen.getByText("Family Combined · Full report · 24 sections")).toBeInTheDocument();

    const nowRow = screen.getByText("Building the pages").closest("[data-stage-state]");
    expect(nowRow).toHaveAttribute("data-stage-state", "now");
    expect(screen.getByText("14 of 24 sections")).toBeInTheDocument();

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "58");

    expect(
      screen.getByText("This can take about a minute. You can keep using Unifolio. Nothing is stored on our servers."),
    ).toBeInTheDocument();
  });

  it("Run in background and Cancel call their callbacks", () => {
    const onCancel = vi.fn();
    const onKeepWorking = vi.fn();
    render(<ExportDialog {...makeProps({ onCancel, onKeepWorking })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Run in background" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onKeepWorking).toHaveBeenCalledTimes(1);
  });

  it("Escape while preparing calls onKeepWorking, not onOpenChange(false)", () => {
    const onKeepWorking = vi.fn();
    const onOpenChange = vi.fn();
    render(<ExportDialog {...makeProps({ onKeepWorking, onOpenChange })} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onKeepWorking).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("ready shows the file name, the chips, Download again (preferred) and Export something else", () => {
    const onDownloadAgain = vi.fn();
    const onExportAnother = vi.fn();
    render(<ExportDialog {...makeProps({ stage: "ready", onDownloadAgain, onExportAnother })} />);
    expect(screen.getAllByText("Your report is ready").length).toBeGreaterThan(0); // the title and its live-region copy
    expect(screen.getByText("Unifolio-portfolio-report-2026-11-13.pdf")).toBeInTheDocument();
    for (const chip of ["14 pages", "1.2 MB", "Family combined", "Full report"]) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
    const dlAgain = screen.getByRole("button", { name: /Download again/ });
    expect(dlAgain).toHaveAttribute("data-preferred", "true");
    fireEvent.click(dlAgain);
    expect(onDownloadAgain).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Export something else/ }));
    expect(onExportAnother).toHaveBeenCalledTimes(1);
  });

  it("failed shows Try again and the print-instead row, omits fewer-sections and one-member rows when not allowed, and shows the code", () => {
    render(
      <ExportDialog
        {...makeProps({
          stage: "failed",
          failed: { code: "EXP-4F2A", canTryFewer: false, canExportMember: false },
        })}
      />,
    );
    expect(screen.getAllByText("We could not finish your report").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Try again/ })).toHaveAttribute("data-preferred", "true");
    expect(screen.getByRole("button", { name: /Print it from your browser instead/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Export fewer sections/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Export one member/ })).not.toBeInTheDocument();
    expect(screen.getByText("EXP-4F2A")).toBeInTheDocument();
  });

  it("the print-instead row never appears in the choose stage", () => {
    render(<ExportDialog {...makeProps({ stage: "choose" })} />);
    expect(screen.queryByText(/Print it from your browser instead/)).not.toBeInTheDocument();
  });

  it("the stage live region updates when the stage changes", () => {
    const { rerender } = render(<ExportDialog {...makeProps({ stage: "preparing" })} />);
    const live = screen.getByTestId("export-live-region");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent(/Building the pages/);

    rerender(<ExportDialog {...makeProps({ stage: "ready" })} />);
    expect(screen.getByTestId("export-live-region")).toHaveTextContent(/Your report is ready/);
  });
});

it("shows_run_in_background_and_not_keep_working", () => {
  render(<ExportDialog {...makeProps()} />);
  expect(screen.getByRole("button", { name: "Run in background" })).toBeInTheDocument();
  expect(screen.queryByText("Keep working")).not.toBeInTheDocument();
});
