export const TUTORIAL_VIDEO_URL = "/tutorial/how-to-request-from-cams.mp4";
export const TUTORIAL_POSTER_URL = "/tutorial/poster.jpg";
export const TUTORIAL_DURATION_SECONDS = 53;

export interface TutorialChapter {
  readonly id: "request" | "fill-form" | "inbox" | "upload";
  readonly number: 1 | 2 | 3 | 4;
  readonly label: string;
  readonly seconds: number;
  readonly text: string;
}

export const TUTORIAL_COPY = {
  linkLabel: "Watch how it works",
  linkDuration: "53 sec",
  linkAccessibleName: "Watch how it works, 53 seconds",
  dialogTitle: "How to request your statement from CAMS",
  dialogDescription:
    "Walkthrough of the four steps to request your statement from CAMS and upload it into Unifolio.",
  closeLabel: "Close",
  transcriptHeading: "The four steps",
  openingLine:
    "Here is how to bring your full mutual fund history into Unifolio, in four steps.",
  closingLine: "That is it. Your funds appear in your dashboard.",
  reducedMotionNotice:
    "Your device is set to reduce motion, so the video does not play by itself. The steps are below.",
  watchAgainLabel: "Watch again",
  requestActionLabel: "Request Statement on CAMS",
  playLabel: "Play",
  pauseLabel: "Pause",
  seekLabel: "Seek video",
  fullscreenLabel: "Full screen",
  exitFullscreenLabel: "Exit full screen",
  loadingLabel: "Loading video",
} as const;

export const TUTORIAL_CHAPTERS: readonly TutorialChapter[] = [
  {
    id: "request",
    number: 1,
    label: "Request",
    seconds: 4,
    text: "Press Request Statement on CAMS. The official CAMS website opens in a new tab.",
  },
  {
    id: "fill-form",
    number: 2,
    label: "Fill the form",
    seconds: 13,
    text: "If a banner covers the form, close it first. Choose Detailed. For the period, choose Specific Period, from ten years ago to today. For folio listing, choose With zero balance folios. Enter the email registered with your funds. Set a password, and remember it. Then press Submit.",
  },
  {
    id: "inbox",
    number: 3,
    label: "Inbox",
    seconds: 37,
    text: "CAMS emails your statement, usually within five to ten minutes. Download the PDF.",
  },
  {
    id: "upload",
    number: 4,
    label: "Upload",
    seconds: 41,
    text: "Come back to Unifolio, add the file, and type the same password.",
  },
] as const;
