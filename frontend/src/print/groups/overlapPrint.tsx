import type { ReactNode } from "react";

// Print versions of the overlap sections: one entry per section id, `() => ReactNode`. Empty until that group's task fills it;
// every id not listed here keeps the placeholder in sectionRegistry.ts. Each group edits only its own file.
export const overlapPrintSections: Record<string, () => ReactNode> = {};
