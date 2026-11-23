import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PageLayout } from "./PageLayout";

it("PageLayout renders search before actions and nothing when absent", () => {
  const { container, rerender } = render(
    <PageLayout title="Funds" actions={<button type="button" data-clickable="">Act</button>} search={<div data-testid="slot">box</div>}>x</PageLayout>,
  );
  const slot = screen.getByTestId("slot");
  const act = screen.getByRole("button", { name: "Act" });
  expect(slot.compareDocumentPosition(act) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Funds" })).toBeInTheDocument();

  // Without the slot the header holds exactly what it held before the slot existed.
  rerender(<PageLayout title="Funds" actions={<button type="button" data-clickable="">Act</button>}>x</PageLayout>);
  expect(screen.queryByTestId("slot")).toBeNull();
  const header = container.querySelector("header");
  expect(header?.children.length).toBe(2);
});

it("PageLayout without search or actions has only the title block", () => {
  const { container } = render(<PageLayout title="Funds">x</PageLayout>);
  expect(container.querySelector("header")?.children.length).toBe(1);
});
