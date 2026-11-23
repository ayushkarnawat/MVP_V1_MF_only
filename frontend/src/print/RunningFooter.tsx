import { useEffect } from "react";

export interface RunningFooterProps {
  generatedOn: string;
  priceNote: string | null;
}

function cssString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function RunningFooter({ generatedOn, priceNote }: RunningFooterProps) {
  const leftText = priceNote ? `Generated ${generatedOn} · ${priceNote}` : `Generated ${generatedOn}`;

  useEffect(() => {
    document.documentElement.style.setProperty("--print-footer-left", cssString(leftText));
  }, [leftText]);

  return (
    <footer className="print-running-footer">
      <span>{leftText}</span>
    </footer>
  );
}
