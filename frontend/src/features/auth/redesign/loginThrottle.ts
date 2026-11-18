/**
 * What the login entry screen is told when the server holds a code for the address the person just used
 * (Batch B item 4, contract for B-8). The screen shows the countdown only while the typed email or phone is still
 * the held one; the server stays the authority for every send.
 */
export interface LoginThrottle {
  channel: "email" | "phone";
  /** The held address as it was sent: the trimmed email, or the normalised phone (+91...). */
  value: string;
  /** Seconds left, as the server said. */
  seconds: number;
  /** Changes on every new server answer, so the same address held again restarts the countdown. */
  stamp: number;
}
