import { useId } from "react";
import { FAMILY_COMBINED } from "../planningCopy";
import { titleName } from "../scenarioFormat";
import type { MemberChoice } from "../types";

export interface MemberSelectProps {
  members: { id: string; name: string }[];
  value: MemberChoice;
  onChange: (value: MemberChoice) => void;
}

export function MemberSelect({ members, value, onChange }: MemberSelectProps) {
  const id = useId();

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="sr-only">
        Member
      </label>
      <select
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full min-w-0 max-w-full rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-2.5 py-2 text-sm text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
      >
        <option value="family">{FAMILY_COMBINED}</option>
        {members.map(member => (
          <option key={member.id} value={member.id}>
            {titleName(member.name)}
          </option>
        ))}
      </select>
    </div>
  );
}
