import { Button } from "@/components/ui/button";
import { PromptDialog } from "../import/prompts/PromptDialog";
import type { LegalDocument } from "./types";

// No markdown library: paragraphs are blank-line separated. A leading "# "
// line is the document heading (already shown as the dialog title, so it is
// dropped when it repeats it); a leading "> " line is rendered as plain text.
function toParagraphs(content: string, title: string): { heading: string | null; paragraphs: string[] } {
  const blocks = content
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  let heading: string | null = null;
  if (blocks[0]?.startsWith("# ")) {
    const text = blocks[0].slice(2).trim();
    if (text !== title) heading = text;
    blocks.shift();
  }
  return {
    heading,
    paragraphs: blocks.map((b) => (b.startsWith("> ") ? b.slice(2) : b)),
  };
}

export function LegalDocumentModal({ doc, onClose }: { doc: LegalDocument | null; onClose: () => void }) {
  if (!doc) return null;
  const { heading, paragraphs } = toParagraphs(doc.content, doc.title);
  return (
    <PromptDialog
      isOpen
      title={doc.title}
      onClose={onClose}
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1 text-sm leading-6 text-[var(--color-text-secondary)]">
        {heading && <h3 className="font-semibold text-[var(--color-ink)]">{heading}</h3>}
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
    </PromptDialog>
  );
}
