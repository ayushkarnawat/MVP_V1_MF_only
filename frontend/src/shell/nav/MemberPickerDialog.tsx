import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ScopeMember } from "../scope/scopeTypes";

export interface MemberPickerDialogProps {
  members: ScopeMember[];
  open: boolean;
  onCancel: () => void;
  onContinue: (memberId: string) => void;
}

const RELATIONSHIPS = { self: "Self", spouse: "Spouse", parent: "Parent", child: "Child", sibling: "Sibling" } as const;

function relationshipOf(member: ScopeMember): string | null {
  const relationship = member.profile?.relationship;
  if (!relationship) return null;
  if (relationship === "other") return member.profile?.relationship_other_label || "Other";
  return RELATIONSHIPS[relationship];
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("");

export function MemberPickerDialog({ members, open, onCancel, onContinue }: MemberPickerDialogProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => { if (!open) setChosen(null); }, [open]);
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onCancel(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Whose data are you adding?</DialogTitle></DialogHeader>
        <div role="radiogroup" aria-label="Family members" className="flex flex-col gap-2">
          {members.map(member => {
            const relationship = relationshipOf(member);
            const selected = chosen === member.id;
            return (
              <button key={member.id} type="button" role="radio" aria-checked={selected} data-clickable="" data-effect="select"
                onClick={() => setChosen(member.id)}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left ${selected ? "border-[var(--pos)]" : "border-[var(--ui-divider)]"}`}>
                <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-[var(--ui-card)] text-xs font-semibold">{initials(member.name)}</span>
                <span className="text-sm font-medium text-[var(--ui-text)]">{member.name}</span>
                {relationship && <span className="text-xs text-[var(--ui-text-muted)]">{relationship}</span>}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <button type="button" data-clickable="" data-effect="close" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm">Cancel</button>
          <button type="button" data-clickable="" data-effect="navigate" disabled={chosen === null} onClick={() => { if (chosen) onContinue(chosen); }}
            className="rounded-lg bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Continue</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
