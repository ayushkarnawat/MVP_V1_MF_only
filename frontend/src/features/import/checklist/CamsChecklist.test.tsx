import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestCamsPath } from "../RequestCamsPath";
import * as api from "../api";

vi.mock("../../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../../legal/api")>("../../legal/api");
  const { DOCS } = await import("../../legal/testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});

const response = {
  import_id: "import-h8", household_member_id: "member-h8", status: "waiting_for_user",
  cams_url: "https://cams.example.test/statement", expires_at: "2026-12-01T12:00:00Z",
};

function setup() {
  const events = new EventTarget();
  const floating = {
    document: document.implementation.createHTMLDocument("Unifolio checklist"),
    closed: false, focus: vi.fn(),
    close: vi.fn(() => {
      floating.closed = true;
      events.dispatchEvent(new Event("pagehide"));
    }),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  const requestWindow = vi.fn().mockResolvedValue(floating);
  vi.stubGlobal("documentPictureInPicture", { requestWindow });
  const openTab = vi.spyOn(window, "open").mockReturnValue(null);
  const request = vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
  render(<MemoryRouter><RequestCamsPath memberId="member-h8" onRequestInitiated={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Request Statement on CAMS" }));
  return { floating, requestWindow, openTab, request, checklist: within(floating.document.body) };
}

describe("CamsChecklist through the request screen (no invented component props)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("five labelled real checkboxes use the workbook words in order, count ticks, and gate submission", async () => {
    const { checklist } = setup();
    const boxes = await checklist.findAllByRole("checkbox");
    const labels = [
      "Statement type: Detailed",
      "Period: Specific Period, from 10 years ago to today",
      "Folio listing: With zero balance folios",
      "Email: the one registered with your funds",
      "Password: 8 to 15 characters, a capital, a number, one of @ # $ * _. Remember it",
    ];
    expect(boxes).toHaveLength(5);
    boxes.forEach((box, index) => {
      expect(box).toBeInstanceOf(HTMLInputElement);
      expect(box).toHaveAttribute("type", "checkbox");
      expect(box).toHaveAccessibleName(labels[index]);
      expect(checklist.getByLabelText(labels[index])).toBe(box);
    });
    expect(checklist.getByText("0 of 5 done")).toBeInTheDocument();
    const submit = checklist.getByRole("button", { name: "I have submitted the form" });
    expect(submit).toBeDisabled();
    boxes.forEach((box, index) => {
      fireEvent.click(box);
      expect(checklist.getByText(`${index + 1} of 5 done`)).toBeInTheDocument();
      if (index < 4) expect(submit).toBeDisabled();
    });
    expect(submit).toBeEnabled();
    fireEvent.click(boxes[0]);
    expect(submit).toBeDisabled();
    expect(checklist.getByText("4 of 5 done")).toBeInTheDocument();
  });

  it("the checklist Open the CAMS form button opens the returned cams_url in a new tab", async () => {
    const { checklist, openTab } = setup();
    const open = await checklist.findByRole("button", { name: "Open the CAMS form" });
    await waitFor(() => expect(open).toBeEnabled());
    expect(openTab).not.toHaveBeenCalled();
    fireEvent.click(open);
    expect(openTab).toHaveBeenCalledExactlyOnceWith(response.cams_url, "_blank");
  });

  it("the floating content shares the React state: ticking updates the screen count without message passing", async () => {
    const postMessage = vi.spyOn(window, "postMessage");
    const { checklist } = setup();
    const boxes = await checklist.findAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    expect(checklist.getByText("1 of 5 done")).toBeInTheDocument();
    expect(screen.getByText("1 of 5 done")).toBeInTheDocument();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
