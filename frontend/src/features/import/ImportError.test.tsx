import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportError } from "./ImportError";

describe("ImportError", () => {
  it("shows the error message and calls onRetry", () => {
    const onRetry = vi.fn();
    render(<ImportError error={{ code: "wrong_password", message: "Incorrect PDF password." }} onRetry={onRetry} />);

    expect(screen.getByText("Incorrect PDF password.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
