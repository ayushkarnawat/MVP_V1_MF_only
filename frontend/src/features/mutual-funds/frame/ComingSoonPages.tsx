import { MutualFundsFrame } from "./MutualFundsFrame";
import type { MfTabId } from "../types";

function ComingSoonTab({ tab }: { tab: MfTabId }) {
  return (
    <MutualFundsFrame tab={tab}>
      <p className="text-sm text-[var(--ui-text-muted)]">Coming soon</p>
    </MutualFundsFrame>
  );
}

export function AllocationComingSoon() {
  return <ComingSoonTab tab="allocation" />;
}

export function HoldingsComingSoon() {
  return <ComingSoonTab tab="holdings" />;
}

export function TransactionsComingSoon() {
  return <ComingSoonTab tab="transactions" />;
}

export function OverlapComingSoon() {
  return <ComingSoonTab tab="overlap" />;
}
