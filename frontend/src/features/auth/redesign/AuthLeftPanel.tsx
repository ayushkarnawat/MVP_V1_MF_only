import type { CSSProperties, ReactNode } from "react";
import "../../../styles/auth-tokens.css";
import { logoSrc, SKETCH_MOTION, sketchSrc, type SketchName } from "./sketches";

export interface AuthLeftPanelProps {
  sketch: SketchName;
  headline: ReactNode;
  paragraph: ReactNode;
  /** The three plain feature rows. */
  rows?: { text: string; /** A smaller line under the title. */ detail?: string; icon?: ReactNode }[];
  /** Instead of the rows: an info card (sign-up screen 3). */
  infoCard?: ReactNode;
  /** Instead of the rows: status rows (the All set screen). */
  status?: ReactNode;
}

export function AuthLeftPanel({ sketch, headline, paragraph, rows, infoCard, status }: AuthLeftPanelProps) {
  const motion = SKETCH_MOTION[sketch];
  const vars = { "--auth-float-distance": `${motion.distance}px`, "--auth-float-duration": `${motion.duration}s` } as CSSProperties;
  return (
    <div data-testid="auth-left" className="auth-left-panel flex h-full flex-col rounded-2xl">
      <img src={logoSrc()} alt="Unifolio" className="h-8 w-auto self-start" />
      <div className="flex flex-1 items-center justify-center py-6">
        <img
          data-testid="auth-sketch"
          src={sketchSrc(sketch)}
          alt=""
          className="auth-sketch max-h-[300px] w-auto max-w-full"
          data-motion={motion.motion}
          style={vars}
        />
      </div>
      <div data-testid="auth-left-text" className="flex flex-col items-start text-left">
        <h2 className="text-[28px] font-bold leading-tight text-[var(--ui-text)]">{headline}</h2>
        <p className="mt-3 text-sm text-[var(--ui-text-muted)]">{paragraph}</p>
        {rows ? (
          <ul className="mt-6 space-y-4">
            {rows.map((row) => (
              <li key={row.text} className="flex items-start gap-3 text-sm text-[var(--ui-text)]">
                {row.icon}
                {row.detail ? (
                  <span>
                    <strong className="block font-semibold">{row.text}</strong>
                    <span className="block text-xs text-[var(--ui-text-muted)]">{row.detail}</span>
                  </span>
                ) : (
                  row.text
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {infoCard ? <div className="mt-6 w-full">{infoCard}</div> : null}
        {status ? <div className="mt-6 w-full space-y-4">{status}</div> : null}
      </div>
    </div>
  );
}
