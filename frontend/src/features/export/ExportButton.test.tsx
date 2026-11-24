import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../../components/ui/tooltip";
import { ExportButton } from "./ExportButton";

function mount(props: Partial<React.ComponentProps<typeof ExportButton>> = {}) {
  const onOpen = props.onOpen ?? vi.fn();
  render(
    <TooltipProvider delayDuration={0}>
      <ExportButton onOpen={onOpen} {...props} />
    </TooltipProvider>,
  );
  return { onOpen };
}

describe("ExportButton", () => {
  it('shows the download icon and "Export PDF" and is not the green primary variant', () => {
    mount();
    const btn = screen.getByRole("button", { name: "Export PDF" });
    expect(btn).toHaveTextContent("Export PDF");
    expect(btn.querySelector("svg")).not.toBeNull();
    expect(btn.className).not.toContain("bg-[var(--pos)]");
    expect(btn).toHaveAttribute("data-clickable", "");
    expect(btn).toHaveAttribute("data-effect", "open");
  });

  it('shows the tip "Make a PDF report of your portfolio" on hover and on keyboard focus', async () => {
    mount();
    const btn = screen.getByRole("button", { name: "Export PDF" });

    fireEvent.pointerMove(btn);
    fireEvent.mouseEnter(btn);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Make a PDF report of your portfolio");

    fireEvent.mouseLeave(btn);
    fireEvent.focus(btn);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Make a PDF report of your portfolio");
  });

  it('busy shows "Preparing…" with a spinner, stays clickable, and calls onOpen', () => {
    const { onOpen } = mount({ busy: true });
    const btn = screen.getByRole("button", { name: /Preparing/ });
    expect(btn).toHaveTextContent("Preparing…");
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn.querySelector("[data-testid='export-spinner']")).not.toBeNull();
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('hasData false is aria-disabled with the tip "Add data first" and does not call onOpen', async () => {
    const { onOpen } = mount({ hasData: false });
    const btn = screen.getByRole("button", { name: "Export PDF" });
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.focus(btn);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Add data first");
  });

  it("hasData undefined behaves as enabled", () => {
    const { onOpen } = mount({ hasData: undefined });
    const btn = screen.getByRole("button", { name: "Export PDF" });
    expect(btn).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('icon-only classes below the breakpoint keep the aria-label "Export PDF"', () => {
    mount();
    const btn = screen.getByRole("button", { name: "Export PDF" });
    expect(btn).toHaveAttribute("aria-label", "Export PDF");
    const label = screen.getByText("Export PDF");
    expect(label.className).toMatch(/hidden|max-\[1099px\]|min-\[1100px\]/);
  });

  it("respects reduced motion (no spin class)", () => {
    mount({ busy: true });
    const spinner = screen.getByTestId("export-spinner");
    // An SVG element: its class is read as an attribute, not as a string property.
    expect(spinner.getAttribute("class")).not.toContain("animate-spin");
    expect(spinner.getAttribute("class")).toContain("export-spinner");
  });
});
