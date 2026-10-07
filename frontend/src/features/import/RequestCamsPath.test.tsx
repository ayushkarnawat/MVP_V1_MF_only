import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { RequestCamsPath } from "./RequestCamsPath";
import * as api from "./api";

vi.mock("../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../legal/api")>("../legal/api");
  const { DOCS } = await import("../legal/testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});

describe("RequestCamsPath", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("request is disabled until ticked and sends the version; renders steps, reference card, back button, and initiates CAMS request on button click", async () => {
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
    const onBack = vi.fn();

    render(
      <RequestCamsPath
        memberId="m-1"
        onBack={onBack}
        onRequestInitiated={onRequestInitiated}
      />
    );

    // Verify back button
    const backBtn = screen.getByText(/back to import options/i);
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();

    // Verify reference card and steps
    expect(screen.getByText(/on the cams form, select these three options/i)).toBeInTheDocument();
    expect(screen.getByText(/detailed statement/i)).toBeInTheDocument();
    expect(screen.getByText(/10-year duration/i)).toBeInTheDocument();
    expect(screen.getByText(/with zero folios/i)).toBeInTheDocument();

    expect(screen.getByText(/tapping below opens the official cams site in a new tab/i)).toBeInTheDocument();
    expect(screen.getByText(/select the above three options on the form/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your email and set a password for your cas file/i)).toBeInTheDocument();

    // Verify CTA and submission
    const requestBtn = screen.getByRole("button", { name: /request statement on cams/i });
    // 2026-10-07: no PAN consent on a CAMS request -- no box, no line, enabled straight away.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/you agree to our/i)).not.toBeInTheDocument();
    expect(requestBtn).toBeEnabled();
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
