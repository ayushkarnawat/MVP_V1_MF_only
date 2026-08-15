import { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { useOAuthScript } from "./useOAuthScript";

const GOOGLE_GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleButtonProps {
  onCredential: (idToken: string) => void;
}

export function GoogleButton({ onCredential }: GoogleButtonProps) {
  const scriptStatus = useOAuthScript(GOOGLE_GSI_SCRIPT_SRC);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scriptStatus !== "loaded" || !buttonRef.current || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? "",
      callback: (response) => onCredential(response.credential),
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "pill",
      width: 320,
      text: "continue_with",
    });
    // onCredential is expected to be a stable callback from the parent
    // (AuthEntryFlow's handlers don't change identity across renders in
    // practice) — re-initializing GIS on every render would tear down and
    // rebuild the native button unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptStatus]);

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

  return <div ref={buttonRef} data-testid="google-button-container" className="w-full flex justify-center" />;
}
