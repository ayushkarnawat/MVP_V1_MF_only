import { initialsOf } from "../lib/initialsOf";

const TONE_CLASSES = [
  "bg-[var(--c1)]",
  "bg-[var(--c2)]",
  "bg-[var(--c3)]",
  "bg-[var(--c4)]",
];

export interface InitialsAvatarProps {
  name: string | null | undefined;
  size?: number;
  tone?: number;
}

export function InitialsAvatar({
  name,
  size = 40,
  tone = 0,
}: InitialsAvatarProps) {
  const index = ((tone % 4) + 4) % 4;
  return (
    <span
      data-testid="initials-avatar"
      data-tone={String(index)}
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ${TONE_CLASSES[index]}`}
    >
      {initialsOf(name)}
    </span>
  );
}
