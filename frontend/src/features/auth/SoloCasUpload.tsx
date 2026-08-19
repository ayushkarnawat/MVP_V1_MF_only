import { useEffect, useRef, useState } from "react";
import { ImportFlow } from "../import/ImportFlow";
import { useAuth } from "./AuthContext";
import { createHouseholdMember, listHouseholdMembers } from "./api";
import { Loader2 } from "lucide-react";

interface SoloCasUploadProps {
  name: string;
}

export function SoloCasUpload({ name }: SoloCasUploadProps) {
  const { updateMe } = useAuth();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        // List-then-create: there's no PATCH /household-members, so a reload
        // mid-onboarding must reuse the existing "self" row, not duplicate it.
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

  const handleDone = async () => {
    await updateMe({ onboarding_completed: true });
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
  if (!memberId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-[var(--color-text-secondary)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
        <p className="text-xs sm:text-sm font-medium">Setting up your profile...</p>
      </div>
    );
  }

  return <ImportFlow householdMemberId={memberId} ctaLabel="Continue" onDone={handleDone} />;
}
