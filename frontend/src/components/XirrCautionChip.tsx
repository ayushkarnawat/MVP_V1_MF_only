import { CAUTION_CHIP, type XirrCaution } from "../lib/xirrDisplay";

export function XirrCautionChip({
  caution,
  variant = "pill",
}: {
  caution: XirrCaution;
  variant?: "pill" | "note";
}) {
  const { text, tip } = CAUTION_CHIP[caution];
  const isPill = variant === "pill";

  const baseClass = isPill
    ? "inline-flex w-fit shrink-0 items-center gap-[5px] rounded-full border px-2 py-1 text-[10.5px] font-semibold leading-none whitespace-nowrap"
    : "inline-flex items-center gap-[5px] text-[11px] font-semibold leading-none whitespace-nowrap mt-[3px]";

  const toneClass = isPill
    ? caution === "young"
      ? "border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[var(--warn-bg)] text-[var(--warn-text)]"
      : "border-[var(--ui-divider)] bg-[var(--ui-card)] text-[var(--ui-text)]"
    : caution === "young"
      ? "text-[var(--warn-text)]"
      : "text-[var(--ui-text-muted)]";

  const dotClass =
    caution === "young" ? "bg-[var(--warn)]" : "bg-[var(--ui-text-muted)]";

  return (
    <span
      role="note"
      data-testid="xirr-caution"
      data-variant={variant}
      title={tip}
      aria-label={tip}
      className={`${baseClass} ${toneClass}`}
    >
      <span
        data-testid="caution-dot"
        aria-hidden="true"
        className={`h-[5px] w-[5px] shrink-0 rounded-full ${dotClass}`}
      />
      {text}
    </span>
  );
}
