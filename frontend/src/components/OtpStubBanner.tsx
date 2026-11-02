import { KeyRound } from "lucide-react";

export interface OtpStubBannerProps {
  code: string | null;
  channel: "phone" | "email";
}

function formatCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length === 6) {
    return `${trimmed.slice(0, 3)} ${trimmed.slice(3)}`;
  }
  return trimmed;
}

export function OtpStubBanner({ code, channel }: OtpStubBannerProps) {
  if (!code) {
    return null;
  }

  const grouped = formatCode(code);
  const text =
    channel === "email"
      ? `Test mode: your email code is ${grouped}.`
      : `Test mode: no SMS is sent yet. Your phone code is ${grouped}.`;

  return (
    <div className="flex items-center gap-2 p-3 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] text-xs text-[var(--color-ink)] font-body">
      <KeyRound className="h-3.5 w-3.5 text-[var(--color-accent)] flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
}
