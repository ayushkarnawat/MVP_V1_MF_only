import type { ReactNode } from "react";

// Print versions of the allocation sections: one entry per section id, `() => ReactNode`. Empty until that group's task fills it;
// every id not listed here keeps the placeholder in sectionRegistry.ts. Each group edits only its own file.
export const allocationPrintSections: Record<string, () => ReactNode> = {};
