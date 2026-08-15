import { useEffect, useState } from "react";

export type OAuthScriptStatus = "loading" | "loaded" | "error";

export const loadedScripts = new Map<string, Promise<void>>();

function loadScriptOnce(src: string): Promise<void> {
  const existing = loadedScripts.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
  loadedScripts.set(src, promise);
  return promise;
}

/** Injects a third-party <script> tag exactly once per app lifetime,
 * regardless of how many components request the same src — written
 * generically (takes a URL, not hardcoded to Google) so a future Apple
 * integration can reuse it without rework (Frontend Spec, "New files"). */
export function useOAuthScript(src: string): OAuthScriptStatus {
  const [status, setStatus] = useState<OAuthScriptStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    loadScriptOnce(src)
      .then(() => {
        if (!cancelled) setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return status;
}
