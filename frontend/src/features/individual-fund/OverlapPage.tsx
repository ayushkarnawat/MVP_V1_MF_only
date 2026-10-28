import { useParams } from "react-router";
import { FundPageFrame } from "./FundPageFrame";
import { OverlapTab } from "./overlap/OverlapTab";

export function OverlapPage({ schemeId }: { schemeId: string }) {
  return (
    <FundPageFrame schemeId={schemeId} tab="overlap">
      {/* The key makes a member switch (or another fund) start again from the normal state. */}
      {(ctx) => <OverlapTab key={`${ctx.schemeId}:${ctx.scope}`} ctx={ctx} />}
    </FundPageFrame>
  );
}

export default function OverlapRoute() {
  const { schemeId } = useParams();
  return <OverlapPage schemeId={schemeId ?? ""} />;
}
