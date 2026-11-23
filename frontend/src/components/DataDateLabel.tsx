import { formatDataDate, type DataDateKind } from "../lib/dataDates";

export interface DataDateLabelProps {
  kind: DataDateKind;
  iso: string | null | undefined;
  className?: string;
}

/**
 * Renders a formatted data-date label in a `<span>`, or nothing when the date is invalid or empty.
 */
export function DataDateLabel({ kind, iso, className }: DataDateLabelProps) {
  const text = formatDataDate(kind, iso);
  if (!text) return null;
  return <span className={className}>{text}</span>;
}
