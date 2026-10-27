import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanField } from "./PanField";

describe("PanField", () => {
  it("shows the masked PAN exactly as given", () => {
    render(<PanField panMasked="AB******4F" />);
    expect(screen.getByTestId("pan-field")).toHaveAttribute("data-state", "masked");
    expect(screen.getByTestId("pan-value")).toHaveTextContent("AB******4F");
    expect(screen.getByTestId("pan-value").textContent).toBe("AB******4F");
    expect(screen.queryByTestId("pan-conflict")).not.toBeInTheDocument();
  });

  it("has no control at all: no Show, no Hide, no copy, no link", () => {
    render(<PanField panMasked="AB******4F" conflict />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByText(/show|hide|reveal|copy/i)).not.toBeInTheDocument();
  });

  it.each([[null], [""]])("reads 'Not added' for %j", value => {
    render(<PanField panMasked={value} />);
    expect(screen.getByTestId("pan-field")).toHaveAttribute("data-state", "empty");
    expect(screen.getByTestId("pan-field")).toHaveTextContent("Not added");
    expect(screen.queryByTestId("pan-value")).not.toBeInTheDocument();
  });

  it("tags a PAN that another Unifolio account holds, and still shows the masked value", () => {
    render(<PanField panMasked="CD******7K" conflict />);
    expect(screen.getByTestId("pan-value")).toHaveTextContent("CD******7K");
    expect(screen.getByTestId("pan-conflict")).toHaveTextContent("On another Unifolio account");
  });

  it("shows no tag when there is no conflict, and none when there is no PAN to tag", () => {
    const { rerender } = render(<PanField panMasked="CD******7K" conflict={false} />);
    expect(screen.queryByTestId("pan-conflict")).not.toBeInTheDocument();
    rerender(<PanField panMasked={null} conflict />);
    expect(screen.queryByTestId("pan-conflict")).not.toBeInTheDocument();
    expect(screen.getByTestId("pan-field")).toHaveTextContent("Not added");
  });
});
