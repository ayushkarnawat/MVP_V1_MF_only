import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestCamsPath } from "../RequestCamsPath";

const linkName = "Watch how it works, 53 seconds";
const dialogName = "How to request your statement from CAMS";
const openingLine = "Here is how to bring your full mutual fund history into Unifolio, in four steps.";
const closingLine = "That is it. Your funds appear in your dashboard.";
const steps = [
  "Press Request Statement on CAMS. The official CAMS website opens in a new tab.",
  "If a banner covers the form, close it first. Choose Detailed. For the period, choose Specific Period, from ten years ago to today. For folio listing, choose With zero balance folios. Enter the email registered with your funds. Set a password, and remember it. Then press Submit.",
  "CAMS emails your statement, usually within five to ten minutes. Download the PDF.",
  "Come back to Unifolio, add the file, and type the same password.",
];

function renderRequest() {
  render(<RequestCamsPath memberId="m-tutorial" onRequestInitiated={vi.fn()} />);
  return screen.queryByRole("link", { name: linkName }) ?? screen.getByRole("button", { name: linkName });
}

async function openTutorial(link = renderRequest()) {
  fireEvent.click(link);
  return screen.findByRole("dialog", { name: dialogName });
}

function getVideo(dialog: HTMLElement) {
  const video = dialog.querySelector("video");
  if (!video) throw new Error("The tutorial dialog has no video player");
  return video;
}

function preferReducedMotion() {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    ...matchMedia(query),
    matches: query === "(prefers-reduced-motion: reduce)",
  }));
}

describe("TutorialDialog from Request from CAMS", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("nothing is fetched until the dialog opens", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    const link = renderRequest();
    const { TUTORIAL_VIDEO_URL } = await import("./tutorialCopy");
    const videoUrl = new URL(TUTORIAL_VIDEO_URL, document.baseURI).href;

    expect(document.querySelector("video[src], video source[src]")).not.toBeInTheDocument();
    const fetchedUrls = fetchSpy.mock.calls.map(([input]) => {
      const url = typeof input === "string" || input instanceof URL ? input : input.url;
      return new URL(url, document.baseURI).href;
    });
    expect(fetchedUrls).not.toContain(videoUrl);

    const video = getVideo(await openTutorial(link));
    expect(video).toHaveAttribute("src", TUTORIAL_VIDEO_URL);
  });

  it("a still poster shows first", async () => {
    const video = getVideo(await openTutorial());

    expect(video).toBeVisible();
    expect(video).toHaveAttribute("poster", expect.stringMatching(/\S/));
    expect(video.currentTime).toBe(0);
  });

  it("auto-plays on open when motion is allowed", async () => {
    const link = renderRequest();
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    expect(play).not.toHaveBeenCalled();

    const video = getVideo(await openTutorial(link));
    await waitFor(() => {
      expect(video.autoplay || play.mock.contexts.includes(video)).toBe(true);
    });
  });

  it("with prefers-reduced-motion it does not start and the four steps show as text", async () => {
    preferReducedMotion();
    const dialog = await openTutorial();

    expect(within(dialog).getByText("Your device is set to reduce motion, so the video does not play by itself. The steps are below.")).toBeVisible();
    expect(within(dialog).getByRole("heading", { name: "The four steps" })).toBeVisible();
    for (const step of steps) expect(dialog).toHaveTextContent(step);
    expect(dialog.querySelector("video[autoplay]")).not.toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("no volume or mute control", async () => {
    preferReducedMotion();
    const dialog = await openTutorial();
    const player = within(dialog);
    const video = getVideo(dialog);

    expect(video).not.toHaveAttribute("controls");
    expect(video.querySelector('track[kind="captions"], track[kind="subtitles"]')).not.toBeInTheDocument();
    for (const role of ["button", "slider", "switch"]) {
      expect(player.queryByRole(role, { name: /volume|mute|sound|caption|subtitle/i })).not.toBeInTheDocument();
    }
    expect(player.queryByLabelText(/volume|mute|sound|caption|subtitle/i)).not.toBeInTheDocument();
    expect(player.getByRole("slider")).toBeVisible();
    expect(player.getByRole("button", { name: /full[ -]?screen/i })).toBeVisible();

    fireEvent.click(player.getByRole("button", { name: /^play\b/i }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    vi.spyOn(video, "paused", "get").mockReturnValue(false);
    fireEvent.play(video);
    fireEvent.click(player.getByRole("button", { name: /^pause\b/i }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("chapters jump to a moment", async () => {
    const dialog = await openTutorial();
    const video = getVideo(dialog);
    const chapters = [
      { name: "Request", seconds: 4 },
      { name: "Fill the form", seconds: 9 },
      { name: "Inbox", seconds: 35 },
      { name: "Upload", seconds: 41 },
    ];

    for (const { name, seconds } of chapters) {
      fireEvent.click(within(dialog).getByRole("button", { name }));
      expect(video.currentTime).toBe(seconds);
    }
  });

  it("Escape and outside click close it and focus returns to the link", async () => {
    const link = renderRequest();
    const page = document.documentElement;
    const initialScroll = page.scrollTop;
    page.scrollTop = 240;

    try {
      link.focus();
      const dialog = await openTutorial(link);
      expect(within(dialog).getByRole("button", { name: "Close" })).toBeVisible();
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      expect(page.scrollTop).toBe(240);
      fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
      await waitFor(() => {
        expect(dialog).not.toBeInTheDocument();
        expect(link).toHaveFocus();
      });
      expect(page.scrollTop).toBe(240);

      const reopened = await openTutorial(link);
      await waitFor(() => expect(reopened.contains(document.activeElement)).toBe(true));
      expect(page.scrollTop).toBe(240);
      // Radix attaches its outside pointer listener on the next task.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      fireEvent.pointerDown(document.body, { button: 0 });
      await waitFor(() => {
        expect(reopened).not.toBeInTheDocument();
        expect(link).toHaveFocus();
      });
      expect(page.scrollTop).toBe(240);
    } finally {
      page.scrollTop = initialScroll;
    }
  });

  it("Watch again restarts", async () => {
    const dialog = await openTutorial();
    const video = getVideo(dialog);
    const replay = { name: "Watch again" };
    expect(within(dialog).queryByRole("button", replay)).not.toBeInTheDocument();

    video.currentTime = 53;
    vi.spyOn(video, "ended", "get").mockReturnValue(true);
    fireEvent.ended(video);
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockClear();
    fireEvent.click(within(dialog).getByRole("button", replay));

    await waitFor(() => {
      expect(video.currentTime).toBe(0);
      expect(play).toHaveBeenCalled();
    });
  });

  it("transcript text is present beside the player", async () => {
    const dialog = await openTutorial();
    expect(getVideo(dialog)).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "The four steps" })).toBeVisible();

    const text = dialog.textContent?.replace(/\s+/g, " ") ?? "";
    let previousEnd = 0;
    for (const line of [openingLine, ...steps, closingLine]) {
      const start = text.indexOf(line, previousEnd);
      expect(start, line).toBeGreaterThanOrEqual(previousEnd);
      previousEnd = start + line.length;
    }
  });
});
