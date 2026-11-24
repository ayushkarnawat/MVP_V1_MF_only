export interface TabHeadingProps {
  tab: string;
}

export function TabHeading({ tab }: TabHeadingProps) {
  return (
    <div className="print-tab-heading">
      <p className="print-tab-eyebrow">TAB</p>
      <h1 className="print-tab-title">{tab}</h1>
    </div>
  );
}
