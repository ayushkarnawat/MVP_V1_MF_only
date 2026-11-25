import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestCamsPath } from "../RequestCamsPath";
import * as api from "../api";
import { CamsChecklistHost } from "./CamsChecklistHost";
import { getChecklistState, setChecklistState } from "../casResumeState";
import { checklistCopy } from "./checklistCopy";

// The floating window's document must have a window (testing-library needs one to compute roles and styles), so it is the
// document of a hidden iframe, not a bare document made with createHTMLDocument.
function floatingDocument(): Document {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  document.body.append(frame);
  const doc = frame.contentDocument as Document;
  doc.title = "Unifolio checklist";
  return doc;
}


vi.mock("../../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../../legal/api")>("../../legal/api");
  const { DOCS } = await import("../../legal/testFixtures");
  return { ...actual, getLegalDocuments: vi.fn(async () => DOCS) };
});

const response = {
  import_id: "import-h8", household_member_id: "member-h8", status: "waiting_for_user",
  cams_url: "https://cams.example.test/statement", expires_at: "2026-12-01T12:00:00Z",
};

async function setup() {
  const events = new EventTarget();
  const floating = {
    document: floatingDocument(),
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
  fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
  return { floating, requestWindow, openTab, request, checklist: within(floating.document.body) };
}

describe("CamsChecklist through the request screen (no invented component props)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(api, "getCamsLink").mockResolvedValue("https://cams.example.test/statement");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("five labelled real checkboxes use the workbook words in order, count ticks, and gate submission", async () => {
    const { checklist } = await setup();
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
      expect(box.tagName).toBe("INPUT"); // not instanceof: the floating window's document is another realm
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

  it("W2 shows the ring text, the line and the three rows, with Form submitted done and the other two not clickable", async () => {
    const { checklist } = await setup();
    const { getChecklistState } = await import("../casResumeState");
    for (const box of await checklist.findAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.click(checklist.getByRole("button", { name: "I have submitted the form" }));
    expect(checklist.getByRole("heading", { name: "Wait for the email" })).toBeInTheDocument();
    const ringLabel = checklist.getByText("5–10 min");
    expect(ringLabel).not.toHaveAttribute("aria-hidden");
    expect(ringLabel.parentElement?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(checklist.getByText("CAMS usually sends it within 5 to 10 minutes.")).toBeInTheDocument();
    const rows = within(checklist.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent?.replace("✓", "").trim())).toEqual([
      "Form submitted", "Open your inbox and find the email from CAMS", "Download the PDF attached to it",
    ]);
    expect(rows[0].querySelector('[aria-hidden="true"]')?.textContent).toBe("✓");
    rows.forEach((row, index) => {
      expect(row.querySelector("input, button, a, [tabindex]")).toBeNull();
      if (index > 0) expect(row.querySelector('[aria-hidden="true"]')?.textContent).toBe("");
      fireEvent.click(row);
    });
    expect(getChecklistState("member-h8")).toEqual({ ticks: [true, true, true, true, true], step: "waiting" });
    expect(checklist.queryByRole("button", { name: "Open the CAMS form" })).not.toBeInTheDocument();
  });

  it("W3 shows the note and the password note and the Close this checklist button", async () => {
    const { checklist, floating } = await setup();
    for (const box of await checklist.findAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.click(checklist.getByRole("button", { name: "I have submitted the form" }));
    fireEvent.click(checklist.getByRole("button", { name: "I have the file" }));
    expect(checklist.getByRole("heading", { name: "You have the file" })).toBeInTheDocument();
    expect(checklist.getByText("Now go back to Unifolio to upload it. Press Back to tab in the bar above, or click the Unifolio tab.")).toBeInTheDocument();
    expect(checklist.getByText("Remember: you need the same password you set on CAMS.")).toBeInTheDocument();
    const finish = checklist.getByRole("button", { name: "Close this checklist" });
    expect(finish).toHaveAttribute("data-clickable", "");
    expect(finish).toHaveAttribute("data-effect", "close");
    expect(floating.close).not.toHaveBeenCalled();
    expect(checklist.queryByRole("button", { name: "Open the CAMS form" })).not.toBeInTheDocument();
  });

  it("the_checklist_has_no_open_the_cams_form_button", async () => {
    const { checklist, openTab } = await setup();
    expect(await checklist.findAllByRole("checkbox")).toHaveLength(5);
    expect(checklist.queryByRole("button", { name: "Open the CAMS form" })).not.toBeInTheDocument();
    expect(openTab).not.toHaveBeenCalled();
    cleanup();
    localStorage.clear();
    Reflect.deleteProperty(window, "documentPictureInPicture");
    render(<RequestCamsPath memberId="member-d2-no-extra-button" onRequestInitiated={vi.fn()} />);
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    expect(await screen.findAllByRole("checkbox")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "Open the CAMS form" })).not.toBeInTheDocument();
    expect(openTab).not.toHaveBeenCalled();
  });

  it("no_getting_your_link_ready_state_remains", async () => {
    const { checklist } = await setup();
    expect(await checklist.findAllByRole("checkbox")).toHaveLength(5);
    for (const text of ["Getting your link ready", "Open the CAMS form"]) {
      expect(checklist.queryByText(text)).not.toBeInTheDocument();
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    expect(checklistCopy).not.toHaveProperty("open");
    expect(checklistCopy).not.toHaveProperty("preparing");
  });

  it("the floating content shares the React state: ticking updates the screen count without message passing", async () => {
    const postMessage = vi.spyOn(window, "postMessage");
    const { checklist } = await setup();
    const boxes = await checklist.findAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    expect(checklist.getByText("1 of 5 done")).toBeInTheDocument();
    expect(screen.getByText("1 of 5 done")).toBeInTheDocument();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("reset_button_reads_reset_checklist_and_start_over_is_gone", () => {
    setChecklistState("member-reset-copy", { ticks: [true, false, false, false, false], step: "form" });
    render(<CamsChecklistHost memberId="member-reset-copy" />);
    const reset = screen.getByRole("button", { name: "Reset checklist" });
    expect(reset).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start over" })).not.toBeInTheDocument();
    fireEvent.click(reset);
    const saved = getChecklistState("member-reset-copy");
    if (saved) expect(saved).toEqual({ ticks: [false, false, false, false, false], step: "form" });
    else expect(saved).toBeNull();
  });

  it("status_strip_shows_progress_and_the_current_step", async () => {
    const { checklist } = await setup();
    const boxes = await checklist.findAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    await waitFor(() => expect(screen.getByText("1 of 5 done")).toBeVisible());
    await waitFor(() => expect(screen.getByText(/Fill the CAMS form/)).toBeVisible());
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
    for (const box of boxes.slice(1)) fireEvent.click(box);
    fireEvent.click(checklist.getByRole("button", { name: "I have submitted the form" }));
    await waitFor(() => expect(screen.getByText(/Wait for the email/)).toBeVisible());
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("closed_state_shows_a_visible_reopen_action", async () => {
    const { checklist, floating, requestWindow } = await setup();
    fireEvent.click((await checklist.findAllByRole("checkbox"))[0]);
    act(() => floating.close());
    await waitFor(() => expect(screen.getByText("1 of 5 done")).toBeVisible());
    await waitFor(() => expect(screen.getByText(/Fill the CAMS form/)).toBeVisible());
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
    const reopen = screen.getByRole("button", { name: "Reopen checklist" });
    await waitFor(() => expect(reopen).toBeVisible());
    const next = { ...floating, closed: false, document: floatingDocument() };
    requestWindow.mockResolvedValueOnce(next);
    fireEvent.click(reopen);
    await waitFor(() => expect(requestWindow).toHaveBeenCalledTimes(2));
    expect((await within(next.document.body).findAllByRole("checkbox"))[0]).toBeChecked();
  });

  it("panel_mode_shows_the_same_strip", async () => {
    Reflect.deleteProperty(window, "documentPictureInPicture");
    vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(api, "requestCamsStatement").mockResolvedValue(response);
    render(<RequestCamsPath memberId="member-panel-strip" onRequestInitiated={vi.fn()} />);
    fireEvent.click(await screen.findByRole("link", { name: "Request Statement on CAMS" }));
    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    expect(screen.getAllByText("1 of 5 done").length).toBeGreaterThan(0);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
    expect(screen.getAllByText(/Fill the CAMS form/).length).toBeGreaterThan(0);
  });
});
