import { useState } from "react";
import { Pencil } from "lucide-react";
import type { ContactChangeChannel } from "@/features/auth/types";
import { ContactChangeDialog } from "./ContactChangeDialog";

export interface PersonalInfoCardProps {
  email: string | null;
  phone: string;
}

export function PersonalInfoCard({ email, phone }: PersonalInfoCardProps) {
  const [channel, setChannel] = useState<ContactChangeChannel | null>(null);

  return (
    <section className="rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 shadow-sm">
      <h2 className="font-heading text-lg font-semibold text-[var(--ui-text)]">
        Personal Information
      </h2>
      <p className="mt-1 text-sm text-[var(--shell-text-body)]">
        Keep your contact details up to date.
      </p>

      <dl className="mt-4 divide-y divide-[var(--ui-divider)]">
        <div data-testid="row-email" className="flex items-center gap-3 py-3">
          <dt className="w-32 shrink-0 text-sm text-[var(--ui-text-muted)]">
            Email address
          </dt>
          <dd className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ui-text)]">
            {email || "Not added"}
          </dd>
          <button
            type="button"
            aria-label="Change email address"
            onClick={() => setChannel("email")}
            className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
        </div>

        <div data-testid="row-phone" className="flex items-center gap-3 py-3">
          <dt className="w-32 shrink-0 text-sm text-[var(--ui-text-muted)]">
            Mobile number
          </dt>
          <dd className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ui-text)]">
            {phone || "Not added"}
          </dd>
          <button
            type="button"
            aria-label="Change mobile number"
            onClick={() => setChannel("phone")}
            className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
        </div>
      </dl>

      {channel ? (
        <ContactChangeDialog
          channel={channel}
          onClose={() => setChannel(null)}
          onChanged={() => setChannel(null)}
        />
      ) : null}
    </section>
  );
}
