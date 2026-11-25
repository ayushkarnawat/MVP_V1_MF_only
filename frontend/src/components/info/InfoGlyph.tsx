import type { JSX } from "react";
import { INFO_GLYPH_CLASS } from "./infoGlyph";

export function InfoGlyph({ text, testId }: { text: string; testId?: string }): JSX.Element {
  return (
    <span role="img" tabIndex={0} aria-label={text} title={text} data-testid={testId} className={INFO_GLYPH_CLASS}>
      i
    </span>
  );
}
