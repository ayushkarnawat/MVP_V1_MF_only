import type { CSSProperties, ReactNode } from "react";
import "../../../styles/auth-tokens.css";
import { useAuthLayout } from "./authLayout";
import { IconBadge } from "./IconBadge";
import { logoSrc, SKETCH_MOTION, sketchSrc, type SketchName } from "./sketches";

export interface AuthLeftPanelProps {
  sketch: SketchName;
  headline: ReactNode;
  paragraph: ReactNode;
  /** The three plain feature rows. */
  rows?: { text: string; /** A smaller line under the title. */ detail?: string }[];
  /** One line icon per row, drawn in a round mint badge (see authRowIcons.tsx). */
  rowIcons?: ReactNode[];
  /** Instead of the rows: an info card (sign-up screen 3). */
  infoCard?: ReactNode;
  /** Instead of the rows: status rows (the All set screen). */
  status?: ReactNode;
  /** Under the paragraph: the number or email the code went to, and its Edit link. */
  identity?: ReactNode;
}

/**
 * The left half of the card. Two layouts, chosen on the card: "stacked" (logo, sketch, then text; the sketch takes
 * whatever height is left) and "wide" (the text on the left, the sketch beside it).
 */
export function AuthLeftPanel({ sketch, headline, paragraph, rows, rowIcons, infoCard, status, identity }: AuthLeftPanelProps) {
  const layout = useAuthLayout();
  const motion = SKETCH_MOTION[sketch];
  const vars = { "--auth-float-distance": `${motion.distance}px`, "--auth-float-duration": `${motion.duration}s` } as CSSProperties;

  const sketchImage = (
    <div className="auth-sketch-glow relative min-h-[88px] min-w-0 flex-1">
      <img
        data-testid="auth-sketch"
        src={sketchSrc(sketch)}
        alt=""
        draggable={false}
        className="auth-sketch absolute inset-0 h-full w-full object-contain"
        data-motion={motion.motion}
        style={vars}
      />
    </div>
  );

  const text = (
    <div data-testid="auth-left-text" className="flex min-w-0 flex-col items-start text-left">
      <h2 className="font-bold tracking-[-0.02em] text-[var(--auth-ink)]" style={{ fontSize: "var(--auth-h2)", lineHeight: 1.12 }}>{headline}</h2>
      <p className="max-w-[40ch] text-[var(--ui-text-muted)]" style={{ fontSize: "var(--auth-body)", lineHeight: 1.5, marginTop: "var(--auth-gap-sm)" }}>{paragraph}</p>
      {identity ? <div className="w-full" style={{ marginTop: "var(--auth-gap-sm)" }}>{identity}</div> : null}
      {rows ? (
        <ul className="flex flex-col" style={{ marginTop: "var(--auth-gap)", gap: "var(--auth-gap)" }}>
          {rows.map((row, index) => (
            <li key={row.text} className="flex items-center gap-3.5 text-[var(--auth-ink)]">
              {rowIcons?.[index] ? <IconBadge icon={rowIcons[index]} /> : null}
              {row.detail ? (
                <span className="min-w-0">
                  <strong className="block text-[15px] font-semibold leading-snug">{row.text}</strong>
                  <span className="auth-row-detail block text-[13px] leading-snug text-[var(--ui-text-muted)]">{row.detail}</span>
                </span>
              ) : (
                <span className="text-[15px] font-semibold">{row.text}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {infoCard ? <div className="w-full" style={{ marginTop: "var(--auth-gap)" }}>{infoCard}</div> : null}
      {status ? <div className="w-full space-y-3.5" style={{ marginTop: "var(--auth-gap)" }}>{status}</div> : null}
    </div>
  );

  const logo = <img src={logoSrc()} alt="Unifolio" draggable={false} className="w-auto shrink-0 self-start" style={{ height: "var(--auth-logo-h)" }} />;

  if (layout === "wide") {
    return (
      <div data-testid="auth-left" data-layout="wide" className="auth-left-panel flex h-full min-h-0 flex-col" style={{ gap: "var(--auth-gap)" }}>
        {logo}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] items-center gap-4">
          {text}
          <div className="relative flex h-full min-h-0">{sketchImage}</div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="auth-left" data-layout="stacked" className="auth-left-panel flex h-full min-h-0 flex-col">
      {logo}
      <div className="flex min-h-0 flex-1 py-2">{sketchImage}</div>
      {text}
    </div>
  );
}
