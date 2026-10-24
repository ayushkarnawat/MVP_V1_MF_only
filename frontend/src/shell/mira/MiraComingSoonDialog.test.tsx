import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { MiraComingSoonDialog } from "./MiraComingSoonDialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Ask Mira</button><MiraComingSoonDialog open={open} onOpenChange={setOpen} /></>;
}

it("focuses the dialog, closes on Escape, and restores focus", async () => {
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Ask Mira" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Ask Mira" });
  expect(dialog).toHaveTextContent(/coming soon/i);
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("closes with the button", async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Ask Mira" }));
  fireEvent.click(await screen.findByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
