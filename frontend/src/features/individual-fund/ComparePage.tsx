import { useParams } from "react-router";
import { paths } from "@/shell/nav/paths";
import { useAppNavigate } from "@/shell/nav/useAppNavigate";
import { FundPageFrame } from "./FundPageFrame";
import { ComparisonState } from "./overlap/ComparisonState";

export function ComparePage({ fundA, fundB }: { fundA: string; fundB: string }) {
  const navigate = useAppNavigate();
  return (
    <FundPageFrame schemeId={fundA} tab="overlap">
      {(ctx) => (
        <ComparisonState
          key={`${ctx.schemeId}:${fundB}:${ctx.scope}`}
          ctx={ctx}
          otherSchemeId={fundB}
          backLabel="Back to Overlap"
          onBack={() => void navigate(paths.mutualFunds.overlap())}
        />
      )}
    </FundPageFrame>
  );
}

export default function CompareRoute() {
  const { fundA, fundB } = useParams();
  return <ComparePage fundA={fundA ?? ""} fundB={fundB ?? ""} />;
}
