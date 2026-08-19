import type { AuthStep } from "./AuthShell";
import leftPanelVisual from "@/assets/left-panel-visual.svg";

interface AuthShowcasePanelProps {
  step?: AuthStep;
}

export function AuthShowcasePanel({ step: _step = "landing" }: AuthShowcasePanelProps) {
  return (
    <div className="relative w-full h-full min-h-[580px] lg:min-h-[640px] overflow-hidden bg-[#ECECE8] flex items-center justify-center">
      <img
        src={leftPanelVisual}
        alt="Unifolio Wealth Architecture"
        className="w-full h-full object-cover object-center select-none"
        draggable={false}
      />
    </div>
  );
}
