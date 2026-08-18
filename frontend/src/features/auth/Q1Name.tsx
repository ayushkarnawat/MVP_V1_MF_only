import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { User, ArrowLeft, ArrowRight } from "lucide-react";
import { OnboardingIllustration } from "./OnboardingIllustration";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

interface Q1NameProps {
  value: string;
  onBack?: () => void;
  onSkip: () => void;
  onSubmit: (name: string) => void;
}

export function Q1Name({ value, onBack, onSkip, onSubmit }: Q1NameProps) {
  const [name, setName] = useState(value);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(name);
  };

  return (
    <motion.form
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      onSubmit={handleSubmit}
      className="w-full space-y-6 text-left box-border"
    >
      {/* Visual Artwork Anchor */}
      <motion.div variants={staggerItemVariants}>
        <OnboardingIllustration variant="name" />
      </motion.div>

      {/* 1. Header with Eyebrow */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] block font-mono">
          PERSONALIZE YOUR EXPERIENCE
        </span>
        <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight leading-snug">
          What should we call you?
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          A few quick questions will help us tailor your wealth tracking experience to you.
        </p>
      </motion.div>

      {/* 2. Name Input Group */}
      <motion.div variants={staggerItemVariants} className="space-y-2">
        <label
          htmlFor="name-input"
          className="text-xs font-semibold text-[var(--color-ink)] block"
        >
          Your Full Name or First Name
        </label>
        <div className="flex items-center rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent)]/20 transition-all overflow-hidden h-11 sm:h-12 min-h-[44px] px-3.5 gap-2.5">
          <User className="h-4 w-4 text-[var(--color-text-secondary)] flex-shrink-0" />
          <input
            id="name-input"
            type="text"
            value={name}
            placeholder="e.g. Ayush Karnawat"
            autoComplete="name"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck="false"
            onChange={(event) => setName(event.target.value)}
            className="flex-1 bg-transparent text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none border-none outline-none ring-0 shadow-none appearance-none selection:bg-[var(--color-accent)]/20 selection:text-[var(--color-ink)] caret-[var(--color-accent)]"
            autoFocus
          />
        </div>
      </motion.div>

      {/* 3. Navigation Controls */}
      <motion.div variants={staggerItemVariants} className="flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer"
          >
            Skip
          </button>
        </div>

        <Button
          variant="primary"
          type="submit"
          disabled={!name.trim()}
          className="h-11 sm:h-12 px-6 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-1.5 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          <span>Next</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </motion.div>
    </motion.form>
  );
}
