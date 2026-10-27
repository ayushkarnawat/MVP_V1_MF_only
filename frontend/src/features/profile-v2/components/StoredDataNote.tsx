import { Check } from "lucide-react";

// The lawyer reviews this text before launch; it is not edited here.
const STORED_ITEMS = [
  "Your PAN is stored encrypted.",
  "The statement file you upload is kept for 30 days.",
  "Your imported portfolio data is kept until you delete it or delete your account.",
  "If you delete your account, your data is removed after a 30-day grace period.",
] as const;

export function StoredDataNote() {
  return (
    <section
      data-testid="stored-data-card"
      className="rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 shadow-sm"
    >
      <h2 className="font-heading text-lg font-semibold text-[var(--ui-text)]">
        What we store
      </h2>
      <p className="mt-1 text-sm text-[var(--shell-text-body)]">
        In plain words.
      </p>
      <ul aria-label="What we store" className="mt-4 space-y-2">
        {STORED_ITEMS.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm text-[var(--ui-text)]">
            <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--pos-text)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
