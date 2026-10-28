import type { ReactNode } from "react";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";

export interface FundLinkProps {
  /** The fund's scheme id. Missing or empty: the name is shown as plain text, never as a dead link. */
  schemeId: string | null | undefined;
  children: ReactNode;
  className?: string;
  /**
   * Set when the link sits inside a row that has its own click or key action (the row opens a popup).
   * A click or key press on the link then stays on the link and does not also trigger the row.
   */
  inClickableRow?: boolean;
}

export function FundLink({ schemeId, children, className = "hover:underline", inClickableRow = false }: FundLinkProps) {
  if (!schemeId) return <>{children}</>;
  const link = (
    <AppLink to={paths.mutualFunds.fund(schemeId)} className={className}>
      {children}
    </AppLink>
  );
  if (!inClickableRow) return link;
  return (
    <span className="contents" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      {link}
    </span>
  );
}
