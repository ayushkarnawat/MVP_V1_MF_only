import { Badge } from "@/components/ui/badge";
import type { PlanType } from "./types";

export function PlanBadge({ planType, verified }: { planType: PlanType; verified?: boolean }) {
  if (planType === "direct") return <Badge variant="positive">Direct</Badge>;
  if (planType === "unclassified") return <Badge variant="warning">Unclassified</Badge>;
  if (verified === false) return <Badge variant="warning">Regular · unverified</Badge>;
  return <Badge variant="neutral">Regular</Badge>;
}
