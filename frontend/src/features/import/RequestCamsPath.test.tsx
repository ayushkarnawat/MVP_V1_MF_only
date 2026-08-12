import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { RequestCamsPath } from "./RequestCamsPath";
import * as api from "./api";

describe("RequestCamsPath", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders steps and initiates CAMS request on button click", async () => {
    const mockOpen = vi.fn();
    vi.stubGlobal("open", mockOpen);

    vi.spyOn(api, "requestCamsStatement").mockResolvedValue({
      import_id: "imp-req-1",
      household_member_id: "m-1",
      status: "waiting_for_user",
      cams_url: "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement",
      expires_at: "2026-08-12T12:00:00Z",
    });

    const onRequestInitiated = vi.fn();

    render(
      <RequestCamsPath
        memberId="m-1"
        onRequestInitiated={onRequestInitiated}
      />
    );

    expect(screen.getByRole("button", { name: /request statement on cams/i })).toBeInTheDocument();
    expect(screen.getByText(/detailed statement/i)).toBeInTheDocument();
    expect(screen.getByText(/10-year duration/i)).toBeInTheDocument();
    expect(screen.getByText(/zero folios/i)).toBeInTheDocument();

    const requestBtn = screen.getByRole("button", { name: /request statement on cams/i });
    fireEvent.click(requestBtn);

    await waitFor(() => {
      expect(api.requestCamsStatement).toHaveBeenCalledWith("m-1");
      expect(mockOpen).toHaveBeenCalledWith(
        "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement",
        "_blank"
      );
      expect(onRequestInitiated).toHaveBeenCalledWith("imp-req-1", "2026-08-12T12:00:00Z");
    });
  });
});
