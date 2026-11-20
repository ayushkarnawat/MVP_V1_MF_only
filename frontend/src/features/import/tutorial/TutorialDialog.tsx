import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TUTORIAL_CHAPTERS,
  TUTORIAL_COPY,
  TUTORIAL_DURATION_SECONDS,
  TUTORIAL_POSTER_URL,
} from "./tutorialCopy";

export interface TutorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoPlay: boolean;
  src: string | null;
  onRequestStatement?: () => void | Promise<void>;
  isRequesting?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getActiveChapterIndex(currentTime: number): number {
  let active = -1;
  for (let i = 0; i < TUTORIAL_CHAPTERS.length; i += 1) {
    if (currentTime >= TUTORIAL_CHAPTERS[i].seconds) {
      active = i;
    }
  }
  return active;
}

interface TutorialDialogBodyProps {
  autoPlay: boolean;
  src: string;
  onRequestStatement?: () => void | Promise<void>;
  isRequesting?: boolean;
}

function TutorialDialogBody({
  autoPlay,
  src,
  onRequestStatement,
  isRequesting = false,
}: TutorialDialogBodyProps) {
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(TUTORIAL_DURATION_SECONDS);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (autoPlay) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        void playPromise.catch(() => {});
      }
    }

    return () => {
      if (!video.paused) {
        video.pause();
      }
    };
  }, [autoPlay, src]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const effectiveDuration =
    Number.isFinite(duration) && duration > 0 ? duration : TUTORIAL_DURATION_SECONDS;
  const progressPercent = Math.min(
    100,
    Math.max(0, (currentTime / effectiveDuration) * 100)
  );
  const activeChapterIndex = getActiveChapterIndex(currentTime);

  const startPlayback = (video: HTMLVideoElement) => {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      void playPromise.catch(() => {});
    }
  };

  const handleTogglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      if (video.ended || isEnded) {
        video.currentTime = 0;
        setCurrentTime(0);
        setIsEnded(false);
      }
      startPlayback(video);
    } else {
      video.pause();
    }
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value);
    const video = videoRef.current;
    if (video) {
      video.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
    if (nextTime < effectiveDuration) {
      setIsEnded(false);
    }
  };

  const handleChapterSelect = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = seconds;
    setCurrentTime(seconds);
    setIsEnded(false);
    if (autoPlay && video.paused) {
      startPlayback(video);
    }
  };

  const handleWatchAgain = () => {
    const video = videoRef.current;
    if (!video) return;

    setIsEnded(false);
    video.currentTime = 0;
    setCurrentTime(0);
    startPlayback(video);
  };

  const handleFullscreen = () => {
    if (document.fullscreenElement) {
      if (typeof document.exitFullscreen === "function") {
        void document.exitFullscreen().catch(() => {});
      }
      return;
    }
    const target = playerFrameRef.current ?? videoRef.current;
    if (target && typeof target.requestFullscreen === "function") {
      void target.requestFullscreen().catch(() => {});
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Video Frame (16:9) */}
      <div
        ref={playerFrameRef}
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)]"
      >
        <video
          ref={videoRef}
          src={src}
          poster={TUTORIAL_POSTER_URL}
          autoPlay={autoPlay}
          muted
          playsInline
          preload="metadata"
          className="block h-full w-full object-cover"
          onPlay={() => {
            setIsPlaying(true);
            setIsEnded(false);
          }}
          onPause={() => {
            setIsPlaying(false);
          }}
          onWaiting={() => {
            setIsLoading(true);
          }}
          onCanPlay={() => {
            setIsLoading(false);
          }}
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration;
            if (Number.isFinite(nextDuration) && nextDuration > 0) {
              setDuration(nextDuration);
            }
          }}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setIsLoading(false);
            setIsEnded(true);
            setCurrentTime(effectiveDuration);
          }}
        />

        {isLoading && isPlaying && !isEnded && (
          <div
            aria-live="polite"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--ui-elevated)]/40"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ui-divider)] bg-[var(--ui-elevated)]/95 px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] shadow-sm">
              <Loader2
                className="h-3.5 w-3.5 animate-spin text-[var(--pos)] motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span>{TUTORIAL_COPY.loadingLabel}</span>
            </div>
          </div>
        )}

        {/* End-of-video soft overlay */}
        {isEnded && (
          <div
            data-testid="tutorial-end-overlay"
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--ui-elevated)]/92 p-5 text-center backdrop-blur-sm"
          >
            <p className="max-w-md font-display text-base sm:text-lg font-semibold text-[var(--ui-text)]">
              {TUTORIAL_COPY.closingLine}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={handleWatchAgain}
                disabled={isRequesting}
                data-testid="tutorial-watch-again"
                className="h-10 gap-2 rounded-xl border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-4 text-xs sm:text-sm font-semibold text-[var(--ui-text)] hover:border-[var(--ui-border-hover)] hover:bg-[var(--ui-card)] focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{TUTORIAL_COPY.watchAgainLabel}</span>
              </Button>

              {onRequestStatement && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={onRequestStatement}
                  disabled={isRequesting}
                  data-testid="tutorial-end-request"
                  className="h-10 gap-2 rounded-xl bg-[var(--pos)] px-4 text-xs sm:text-sm font-semibold text-white hover:brightness-95 active:brightness-90 focus-visible:ring-[var(--ui-focus)] motion-reduce:transition-none"
                >
                  {isRequesting ? (
                    <Loader2
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <>
                      <span>{TUTORIAL_COPY.requestActionLabel}</span>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Control Bar (Play/Pause, Seek, Full screen — no audio or captions controls) */}
      <div className="flex items-center gap-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-2">
        <button
          type="button"
          onClick={handleTogglePlay}
          aria-label={isPlaying ? TUTORIAL_COPY.pauseLabel : TUTORIAL_COPY.playLabel}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-row-hover)] active:bg-[var(--ui-divider)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-card)] disabled:pointer-events-none disabled:text-[var(--ui-disabled-text)] motion-reduce:transition-none cursor-pointer"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
          )}
        </button>

        <span className="relative flex h-6 flex-1 items-center rounded-full focus-within:ring-2 focus-within:ring-[var(--ui-focus)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--ui-card)]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-[var(--ui-divider)]"
          >
            <span
              className="block h-full rounded-full bg-[var(--pos)] transition-[width] duration-100 motion-reduce:transition-none"
              style={{ width: `${progressPercent}%` }}
            />
          </span>
          <input
            type="range"
            min={0}
            max={effectiveDuration}
            step={0.1}
            value={Math.min(currentTime, effectiveDuration)}
            onChange={handleSeek}
            aria-label={TUTORIAL_COPY.seekLabel}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(effectiveDuration)}`}
            className="relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent accent-[var(--pos)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--ui-elevated)] [&::-webkit-slider-thumb]:bg-[var(--pos)] [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--ui-elevated)] [&::-moz-range-thumb]:bg-[var(--pos)] [&::-moz-range-thumb]:shadow-sm"
          />
        </span>

        <span className="tnum shrink-0 text-xs font-medium text-[var(--ui-text-muted)]">
          {formatTime(currentTime)} / {formatTime(effectiveDuration)}
        </span>

        <button
          type="button"
          onClick={handleFullscreen}
          aria-label={
            isFullscreen
              ? TUTORIAL_COPY.exitFullscreenLabel
              : TUTORIAL_COPY.fullscreenLabel
          }
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] active:bg-[var(--ui-divider)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-card)] disabled:pointer-events-none disabled:text-[var(--ui-disabled-text)] motion-reduce:transition-none cursor-pointer"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Chapter Chips */}
      <div
        role="group"
        aria-label={TUTORIAL_COPY.transcriptHeading}
        className="flex flex-wrap items-center gap-2"
      >
        {TUTORIAL_CHAPTERS.map((chapter, index) => {
          const isActive = index === activeChapterIndex;
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() => handleChapterSelect(chapter.seconds)}
              aria-label={chapter.label}
              aria-pressed={isActive}
              data-testid={`tutorial-chapter-${chapter.id}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-elevated)] disabled:pointer-events-none disabled:border-[var(--ui-disabled-border)] disabled:text-[var(--ui-disabled-text)] motion-reduce:transition-none cursor-pointer",
                isActive
                  ? "border-[var(--pos)] bg-[var(--pos-bg)] font-semibold text-[var(--pos-text)]"
                  : "border-[var(--ui-divider)] bg-[var(--ui-elevated)] font-medium text-[var(--ui-text-muted)] hover:border-[var(--ui-border-hover)] hover:text-[var(--ui-text)] active:bg-[var(--ui-card)]"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "tnum inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                  isActive
                    ? "bg-[var(--pos)] text-white"
                    : "bg-[var(--ui-card)] text-[var(--ui-text-muted)]"
                )}
              >
                {chapter.number}
              </span>
              <span>{chapter.label}</span>
            </button>
          );
        })}
      </div>

      {/* Reduced-motion notice */}
      {!autoPlay && (
        <p className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--ui-text-muted)]">
          {TUTORIAL_COPY.reducedMotionNotice}
        </p>
      )}

      {/* Transcript ("The four steps") */}
      <section
        aria-labelledby="tutorial-transcript-heading"
        className="space-y-2.5 border-t border-[var(--ui-divider)] pt-3.5 text-left"
      >
        <h3
          id="tutorial-transcript-heading"
          className="font-display text-sm font-semibold text-[var(--ui-text)]"
        >
          {TUTORIAL_COPY.transcriptHeading}
        </h3>
        <p className="text-xs leading-relaxed text-[var(--ui-text-muted)]">
          {TUTORIAL_COPY.openingLine}
        </p>
        <ol className="space-y-2 text-xs leading-relaxed text-[var(--ui-text-muted)]">
          {TUTORIAL_CHAPTERS.map((chapter) => (
            <li
              key={chapter.id}
              data-testid={`tutorial-step-${chapter.id}`}
              className="flex gap-2"
            >
              <span className="tnum shrink-0 font-semibold text-[var(--ui-text)]">
                {chapter.number}.
              </span>
              <span>
                <strong className="font-semibold text-[var(--ui-text)]">
                  {chapter.label}.
                </strong>{" "}
                {chapter.text}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs leading-relaxed text-[var(--ui-text-muted)]">
          {TUTORIAL_COPY.closingLine}
        </p>
      </section>
    </div>
  );
}

export function TutorialDialog({
  open,
  onOpenChange,
  autoPlay,
  src,
  onRequestStatement,
  isRequesting = false,
  returnFocusRef,
}: TutorialDialogProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.ctrlKey) return;
      const content = contentRef.current;
      const target = event.target;
      if (content && target instanceof Node && !content.contains(target)) {
        onOpenChange(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        hideClose
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current ?? previousFocusRef.current;
          if (target && target.isConnected && typeof target.focus === "function") {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        style={{ maxWidth: "min(92vw, 960px, calc(58vh * 16 / 9 + 48px))" }}
        className="w-[92vw] max-w-[960px] max-h-[92vh] overflow-y-auto gap-3.5 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 text-[var(--ui-text)] shadow-xl motion-reduce:animate-none motion-reduce:transition-none motion-reduce:duration-0"
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 text-left">
          <DialogTitle className="font-display text-base sm:text-lg font-semibold leading-snug text-[var(--ui-text)]">
            {TUTORIAL_COPY.dialogTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {TUTORIAL_COPY.dialogDescription}
          </DialogDescription>
          <DialogClose asChild>
            <button
              type="button"
              aria-label={TUTORIAL_COPY.closeLabel}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-card)] hover:text-[var(--ui-text)] active:bg-[var(--ui-divider)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-elevated)] motion-reduce:transition-none cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </DialogClose>
        </DialogHeader>

        {open && src && (
          <TutorialDialogBody
            autoPlay={autoPlay}
            src={src}
            onRequestStatement={onRequestStatement}
            isRequesting={isRequesting}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
