import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OtpInput } from "./otp-input";

describe("OtpInput", () => {
  it("renders 6 segmented input cells with inputMode numeric", () => {
    render(<OtpInput value="" onChange={vi.fn()} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(6);
    inputs.forEach((input) => {
      expect(input).toHaveAttribute("inputmode", "numeric");
      expect(input).toHaveAttribute("maxlength", "1");
    });
  });

  it("populates cells with characters from value", () => {
    render(<OtpInput value="123" onChange={vi.fn()} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs[0].value).toBe("1");
    expect(inputs[1].value).toBe("2");
    expect(inputs[2].value).toBe("3");
    expect(inputs[3].value).toBe("");
    expect(inputs[4].value).toBe("");
    expect(inputs[5].value).toBe("");
  });

  it("calls onChange when typing digits", () => {
    const handleChange = vi.fn();
    render(<OtpInput value="" onChange={handleChange} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.change(inputs[0], { target: { value: "5" } });
    expect(handleChange).toHaveBeenCalledWith("5");
  });

  it("filters out non-numeric characters", () => {
    const handleChange = vi.fn();
    render(<OtpInput value="" onChange={handleChange} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.change(inputs[0], { target: { value: "a" } });
    expect(handleChange).toHaveBeenCalledWith("");
  });

  it("handles pasting full 6-digit code", () => {
    const handleChange = vi.fn();
    render(<OtpInput value="" onChange={handleChange} />);
    const inputs = screen.getAllByRole("textbox");

    fireEvent.paste(inputs[0], {
      clipboardData: {
        getData: () => "654321",
      },
    });

    expect(handleChange).toHaveBeenCalledWith("654321");
  });

  it("clears and focuses previous cell on backspace when current is empty", () => {
    const handleChange = vi.fn();
    render(<OtpInput value="12" onChange={handleChange} />);
    const inputs = screen.getAllByRole("textbox");

    inputs[2].focus();
    fireEvent.keyDown(inputs[2], { key: "Backspace" });

    expect(handleChange).toHaveBeenCalledWith("1");
  });

  it("clears current cell on backspace when current has value", () => {
    const handleChange = vi.fn();
    render(<OtpInput value="123" onChange={handleChange} />);
    const inputs = screen.getAllByRole("textbox");

    inputs[2].focus();
    fireEvent.keyDown(inputs[2], { key: "Backspace" });

    expect(handleChange).toHaveBeenCalledWith("12");
  });
});
