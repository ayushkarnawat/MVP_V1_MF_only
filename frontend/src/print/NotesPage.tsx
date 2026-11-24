import { SectionHeading } from "./SectionHeading";
import { TabHeading } from "./TabHeading";
import { buildNotes } from "./notesCopy";

export interface NotesPageProps {
  priceDate: string | null;
  marketCapDate: string | null;
}

export function NotesPage({ priceDate, marketCapDate }: NotesPageProps) {
  const notes = buildNotes(priceDate, marketCapDate);

  return (
    <section className="print-notes" aria-label="Notes">
      <TabHeading tab="Notes" />
      <SectionHeading title="Notes" subtitle="How the numbers are calculated" />
      <div className="print-notes-list">
        {notes.map((block) => (
          <div key={block.heading} className="print-notes-block">
            <h3 className="print-notes-heading" data-notes-heading="">
              {block.heading}
            </h3>
            {block.paragraphs.map((paragraph, index) => (
              <p key={index} className="print-notes-paragraph">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
