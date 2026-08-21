import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getAmcInfo } from "@/lib/amcLogos";

export interface SchemeLogoProps {
  fundLogoUrl?: string | null;
  amcLogoUrl?: string | null;
  logoUrl?: string | null;
  amcName?: string | null;
  schemeName?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function SchemeLogo({
  fundLogoUrl,
  amcLogoUrl,
  logoUrl,
  amcName = "",
  schemeName = "",
  size = "md",
  className,
}: SchemeLogoProps) {
  const [failCount, setFailCount] = useState(0);

  // Compute prioritized list of official image candidates
  const candidates = useMemo(() => {
    const amcInfo = getAmcInfo(amcName, schemeName);
    const urls: string[] = [];

    if (amcInfo) {
      urls.push(amcInfo.officialLogoUrl);
      urls.push(amcInfo.clearbitLogoUrl);
    }

    if (amcLogoUrl) urls.push(amcLogoUrl);
    if (fundLogoUrl) urls.push(fundLogoUrl);
    if (logoUrl) urls.push(logoUrl);

    // Deduplicate valid non-empty URLs
    return Array.from(new Set(urls.filter(Boolean)));
  }, [amcName, schemeName, amcLogoUrl, fundLogoUrl, logoUrl]);

  const currentSrc = candidates[failCount] || null;

  const nameForInitial = (amcName || schemeName || "U").trim();
  const initial = nameForInitial.charAt(0).toUpperCase();

  const sizeClasses =
    size === "sm"
      ? "h-6 w-6 text-[10px]"
      : size === "lg"
      ? "h-9 w-9 text-sm"
      : "h-7 w-7 sm:h-8 sm:w-8 text-xs";

  if (currentSrc) {
    return (
      <div
        className={cn(
          "rounded-lg bg-white dark:bg-zinc-900 border border-[var(--color-border)] p-0.5 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs",
          sizeClasses,
          className
        )}
      >
        <img
          src={currentSrc}
          alt={amcName || schemeName || "AMC Logo"}
          className="h-full w-full object-contain rounded-md"
          onError={() => setFailCount((prev) => prev + 1)}
        />
      </div>
    );
  }

  // Fallback initial tile for AMCs with no available mapping or network failures
  return (
    <div
      className={cn(
        "rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_20%,var(--color-border))] text-[var(--color-ink)] font-bold flex items-center justify-center flex-shrink-0 select-none shadow-2xs font-mono",
        sizeClasses,
        className
      )}
      title={amcName || schemeName || undefined}
    >
      <span className="text-[var(--color-accent)]">{initial}</span>
    </div>
  );
}
