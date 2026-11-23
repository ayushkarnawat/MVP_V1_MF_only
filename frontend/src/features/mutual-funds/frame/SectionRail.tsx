import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { MIN_SECTIONS_FOR_INDEX, type PageSection } from "../../../lib/pageSections";
import styles from "./SectionRail.module.css";

export interface SectionRailProps {
  sections: PageSection[];
  activeId: string | null;
  onJump: (id: string) => void;
}

const PILL_QUERY = "(max-width: 1099px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function matchesMedia(query: string, fallback: boolean): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return fallback;
  }
  return window.matchMedia(query).matches;
}

function supportsBackdropBlur(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    return false;
  }
  return CSS.supports("backdrop-filter", "blur(1px)");
}

export function SectionRail({ sections, activeId, onJump }: SectionRailProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [clickedOpen, setClickedOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [isPill, setIsPill] = useState(() => matchesMedia(PILL_QUERY, false));
  const [reducedMotion, setReducedMotion] = useState(() => matchesMedia(REDUCED_MOTION_QUERY, false));

  const navRef = useRef<HTMLElement>(null);
  const pillButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const suppressFocusOpenRef = useRef(false);

  const isOpen = isPill ? clickedOpen || pinned : hovered || focused || clickedOpen || pinned;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const pillMql = window.matchMedia(PILL_QUERY);
    const motionMql = window.matchMedia(REDUCED_MOTION_QUERY);
    const onPillChange = () => setIsPill(pillMql.matches || window.innerWidth < 1100);
    const onMotionChange = () => setReducedMotion(motionMql.matches);
    onPillChange();
    onMotionChange();
    pillMql.addEventListener("change", onPillChange);
    motionMql.addEventListener("change", onMotionChange);
    window.addEventListener("resize", onPillChange);
    return () => {
      pillMql.removeEventListener("change", onPillChange);
      motionMql.removeEventListener("change", onMotionChange);
      window.removeEventListener("resize", onPillChange);
    };
  }, []);

  useEffect(() => {
    if (!isPill || !isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setClickedOpen(false);
        setPinned(false);
        setFocused(false);
        suppressFocusOpenRef.current = true;
        pillButtonRef.current?.focus();
        suppressFocusOpenRef.current = false;
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isPill, isOpen]);

  if (sections.length < MIN_SECTIONS_FOR_INDEX) {
    return null;
  }

  const backdropSupported = supportsBackdropBlur();

  const closeAndReturnFocus = () => {
    setHovered(false);
    setFocused(false);
    setClickedOpen(false);
    setPinned(false);
    const target = isPill ? pillButtonRef.current : returnFocusRef.current;
    if (target) {
      suppressFocusOpenRef.current = true;
      target.focus();
      suppressFocusOpenRef.current = false;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeAndReturnFocus();
    }
  };

  const handleFocus = (event: FocusEvent<HTMLElement>) => {
    if (suppressFocusOpenRef.current) return;
    if (!isPill && !isOpen) {
      returnFocusRef.current =
        event.relatedTarget instanceof HTMLElement && !navRef.current?.contains(event.relatedTarget)
          ? event.relatedTarget
          : event.target instanceof HTMLElement
            ? event.target
            : null;
    }
    if (!isPill) {
      setFocused(true);
    }
  };

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!navRef.current?.contains(event.relatedTarget as Node | null)) {
      setFocused(false);
    }
  };

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    onJump(id);
  };

  const handlePinToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setPinned(prev => {
      const next = !prev;
      if (!next) {
        setClickedOpen(false);
      }
      return next;
    });
  };

  const panelContent = (
    <>
      <div className={styles.header}>
        <span className={styles.headerLabel}>On this page</span>
        <button
          type="button"
          className={styles.pinButton}
          data-clickable=""
          aria-pressed={pinned}
          onClick={handlePinToggle}
        >
          {pinned ? "Unpin" : "Pin"}
        </button>
      </div>
      <ul className={styles.list}>
        {sections.map(section => {
          const active = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                href={`#${section.anchor}`}
                className={styles.link}
                aria-current={active ? "location" : undefined}
                onClick={event => handleLinkClick(event, section.id)}
              >
                {section.title}
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <nav
      ref={navRef}
      aria-label="On this page"
      className={styles.rail}
      data-state={isOpen ? "open" : "closed"}
      data-layout={isPill ? "pill" : "rail"}
      data-motion={reducedMotion ? "reduced" : undefined}
      data-backdrop={backdropSupported ? undefined : "fallback"}
      onMouseEnter={isPill ? undefined : () => setHovered(true)}
      onMouseLeave={isPill ? undefined : () => setHovered(false)}
      onClick={isPill ? undefined : () => setClickedOpen(true)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {isPill ? (
        <>
          <button
            ref={pillButtonRef}
            type="button"
            className={`${styles.pillTrigger} ${styles.glassSurface}`}
            data-clickable=""
            aria-expanded={isOpen}
            onClick={() => setClickedOpen(prev => !prev)}
          >
            <span>On this page</span>
            {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
          </button>
          {isOpen ? (
            <div className={`${styles.pillPanel} ${styles.glassSurface}`}>{panelContent}</div>
          ) : null}
        </>
      ) : (
        <>
          <div className={styles.ticks} aria-hidden="true">
            {sections.map(section => (
              <span
                key={section.id}
                className={styles.tick}
                data-section-tick=""
                data-active={section.id === activeId ? "true" : undefined}
              />
            ))}
          </div>
          <div className={isOpen ? styles.panel : styles.panelClosed}>{panelContent}</div>
        </>
      )}
    </nav>
  );
}
