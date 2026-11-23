import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import "./searchHighlight.css";

const SEARCH_INTENT_KEY = "searchIntent";
const HIGHLIGHT_ATTR = "data-search-highlight";
const HIGHLIGHT_DURATION_MS = 1500;
const OBSERVER_TIMEOUT_MS = 5000;
const ECHO_WINDOW_MS = 3000;

interface PageSearchIntent {
  section?: string;
  open?: string;
}

function readPageIntent(state: unknown): PageSearchIntent | null {
  if (typeof state !== "object" || state === null) return null;
  const intent: unknown = Reflect.get(state, SEARCH_INTENT_KEY);
  if (typeof intent !== "object" || intent === null) return null;
  const rawSection: unknown = Reflect.get(intent, "section");
  const rawOpen: unknown = Reflect.get(intent, "open");
  const section = typeof rawSection === "string" && rawSection.length > 0 ? rawSection : undefined;
  const open = typeof rawOpen === "string" && rawOpen.length > 0 ? rawOpen : undefined;
  if (!section && !open) return null;
  return { section, open };
}

function stateWithoutPageIntent(state: unknown): Record<string, unknown> | null {
  if (typeof state !== "object" || state === null) return null;
  const { [SEARCH_INTENT_KEY]: intent, ...rest } = state as Record<string, unknown>;
  if (typeof intent === "object" && intent !== null) {
    const { section: _section, open: _open, ...remainingIntent } = intent as Record<string, unknown>;
    if (Object.keys(remainingIntent).length > 0) {
      return { ...rest, [SEARCH_INTENT_KEY]: remainingIntent };
    }
  }
  return Object.keys(rest).length > 0 ? rest : null;
}

function scrollBehavior(): ScrollBehavior {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return "auto";
  }
  return "smooth";
}

export function useSearchIntent(handlers?: { onOpen?: (open: string) => void }): void {
  const location = useLocation();
  const navigate = useNavigate();
  const handledKeyRef = useRef<string | null>(null);
  // The scope provider also tidies this history entry (it removes the scope part), which gives the entry a new key
  // that still carries the section. The same section arriving again within a moment is that echo: clear it, do not scroll twice.
  const lastSectionRef = useRef<{ id: string; at: number } | null>(null);
  const onOpenRef = useRef(handlers?.onOpen);
  onOpenRef.current = handlers?.onOpen;

  const cleanupRef = useRef<{
    clearHighlight?: () => void;
    clearObserver?: () => void;
  }>({});

  useEffect(() => {
    return () => {
      cleanupRef.current.clearHighlight?.();
      cleanupRef.current.clearObserver?.();
      cleanupRef.current = {};
    };
  }, []);

  useEffect(() => {
    const intent = readPageIntent(location.state);
    if (!intent || handledKeyRef.current === location.key) return;
    handledKeyRef.current = location.key;

    const highlightSection = (el: HTMLElement) => {
      cleanupRef.current.clearHighlight?.();
      el.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
      el.setAttribute(HIGHLIGHT_ATTR, "true");
      const timer = setTimeout(() => {
        el.removeAttribute(HIGHLIGHT_ATTR);
        cleanupRef.current.clearHighlight = undefined;
      }, HIGHLIGHT_DURATION_MS);
      cleanupRef.current.clearHighlight = () => {
        clearTimeout(timer);
        el.removeAttribute(HIGHLIGHT_ATTR);
        cleanupRef.current.clearHighlight = undefined;
      };
    };

    const echo = intent.section !== undefined && lastSectionRef.current?.id === intent.section
      && Date.now() - lastSectionRef.current.at < ECHO_WINDOW_MS;
    if (intent.section) lastSectionRef.current = { id: intent.section, at: Date.now() };

    if (intent.section && !echo) {
      const targetId = intent.section;
      const existing = document.getElementById(targetId);
      if (existing) {
        highlightSection(existing);
      } else {
        cleanupRef.current.clearObserver?.();
        const observer = new MutationObserver(() => {
          const found = document.getElementById(targetId);
          if (found) {
            cleanupRef.current.clearObserver?.();
            highlightSection(found);
          }
        });
        const timeout = setTimeout(() => {
          cleanupRef.current.clearObserver?.();
        }, OBSERVER_TIMEOUT_MS);
        cleanupRef.current.clearObserver = () => {
          clearTimeout(timeout);
          observer.disconnect();
          cleanupRef.current.clearObserver = undefined;
        };
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    if (intent.open) {
      onOpenRef.current?.(intent.open);
    }

    void navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: stateWithoutPageIntent(location.state) },
    );
  }, [location.key, location.state, location.pathname, location.search, location.hash, navigate]);
}
