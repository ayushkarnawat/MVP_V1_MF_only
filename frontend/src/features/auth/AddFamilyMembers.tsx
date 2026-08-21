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
import { createHouseholdMember } from "./api";
import type { HouseholdMember, Relationship } from "./types";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface AddFamilyMembersProps {
  members: HouseholdMember[];
  onMembersChange: (members: HouseholdMember[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

const RELATIONSHIPS: Relationship[] = ["spouse", "parent", "child", "sibling", "other"];

export function AddFamilyMembers({
  members,
  onMembersChange,
  onBack,
  onContinue,
}: AddFamilyMembersProps) {
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("parent");
  const [otherLabel, setOtherLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const member = await createHouseholdMember(
        name.trim(),
        relationship,
        relationship === "other" ? otherLabel.trim() || undefined : undefined
      );
      onMembersChange([...members, member]);
      setName("");
      setOtherLabel("");
    } catch {
      setError("Couldn't add that member. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-xl mx-auto space-y-6 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="household" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
          HOUSEHOLD ROSTER
        </span>
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          Who else are you tracking for?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Add family members to enable family aggregate views and independent per-member statements.
        </p>
      </motion.div>

      {/* 2. Added Members Roster */}
      {members.length > 0 && (
        <motion.div variants={staggerItemVariants} className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-secondary)] px-1">
            <span>Added Family Members ({members.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {members.map((member) => (
              <div
                key={member.id}
                className="p-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] font-semibold text-xs flex items-center justify-center flex-shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-xs sm:text-sm text-[var(--color-ink)] truncate">
                      {member.name}
                    </p>
                    <span className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider font-mono font-medium">
                      {member.relationship_other_label || member.relationship}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-accent)] border border-[color-mix(in_srgb,var(--color-accent)_20%,transparent)]">
                  Active
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 3. Member Input Form */}
      <motion.form
        variants={staggerItemVariants}
        onSubmit={handleAdd}
        className="p-5 sm:p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-4 shadow-xs"
      >
        <div className="flex items-center gap-2 pb-1 border-b border-[var(--color-border)]/50">
          <Users className="h-4 w-4 text-[var(--color-accent)]" />
          <h3 className="font-display font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
            Add New Member
          </h3>
        </div>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <label htmlFor="member-name" className="text-xs font-semibold text-[var(--color-ink)] block">
              Member&apos;s Full Name
            </label>
            <div className="flex items-center rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent)]/20 transition-all overflow-hidden h-11 px-3.5 gap-2.5">
              <User className="h-4 w-4 text-[var(--color-text-secondary)] flex-shrink-0" />
              <input
                id="member-name"
                value={name}
                placeholder="e.g. Sunita Karnawat"
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
                className="flex-1 bg-transparent text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none focus:ring-0 focus:border-transparent border-none outline-none ring-0 shadow-none appearance-none selection:bg-[var(--color-accent)]/20 selection:text-[var(--color-ink)] caret-[var(--color-accent)]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="member-rel" className="text-xs font-semibold text-[var(--color-ink)] block">
              Relationship
            </label>
            <Select
              value={relationship}
              onValueChange={(value) => setRelationship(value as Relationship)}
            >
              <SelectTrigger
                id="member-rel"
                className="w-full h-11 rounded-xl border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs sm:text-sm font-medium text-[var(--color-ink)] focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((option) => (
                  <SelectItem key={option} value={option} className="text-xs sm:text-sm">
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {relationship === "other" && (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              <label htmlFor="other-label" className="text-xs font-semibold text-[var(--color-ink)] block">
                Describe Relationship
              </label>
              <div className="flex items-center rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent)]/20 transition-all overflow-hidden h-11 px-3.5 gap-2.5">
                <input
                  id="other-label"
                  value={otherLabel}
                  placeholder="e.g. Uncle, In-law"
                  onChange={(event) => setOtherLabel(event.target.value)}
                  className="flex-1 bg-transparent text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none border-none outline-none ring-0 shadow-none appearance-none selection:bg-[var(--color-accent)]/20 selection:text-[var(--color-ink)] caret-[var(--color-accent)]"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs text-[var(--color-negative)] font-medium">
            {error}
          </p>
        )}

        <Button
          variant="outline"
          size="md"
          type="submit"
          disabled={adding || !name.trim()}
          className="w-full h-11 rounded-xl border-[var(--color-border)] hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-bg))] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/40 font-semibold text-xs sm:text-sm gap-2 transition-all cursor-pointer"
        >
          {adding ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Adding...</span>
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              <span>Add Member</span>
            </>
          )}
        </Button>
      </motion.form>

      {/* 4. Navigation Controls */}
      <motion.div variants={staggerItemVariants} className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>

        <Button
          variant="primary"
          type="button"
          disabled={members.length === 0}
          onClick={onContinue}
          className="h-11 sm:h-12 px-6 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </motion.div>
    </motion.div>
  );
}
