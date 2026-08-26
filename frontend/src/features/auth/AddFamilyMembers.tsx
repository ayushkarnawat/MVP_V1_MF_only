import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Users, Plus, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { MobileOnboardingScreen } from "./MobileOnboardingScreen";
import { createHouseholdMember } from "./api";
import type { HouseholdMember, Relationship } from "./types";
import {
  onboardingContainerVariants,
  onboardingHeadingVariants,
  onboardingIllustrationVariants,
  onboardingOptionItemVariants,
  onboardingFooterVariants,
} from "@/lib/motion";

interface AddFamilyMembersProps {
  members: HouseholdMember[];
  onMembersChange: (members: HouseholdMember[]) => void;
  onBack: () => void;
  onSkip?: () => void;
  onContinue: () => void;
  isMobile?: boolean;
  currentStepIndex?: number;
  totalSteps?: number;
}

const RELATIONSHIPS: Relationship[] = ["spouse", "parent", "child", "sibling", "other"];

export function AddFamilyMembers({
  members,
  onMembersChange,
  onBack,
  onSkip,
  onContinue,
  isMobile = false,
  currentStepIndex = 4,
  totalSteps = 5,
}: AddFamilyMembersProps) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("parent");
  const [otherLabel, setOtherLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const newMember = await createHouseholdMember(
        name.trim(),
        relationship,
        relationship === "other" && otherLabel.trim() ? otherLabel.trim() : undefined,
      );
      onMembersChange([...members, newMember]);
      setName("");
      setRelationship("parent");
      setOtherLabel("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setLoading(false);
    }
  };

  const familyContent = (
    <div className="w-full space-y-4 text-left">
      {/* 1. Added Members Roster */}
      {members.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-secondary)] px-1 tracking-tight">
            <span>Added Family Members ({members.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {members.map((member) => (
              <div
                key={member.id}
                className="p-3 rounded-2xl bg-[var(--color-surface)] border border-[color-mix(in_srgb,var(--color-border)_70%,transparent)] flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-xl bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-bold text-xs flex items-center justify-center flex-shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display font-bold text-xs sm:text-sm text-[var(--color-ink)] truncate">
                      {member.name}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-secondary)] capitalize truncate">
                      {member.relationship === "other" && member.relationship_other_label
                        ? member.relationship_other_label
                        : member.relationship}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Add New Member Inline Form */}
      <form onSubmit={handleAdd} className="p-3.5 sm:p-4 rounded-3xl bg-[var(--color-bg)] border border-[var(--color-border)] space-y-3 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-ink)] tracking-tight">
          <Users className="h-4 w-4 text-[var(--color-accent)]" />
          <span>Add Family Member</span>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] text-[var(--color-negative)] text-xs font-medium">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {/* Member Name */}
          <div className="relative flex items-center rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent)]/20 transition-all overflow-hidden h-11 px-3.5 gap-2.5 shadow-xs">
            <User className="h-4 w-4 text-[var(--color-text-secondary)] flex-shrink-0" />
            <input
              id="member-name"
              type="text"
              value={name}
              placeholder="Member's full name"
              aria-label="Member's full name"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              onChange={(e) => setName(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-medium text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none border-none outline-none ring-0 shadow-none appearance-none"
            />
          </div>

          {/* Relationship Selection */}
          <Select
            value={relationship}
            onValueChange={(val) => setRelationship(val as Relationship)}
          >
            <SelectTrigger
              id="member-rel"
              aria-label="Relationship"
              className="w-full h-11 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xs sm:text-sm font-medium text-[var(--color-ink)] px-3.5 shadow-xs"
            >
              <SelectValue placeholder="Select relationship" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
              {RELATIONSHIPS.map((option) => (
                <SelectItem
                  key={option}
                  value={option}
                  className="text-xs sm:text-sm rounded-xl py-2 cursor-pointer capitalize"
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Other Label input if relationship === 'other' */}
          {relationship === "other" && (
            <div className="relative flex items-center rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent)]/20 transition-all overflow-hidden h-11 px-3.5 shadow-xs">
              <input
                id="member-custom-rel"
                type="text"
                value={otherLabel}
                placeholder="Specify relationship (e.g. Grandparent, Uncle)"
                aria-label="Custom relationship label"
                onChange={(e) => setOtherLabel(e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-medium text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none border-none outline-none ring-0 shadow-none appearance-none"
              />
            </div>
          )}
        </div>

        <Button
          type="submit"
          variant="outline"
          disabled={!name.trim() || loading}
          className="w-full h-11 rounded-xl border-[var(--color-border)] hover:bg-[#10B981]/10 hover:text-[#10B981] hover:border-[#10B981]/40 font-semibold text-xs sm:text-sm gap-2 transition-all cursor-pointer min-h-[44px]"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-accent)]" />
          ) : (
            <>
              <Plus className="h-4 w-4" />
              <span>Add Member</span>
            </>
          )}
        </Button>
      </form>
    </div>
  );

  if (isMobile) {
    return (
      <MobileOnboardingScreen
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        onBack={onBack}
        onSkip={onSkip}
        title="Who else are you tracking for?"
        illustrationVariant="family"
        subtext="Add family members to enable family aggregate views and independent per-member statements."
        ctaLabel="Connect my investments"
        ctaDisabled={members.length === 0}
        onCtaClick={onContinue}
        ctaIcon={<ArrowRight className="h-4 w-4" />}
      >
        {familyContent}
      </MobileOnboardingScreen>
    );
  }

  return (
    <motion.div
      variants={onboardingContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-xl mx-auto space-y-6 text-left box-border"
    >
      <motion.div variants={onboardingIllustrationVariants}>
        <OnboardingIllustration variant="family" />
      </motion.div>

      <motion.div variants={onboardingHeadingVariants} className="space-y-1.5">
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          Who else are you tracking for?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Add family members to enable family aggregate views and independent per-member statements.
        </p>
      </motion.div>

      <motion.div variants={onboardingOptionItemVariants}>
        {familyContent}
      </motion.div>

      <motion.div variants={onboardingFooterVariants} className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer min-h-[44px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>

        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.985 }}>
          <Button
            variant="primary"
            type="button"
            disabled={members.length === 0}
            onClick={onContinue}
            className="h-11 sm:h-12 px-6 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer transition-all min-h-[44px] sm:min-h-[48px]"
          >
            <span>Connect my investments</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
