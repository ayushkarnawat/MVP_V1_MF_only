import type { PeopleEdits } from "@/features/import/PeopleFoundDialog";
import { MemberRibbonReview } from "@/features/import/MemberRibbonReview";
import { ReviewExpiryBanner } from "@/features/import/ReviewExpiryBanner";
import type { ImportPreviewResponse, PersonConfirmation, PersonPreview } from "@/features/import/types";

export interface MobileReviewViewProps {
  preview: ImportPreviewResponse;
  /** The people to review, one ribbon each (anyone left out under U8 is not in this list). */
  people: PersonPreview[];
  edits: PeopleEdits;
  nameAnswers: Record<string, boolean>;
  confirming: boolean;
  onConfirmImports: (people: PersonConfirmation[], movedFunds: Record<string, string>) => void;
  onCancel: () => void;
}

// The parse/confirm logic and the per-person review live in the shared import
// flow (useImportFlow + MemberRibbonReview); this only lays them out for a phone.
export function MobileReviewView({ preview, people, edits, nameAnswers, confirming, onConfirmImports, onCancel }: MobileReviewViewProps) {
  return (
    <div className="w-full min-w-0 max-w-md mx-auto space-y-3 pt-1 pb-8 box-border">
      <ReviewExpiryBanner key={preview.session_id} expiresAt={preview.expires_at} />
      <MemberRibbonReview
        key={preview.session_id}
        preview={preview}
        people={people}
        edits={edits}
        nameAnswers={nameAnswers}
        confirming={confirming}
        onConfirmImports={onConfirmImports}
        onCancel={onCancel}
      />
    </div>
  );
}
