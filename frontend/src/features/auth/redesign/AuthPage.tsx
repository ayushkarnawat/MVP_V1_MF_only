import type { ReactNode } from "react";

/** The page the split card sits on: light only, centred, with room around the card. */
export function AuthPage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center bg-[#F4FAF6] p-6">{children}</div>;
}
