import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import "../../../styles/auth-tokens.css";

/**
 * The page the split card sits on: light only, centred, with room around the card, a very light mint wash and two faint
 * arcs (the .auth-page class in auth-tokens.css).
 * Light only (design Q21): the document is put on the light theme while an auth screen is shown and given back
 * afterwards, so the tokens and the shared components (buttons, the code cells, the consent line) all stay light even
 * when the person's system or saved theme is dark.
 * When a new screen appears and nothing has focus, the heading takes focus so a screen reader announces the screen.
 */
export function AuthPage({ children }: { children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => {
      if (previous === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previous);
    };
  }, []);

  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const heading = page.current?.querySelector<HTMLElement>("h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, []);

  return (
    <div ref={page} className="auth-page flex min-h-dvh items-center justify-center overflow-hidden p-6">
      {children}
    </div>
  );
}
