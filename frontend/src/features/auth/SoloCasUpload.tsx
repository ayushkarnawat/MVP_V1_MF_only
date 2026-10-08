import { useEffect, useRef, useState } from "react";
import { ImportFlow } from "../import/ImportFlow";
import { useAuth } from "./AuthContext";
import { createHouseholdMember, listHouseholdMembers } from "./api";
import { Loader2 } from "lucide-react";
import { PRIMARY_BTN } from "../import/prompts/copy";

interface SoloCasUploadProps {
  name: string;
}

export function SoloCasUpload({ name }: SoloCasUploadProps) {
  const { updateMe } = useAuth();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishFailed, setFinishFailed] = useState(false);

  // Two guards for two different problems:
  // - resolvingRef dedupes the network call itself. StrictMode double-invokes
  //   this effect in dev (mount -> cleanup -> remount, synchronously, before
  //   the `await` below ever resolves); without this, both invocations would
  //   see no existing "self" member and both call createHouseholdMember,
  //   producing a duplicate row (no DB uniqueness constraint catches it).
  // - mountedRef guards setState after real unmount. It must be a single ref
  //   shared across effect invocations, not a per-invocation `let cancelled`
  //   local: since the StrictMode dance runs entirely synchronously, a local
  //   `cancelled` would already be flipped by the first invocation's paired
  //   cleanup before the one real network call's promise settles, silently
  //   dropping the only result the component will ever get and leaving it
  //   stuck on "Setting up your profile..." forever.
  const resolvingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function resolveSelfMember() {
      try {
        // The self member is normally created at the onboarding name step now
        // (2026-10-01), so this reuses it. The create below is only a fallback
        // for sessions that reach upload without one. List-then-create: a
        // reload mid-onboarding must reuse the existing "self" row, not
        // duplicate it.
        const existing = await listHouseholdMembers();
        const self = existing.find((member) => member.relationship === "self");
        const member = self ?? (await createHouseholdMember(name.trim() || "Me", "self"));
        if (mountedRef.current) {
          setMemberId(member.id);
        }
      } catch {
        if (mountedRef.current) {
          setError("Couldn't set up your profile. Please try again.");
        }
      }
    }

    if (!resolvingRef.current) {
      resolvingRef.current = true;
      void resolveSelfMember();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [name]);

  // The import is already saved when this runs. With the "Import complete"
  // button gone (Phase 7), a failed save here needs its own retry, or the
  // user would sit on the spinner (review 8 Oct).
  // finishFailed stays set during a retry, so the upload form doesn't flash
  // back while the request is in flight; on success onboarding moves on.
  const handleDone = async () => {
    try {
      await updateMe({ onboarding_completed: true });
    } catch {
      if (mountedRef.current) setFinishFailed(true);
    }
  };

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-center">
        <p role="alert" className="text-xs sm:text-sm text-[var(--color-negative)] font-medium">
          {error}
        </p>
      </div>
    );
  }
  if (finishFailed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <p role="alert" className="text-xs sm:text-sm text-[var(--color-text-secondary)] font-medium">
          Your statement is saved, but we couldn’t finish setting up your account.
        </p>
        <button type="button" className={PRIMARY_BTN} onClick={() => void handleDone()}>Try again</button>
      </div>
    );
  }
  if (!memberId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-[var(--color-text-secondary)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
        <p className="text-xs sm:text-sm font-medium">Setting up your profile...</p>
      </div>
    );
  }

  return (
    <ImportFlow
      householdMemberId={memberId}
      surface="onboarding_upload"
      onDone={handleDone}
    />
  );
}
