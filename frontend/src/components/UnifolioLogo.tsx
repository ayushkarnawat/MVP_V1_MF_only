import React from "react";
import { cn } from "@/lib/utils";

export interface UnifolioLogoProps {
  /**
   * - "auto": standard black + green in light mode, white in dark mode.
   * - "light": always standard black + Unifolio green.
   * - "dark": always white variant for dark backgrounds.
   */
  variant?: "auto" | "light" | "dark";
  /**
   * If true, renders the compact ring-only brand mark.
   */
  markOnly?: boolean;
  /**
   * Outer container styling (e.g. `h-7 sm:h-8`).
   */
  className?: string;
  /**
   * Image element styling.
   */
  imgClassName?: string;
  /**
   * Accessible image alt text. Defaults to "Unifolio".
   */
  alt?: string;
  /**
   * Accessible container label. Defaults to "Unifolio Logo" or "Unifolio Logo Glyph".
   */
  ariaLabel?: string;
  /**
   * Optional click handler.
   */
  onClick?: () => void;
}

export function UnifolioLogo({
  variant = "auto",
  markOnly = false,
  className,
  imgClassName,
  alt = "Unifolio",
  ariaLabel,
  onClick,
}: UnifolioLogoProps) {
  const defaultAriaLabel = markOnly ? "Unifolio Logo Glyph" : "Unifolio Logo";
  const lightSrc = markOnly ? "/brand/unifolio-ring.png" : "/brand/unifolio-logo-light.png";
  const darkSrc = markOnly ? "/brand/unifolio-ring-dark.png" : "/brand/unifolio-logo-dark.png";

  return (
    <div
      className={cn(
        "inline-flex items-center select-none flex-shrink-0 relative",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel || defaultAriaLabel}
    >
      {variant === "auto" ? (
        <>
          <img
            src={lightSrc}
            alt={alt}
            className={cn(
              "h-full w-auto max-h-full object-contain block dark:hidden select-none pointer-events-none",
              imgClassName
            )}
            draggable={false}
          />
          <img
            src={darkSrc}
            alt={alt}
            className={cn(
              "h-full w-auto max-h-full object-contain hidden dark:block select-none pointer-events-none",
              imgClassName
            )}
            draggable={false}
          />
        </>
      ) : variant === "light" ? (
        <img
          src={lightSrc}
          alt={alt}
          className={cn(
            "h-full w-auto max-h-full object-contain select-none pointer-events-none",
            imgClassName
          )}
          draggable={false}
        />
      ) : (
        <img
          src={darkSrc}
          alt={alt}
          className={cn(
            "h-full w-auto max-h-full object-contain select-none pointer-events-none",
            imgClassName
          )}
          draggable={false}
        />
      )}
      <span className="sr-only">Unifolio</span>
    </div>
  );
}

export function UnifolioRingMark(props: Omit<UnifolioLogoProps, "markOnly">) {
  return <UnifolioLogo markOnly {...props} />;
}
