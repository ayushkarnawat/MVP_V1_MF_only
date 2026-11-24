import logoTransparent from "./logos/logo-transparent.png";

export interface CoverProps {
  holderName: string | null;
  scope: { kind: "family" } | { kind: "member"; memberName: string };
  memberCount: number;
  fundCount: number;
  folioCount: number;
  generatedOn: string;
  scopeLabel: string;
  dataDates: { label: string; value: string }[];
}

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function Cover({
  holderName,
  scope,
  memberCount,
  fundCount,
  folioCount,
  generatedOn,
  scopeLabel,
  dataDates,
}: CoverProps) {
  const preparedName =
    scope.kind === "member"
      ? scope.memberName
      : holderName
        ? `${holderName} and family`
        : "Your family";

  const subLine =
    scope.kind === "member"
      ? `Member report · ${plural(fundCount, "fund")} · ${plural(folioCount, "folio")}`
      : `Family combined · ${plural(memberCount, "member")} · ${plural(fundCount, "fund")} · ${plural(folioCount, "folio")}`;

  return (
    <section className="print-cover" aria-label="Report cover">
      <div className="print-cover-band">
        <div className="print-cover-ring" aria-hidden="true" />
        <div className="print-cover-logo-card">
          <img src={logoTransparent} alt="Unifolio" className="print-cover-logo" />
        </div>
        <p className="print-cover-eyebrow">CONFIDENTIAL · PREPARED ON {generatedOn.toUpperCase()}</p>
        <h1 className="print-cover-title">
          Mutual Fund
          <br />
          Portfolio Report
        </h1>
      </div>

      <p className="print-cover-prepared-label">PREPARED FOR</p>
      <p className="print-cover-name">{preparedName}</p>
      <p className="print-cover-sub">{subLine}</p>

      <div className="print-cover-rule" aria-hidden="true" />

      <div className="print-cover-meta">
        <div>
          <p className="print-cover-meta-label">Scope</p>
          <p className="print-cover-meta-value">{scopeLabel}</p>
        </div>
        {dataDates.slice(0, 2).map((item) => (
          <div key={item.label}>
            <p className="print-cover-meta-label">{item.label}</p>
            <p className="print-cover-meta-value">{item.value}</p>
          </div>
        ))}
      </div>

      <p className="print-cover-disclaimer">
        This report is generated from the statements imported into Unifolio and is meant for your
        own use. It contains no PAN. Figures are indicators of past performance and are not a
        recommendation to buy, sell or hold any fund.
      </p>
    </section>
  );
}
