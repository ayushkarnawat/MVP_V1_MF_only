import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

it("renders the tutorial text link with a play icon and duration, and invokes onOpen", async () => {
  const { TutorialLink } = await import("./TutorialLink");
  const onOpen = vi.fn();
  render(<TutorialLink onOpen={onOpen} />);

  const name = "Watch how it works, 53 seconds";
  const link = screen.queryByRole("link", { name }) ?? screen.getByRole("button", { name });
  expect(link).toBeVisible();
  expect(within(link).getByText("Watch how it works")).toBeVisible();
  expect(within(link).getByText("53 sec")).toBeVisible();
  expect(link.querySelector("svg, img")).toBeInTheDocument();
  expect(link.className).not.toMatch(/(?:^|\s)bg-(?!transparent(?:\s|$))\S+/);

  expect(onOpen).not.toHaveBeenCalled();
  fireEvent.click(link);
  expect(onOpen).toHaveBeenCalledTimes(1);
});
