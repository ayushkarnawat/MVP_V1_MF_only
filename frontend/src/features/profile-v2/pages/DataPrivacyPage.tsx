import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { getMyConsents, type MyConsent } from "@/features/legal/api";
import { TermsSection } from "@/features/profile/TermsSection";
import { ProfileFrame } from "../ProfileFrame";
import { ConsentList } from "../components/ConsentList";
import { DeleteAccountDialog } from "../components/DeleteAccountDialog";
import { StoredDataNote } from "../components/StoredDataNote";

type ConsentsState = {
  status: "loading" | "ready" | "error";
  items: MyConsent[];
};

export default function DataPrivacyPage() {
  const [consents, setConsents] = useState<ConsentsState>({ status: "loading", items: [] });
  const [deleting, setDeleting] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(() => {
    const request = ++requestRef.current;
    getMyConsents()
      .then(items => {
        if (requestRef.current === request) setConsents({ status: "ready", items });
      })
      .catch(() => {
        if (requestRef.current === request) setConsents({ status: "error", items: [] });
      });
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  return (
    <>
      <ProfileFrame>
        <div className="space-y-5">
          <TermsSection />

          <ConsentList
            status={consents.status}
            consents={consents.items}
            onRetry={() => {
              setConsents({ status: "loading", items: [] });
              load();
            }}
          />

          <StoredDataNote />

          <section
            data-testid="delete-account-card"
            className="rounded-[14px] border border-[var(--neg)] bg-[var(--neg-bg)] p-5"
          >
            <h2 className="font-heading text-lg font-semibold text-[var(--neg-text)]">
              Delete account
            </h2>
            <p className="mt-1 text-sm text-[var(--shell-text-body)]">
              Permanently remove your account and household data after a 30-day grace period.
            </p>
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--neg)] px-4 py-2 text-sm font-semibold text-[var(--neg-text)] hover:bg-[var(--neg-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>Delete Account</span>
            </button>
          </section>
        </div>
      </ProfileFrame>

      {deleting ? <DeleteAccountDialog onClose={() => setDeleting(false)} /> : null}
    </>
  );
}
