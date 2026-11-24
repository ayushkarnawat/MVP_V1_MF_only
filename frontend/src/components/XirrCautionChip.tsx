import { CAUTION_CHIP, type XirrCaution } from "../lib/xirrDisplay";

export function XirrCautionChip({ caution }: { caution: XirrCaution }) {
  const { text, tip } = CAUTION_CHIP[caution];
  const toneClass =
    caution === "young"
      ? "bg-[var(--warn-bg)] text-[var(--warn-text)]"
      : "border border-[var(--ui-divider)] bg-[var(--ui-card)] text-[var(--ui-text-muted)]";

  return (
    <span
      role="note"
      data-testid="xirr-caution"
      title={tip}
      aria-label={tip}
      className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass}`}
    >
      {text}
    </span>
  );
}
