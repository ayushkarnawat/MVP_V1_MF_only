export interface ContentsEntry {
  tab: string;
  title: string;
  page: number | null;
}

export interface ContentsProps {
  entries: ContentsEntry[];
}

interface ContentsGroup {
  tab: string;
  items: ContentsEntry[];
}

function groupByTab(entries: ContentsEntry[]): ContentsGroup[] {
  const groups: ContentsGroup[] = [];
  const byTab = new Map<string, ContentsGroup>();
  for (const entry of entries) {
    let group = byTab.get(entry.tab);
    if (!group) {
      group = { tab: entry.tab, items: [] };
      byTab.set(entry.tab, group);
      groups.push(group);
    }
    group.items.push(entry);
  }
  return groups;
}

export function Contents({ entries }: ContentsProps) {
  const groups = groupByTab(entries);

  return (
    <section className="print-contents" aria-label="Contents">
      <p className="print-contents-eyebrow">CONTENTS</p>
      <h1 className="print-contents-title">What is in this report</h1>
      {groups.map((group) => (
        <div key={group.tab} className="print-contents-group">
          <p className="print-contents-group-label" data-contents-group-label="">
            {group.tab.toUpperCase()}
          </p>
          {group.items.map((item, idx) => (
            <div key={`${group.tab}-${item.title}-${idx}`} className="print-contents-row" data-contents-entry="">
              <span className="print-contents-entry-title">{item.title}</span>
              <span className="print-contents-leader" aria-hidden="true" />
              <span className="print-contents-page" data-contents-page="">
                {item.page !== null ? String(item.page) : ""}
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
