import { useEffect } from "react";
import ringLogo from "./logos/ring.png";

export interface RunningHeaderProps {
  scopeName: string;
}

function cssString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function RunningHeader({ scopeName }: RunningHeaderProps) {
  useEffect(() => {
    document.documentElement.style.setProperty("--print-header-scope", cssString(scopeName));
  }, [scopeName]);

  return (
    <header className="print-running-header">
      <div className="print-running-header-left">
        <img src={ringLogo} alt="" className="print-running-header-logo" />
        <span className="print-running-header-title">Mutual Fund Portfolio Report</span>
      </div>
      <span className="print-running-header-scope">{scopeName}</span>
    </header>
  );
}
