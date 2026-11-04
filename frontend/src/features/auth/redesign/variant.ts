export type AuthVariant = "split" | "legacy";

/** The split layout is for desktop; mobile keeps its own screens. Flipping this in one place is the rollback. */
export const variantFor = (isMobile: boolean): AuthVariant => (isMobile ? "legacy" : "split");
