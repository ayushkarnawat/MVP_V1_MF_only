import type { ReactNode } from "react";

export interface SectionAnchorProps {
  anchor: string;
  className?: string;
  children: ReactNode;
}

export function SectionAnchor({ anchor, className, children }: SectionAnchorProps) {
  return (
    <div id={anchor} className={className ? `scroll-mt-6 ${className}` : "scroll-mt-6"}>
      {children}
    </div>
  );
}
