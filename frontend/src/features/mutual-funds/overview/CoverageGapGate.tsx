import { useState } from "react";
import { CoverageGapBanner } from "../../../components/mf/CoverageGapBanner";
import { OpeningBalanceModal } from "../../../components/mf/OpeningBalanceModal";
import type { CoverageGapItem, Load } from "../types";

export interface CoverageGapGateProps {
  gaps: Load<CoverageGapItem[]>;
  onResolved: () => void;
}

/** The coverage-gap banner and the opening-balance dialog it opens. Both keep the old Dashboard's markup, so the
 * wrapper carries data-legacy (the interactivity scan skips it) and `contents` (an empty gate leaves no gap). */
export function CoverageGapGate({ gaps, onResolved }: CoverageGapGateProps) {
  const [selected, setSelected] = useState<CoverageGapItem | null>(null);
  const list = gaps.status === "data" && gaps.data !== null ? gaps.data : [];
  return (
    <div data-testid="coverage-gap-gate" data-legacy="coverage-gap" className="contents">
      <CoverageGapBanner gaps={list} onResolveGap={setSelected} />
      {/* Mounted only while a gap is picked: the dialog fills its fields from the gap once, when it mounts. */}
      {selected && (
        <OpeningBalanceModal
          key={selected.folio_id}
          isOpen
          gap={selected}
          onClose={() => setSelected(null)}
          onResolved={onResolved}
        />
      )}
    </div>
  );
}
