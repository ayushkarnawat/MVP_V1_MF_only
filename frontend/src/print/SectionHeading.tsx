export interface SectionHeadingProps {
  title: string;
  subtitle?: string;
}

export function SectionHeading({ title, subtitle }: SectionHeadingProps) {
  return (
    <div className="print-section-heading">
      <h2 className="print-section-title">{title}</h2>
      {subtitle ? (
        <p className="print-section-subtitle" data-section-subtitle="">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
