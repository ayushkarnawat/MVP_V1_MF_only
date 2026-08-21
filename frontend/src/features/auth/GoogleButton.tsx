import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { useOAuthScript } from "./useOAuthScript";

const GOOGLE_GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleButtonProps {
  onCredential: (idToken: string) => void;
}

/** GIS's renderButton only accepts a fixed pixel width — there is no
 * percentage/fluid option — so a hardcoded 320 overflows the auth card on
 * common 360–375px phones. Measure the container instead and clamp. */
const MAX_BUTTON_WIDTH = 320;
const MIN_BUTTON_WIDTH = 200;

export function GoogleButton({ onCredential }: GoogleButtonProps) {
  const scriptStatus = useOAuthScript(GOOGLE_GSI_SCRIPT_SRC);
  const buttonRef = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? "";

  useEffect(() => {
    if (scriptStatus !== "loaded" || !buttonRef.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => onCredential(response.credential),
    });
    // One-time measurement at mount: this does not re-measure on viewport
    // resize after the initial render, which is an acceptable tradeoff for
    // now (GIS would have to tear down and rebuild the native button).
    const measured = buttonRef.current.offsetWidth;
    const width = Math.min(MAX_BUTTON_WIDTH, Math.max(measured, MIN_BUTTON_WIDTH));
    window.google.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "pill",
      width,
      text: "continue_with",
    });
    // onCredential's reference changes on every parent render (AuthEntryFlow's
    // handlers are plain arrow functions, not useCallback), but this effect
    // intentionally doesn't depend on it: every real caller's handler closes
    // over nothing but stable setState dispatchers and module-level imports,
    // so a frozen reference behaves identically to a fresh one. Re-running
    // would tear down and rebuild the native GIS button on every render.
    // (This project lints with oxlint, which honours ESLint disable
    // directives, so the line below is a live suppression of a real
    // react-hooks(exhaustive-deps) warning — same spelling as the other
    // occurrences in src/features/auth.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptStatus, clientId]);

  if (scriptStatus === "error") {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-xs text-[var(--color-negative)] font-medium"
      >
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>Couldn't load Google Sign-In. Check your connection and try again.</span>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center">
      <div
        ref={buttonRef}
        data-testid="google-button-container"
        className="w-full max-w-[320px] min-h-[40px] rounded-full bg-[#F8F9FA] hover:bg-[#F1F3F5] dark:bg-[#1E293B] dark:hover:bg-[#334155] border border-[#CBD5E1] dark:border-[#475569] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:shadow-sm transition-all flex items-center justify-center overflow-hidden [&_iframe]:mix-blend-multiply dark:[&_iframe]:mix-blend-screen"
      />
    </div>
  );
}
