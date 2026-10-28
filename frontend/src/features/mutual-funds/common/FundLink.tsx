import type { ReactNode } from "react";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";

export interface FundLinkProps {
  /** The fund's scheme id. Missing or empty: the name is shown as plain text, never as a dead link. */
  schemeId: string | null | undefined;
  children: ReactNode;
  className?: string;
}

/** A fund name that opens the fund's page. Only for names that are plain text: never inside a button, a toggle or a row with its own click. */
export function FundLink({ schemeId, children, className = "hover:underline" }: FundLinkProps) {
  if (!schemeId) return <>{children}</>;
  return (
    <AppLink to={paths.mutualFunds.fund(schemeId)} className={className}>
      {children}
    </AppLink>
  );
}
