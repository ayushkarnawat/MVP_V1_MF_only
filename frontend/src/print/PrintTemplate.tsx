import type { ReactNode } from "react";
import "./print-tokens.css";
import "./print-fonts.css";
import "./print.css";

export interface PrintTemplateProps {
  children: ReactNode;
}

export function PrintTemplate({ children }: PrintTemplateProps) {
  return <div className="print-template">{children}</div>;
}
