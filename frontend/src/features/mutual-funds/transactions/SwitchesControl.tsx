import { Button } from "../../../components/ui/button";
import { usePrintMode } from "../../../lib/printMode";

export interface SwitchesControlProps {
  included: boolean;
  onChange: (included: boolean) => void;
  disabled?: boolean;
}
export function SwitchesControl({ included, onChange, disabled = false }: SwitchesControlProps) {
  const printMode = usePrintMode();
  if (printMode) return <div className="space-y-2 text-xs text-[var(--ui-text-muted)]">
    <span>Switches: Excluded</span>
    <p>Only invested, withdrawn and the bars change. Net invested and absolute gain stay the same.</p>
  </div>;
  return <Button type="button" variant="outline" size="sm" disabled={disabled}
    aria-pressed={included} data-clickable="" data-effect="switch"
    onClick={() => onChange(!included)}>
    Switches: {included ? "Included" : "Excluded"}
  </Button>;
}
