import { createContext, useContext } from "react";

/** "wide": text on the left, the sketch beside it (sign-up 1, log-in 1). "stacked": sketch above the text. */
export type AuthLayout = "wide" | "stacked";

export const AuthLayoutContext = createContext<AuthLayout>("stacked");

/** The left panel reads the layout the card chose, so a screen sets it once, on the card. */
export function useAuthLayout(): AuthLayout {
  return useContext(AuthLayoutContext);
}
