import { useState } from "react";
import { motion } from "motion/react";
import { TwoPathImportContainer } from "../import/TwoPathImportContainer";
import { clearCasResumeStep2 } from "../import/casResumeState";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, UploadCloud, CheckCircle2, CircleDashed } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import type { HouseholdMember } from "./types";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

export interface FamilyUpload {
  memberId: string;
  memberName: string;
  file: File;
  password: string;
}

interface FamilyCasUploadProps {
  members: HouseholdMember[];
  queue: FamilyUpload[];
  onQueueUpload: (upload: FamilyUpload) => void;
  onSkip: (memberId: string) => void;
  skipped: Set<string>;
  onContinue: () => void;
}

export function FamilyCasUpload({
  members,
  queue,
  onQueueUpload,
  onSkip,
  skipped,
  onContinue,
}: FamilyCasUploadProps) {
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);

  const isUploaded = (memberId: string) => queue.some((item) => item.memberId === memberId);
  const isSkipped = (memberId: string) => skipped.has(memberId);
  const allHandled = members.every((member) => isUploaded(member.id) || isSkipped(member.id));

  if (activeMemberId) {
    const member = members.find((m) => m.id === activeMemberId);
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl mx-auto space-y-6 text-left box-border"
      >
        <button
          type="button"
          onClick={() => {
            clearCasResumeStep2(activeMemberId);
            setActiveMemberId(null);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] transition-colors cursor-pointer py-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>← Back to Family List</span>
        </button>

        <div className="space-y-1">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
            MEMBER STATEMENT
          </span>
          <h2 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight">
            {member ? `Import Statement for ${member.name}` : "Import Statement"}
          </h2>
        </div>

        <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 sm:p-6 shadow-xs">
          <TwoPathImportContainer
            memberId={activeMemberId}
            onUploadSubmit={(file, password) => {
              if (member) {
                onQueueUpload({ memberId: member.id, memberName: member.name, file, password });
              }
              setActiveMemberId(null);
            }}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-xl mx-auto space-y-6 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="upload" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
          HOUSEHOLD STATEMENTS
        </span>
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          Family CAS Upload
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Upload mutual fund statements for each member in your household.
        </p>
      </motion.div>

      {/* 2. Member Statement Cards */}
      <motion.div variants={staggerItemVariants} className="space-y-3">
        {members.map((member) => {
          const uploaded = isUploaded(member.id);
          const skippedMember = isSkipped(member.id);

          return (
            <div
              key={member.id}
              className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-3.5 shadow-xs transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] font-display font-bold text-sm flex items-center justify-center flex-shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <strong className="block font-display font-semibold text-sm sm:text-base text-[var(--color-ink)] truncate">
                      {member.name}
                    </strong>
                    <span className="text-[11px] text-[var(--color-text-secondary)] capitalize">
                      {member.relationship_other_label || member.relationship}
                    </span>
                  </div>
                </div>

                {uploaded ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-positive)] bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-positive)_25%,transparent)] px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Uploaded</span>
                  </span>
                ) : skippedMember ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg)] border border-[var(--color-border)] px-2.5 py-1 rounded-full">
                    <span>Skipped</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg)] border border-[var(--color-border)] px-2.5 py-1 rounded-full">
                    <CircleDashed className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                    <span>Not Uploaded</span>
                  </span>
                )}
              </div>

              {!uploaded && (
                <div className="flex items-center justify-between gap-2.5 pt-1 border-t border-[var(--color-border)]/50 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setActiveMemberId(member.id)}
                    className="h-9 px-3.5 rounded-xl bg-[var(--color-ink)] text-[var(--color-surface)] hover:bg-[var(--color-ink)]/90 font-semibold text-xs gap-1.5 shadow-xs cursor-pointer active:scale-[0.99] transition-all"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    <span>{`Upload CAS for ${member.name}`}</span>
                  </Button>

                  <button
                    type="button"
                    onClick={() => onSkip(member.id)}
                    className="inline-flex items-center text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <span>{`Skip for now — ${member.name}`}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* 3. Continue Action */}
      <motion.div variants={staggerItemVariants} className="pt-2">
        <Button
          type="button"
          disabled={!allHandled}
          onClick={onContinue}
          className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </motion.div>
    </motion.div>
  );
}

