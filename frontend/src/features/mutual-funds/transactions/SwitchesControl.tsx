import { Button } from "../../../components/ui/button";

export interface SwitchesControlProps {
  included: boolean;
  onChange: (included: boolean) => void;
  disabled?: boolean;
}
export function SwitchesControl({ included, onChange, disabled = false }: SwitchesControlProps) {
  return <Button type="button" variant="outline" size="sm" disabled={disabled}
    aria-pressed={included} data-clickable="" data-effect="switch"
    onClick={() => onChange(!included)}>
    Switches: {included ? "Included" : "Excluded"}
  </Button>;
}
