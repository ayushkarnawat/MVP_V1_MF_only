import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportFileProgressList } from "./ImportFileProgressList";
import type { FileProgressItem } from "./ImportFileProgressList";

describe("ImportFileProgressList", () => {
  const sampleFiles: FileProgressItem[] = [
    {
      file: new File(["dummy content"], "cams_statement.pdf", { type: "application/pdf" }),
      status: "done",
      progress: 100,
    },
    {
      file: new File(["dummy content 2"], "kfintech_statement.pdf", { type: "application/pdf" }),
      status: "uploading",
      progress: 60,
    },
  ];

  it("renders file items with filename and status indicators", () => {
    render(<ImportFileProgressList files={sampleFiles} />);

    expect(screen.getByText("cams_statement.pdf")).toBeInTheDocument();
    expect(screen.getByText("kfintech_statement.pdf")).toBeInTheDocument();
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
    expect(screen.getByText(/uploading/i)).toBeInTheDocument();
  });

  it("calls onRemoveFile with correct index when remove button is clicked", () => {
    const handleRemove = vi.fn();
    render(<ImportFileProgressList files={sampleFiles} onRemoveFile={handleRemove} />);

    const removeButtons = screen.getAllByRole("button", { name: /remove file/i });
    expect(removeButtons).toHaveLength(2);

    fireEvent.click(removeButtons[0]);
    expect(handleRemove).toHaveBeenCalledWith(0);
  });
});
