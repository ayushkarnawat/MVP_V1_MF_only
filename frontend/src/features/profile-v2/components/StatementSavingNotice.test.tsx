import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STATEMENT_SAVING_BODY,
  STATEMENT_SAVING_REASSURE,
  STATEMENT_SAVING_TITLE,
} from "../lib/headChangeCopy";
import { StatementSavingNotice } from "./StatementSavingNotice";

describe("StatementSavingNotice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows_the_owner_sentence_and_the_reassurance", () => {
    render(<StatementSavingNotice onRetry={vi.fn()} />);
    expect(screen.getByText(STATEMENT_SAVING_TITLE)).toBeInTheDocument();
    expect(screen.getByText(STATEMENT_SAVING_BODY)).toBeInTheDocument();
    expect(screen.getByText(STATEMENT_SAVING_REASSURE)).toBeInTheDocument();
  });

  it("is_a_status_not_an_alert", () => {
    render(<StatementSavingNotice onRetry={vi.fn()} />);
    expect(screen.getByTestId("statement-saving-notice")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("counts_down_and_disables_try_again_until_zero", () => {
    const onRetry = vi.fn();
    render(<StatementSavingNotice onRetry={onRetry} />);
    const retry = screen.getByTestId("saving-retry");
    expect(retry.tagName).toBe("BUTTON");
    expect(retry).toHaveAccessibleName("Try again in 1:00");
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(retry).toHaveAccessibleName("Try again in 0:59");
    expect(retry).toBeDisabled();
    act(() => vi.advanceTimersByTime(58000));
    expect(retry).toHaveAccessibleName("Try again in 0:01");
    expect(retry).toBeDisabled();
  });

  it("enables_try_again_after_the_countdown_and_calls_on_retry_once", () => {
    const onRetry = vi.fn();
    render(<StatementSavingNotice onRetry={onRetry} />);
    act(() => vi.advanceTimersByTime(60000));
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toBeEnabled();
    expect(onRetry).not.toHaveBeenCalled();
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("a_shorter_seconds_prop_counts_from_that_value", () => {
    render(<StatementSavingNotice onRetry={vi.fn()} seconds={2} />);
    const retry = screen.getByTestId("saving-retry");
    expect(retry).toHaveAccessibleName("Try again in 0:02");
    expect(retry).toBeDisabled();
    act(() => vi.advanceTimersByTime(1000));
    expect(retry).toHaveAccessibleName("Try again in 0:01");
    expect(retry).toBeDisabled();
    act(() => vi.advanceTimersByTime(1000));
    expect(retry).toHaveAccessibleName("Try again");
    expect(retry).toBeEnabled();
  });
});
