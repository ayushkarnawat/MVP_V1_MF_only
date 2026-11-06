import { ArrowLeft } from "lucide-react";
import { listHouseholdMembers } from "@/features/auth/api";
import {
  deleteHouseholdImport,
  getHouseholdImportHistory,
} from "@/features/import/api";
import { ImportHistorySection } from "@/features/profile/ImportHistorySection";
import { invalidateApiCache } from "@/lib/apiClient";
import { paths } from "@/shell/nav/paths";
import { useBack } from "@/shell/nav/useBack";
import { useScope } from "@/shell/scope/ScopeContext";
import { ProfileFrame } from "../ProfileFrame";

export default function ImportHistoryPage() {
  const { refreshMembers } = useScope();
  const back = useBack(paths.profileSettings());

  return (
    <ProfileFrame>
      <div className="space-y-4">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--shell-text-body)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </button>

        <ImportHistorySection
          loadImportHistory={getHouseholdImportHistory}
          deleteImport={deleteHouseholdImport}
          loadMembers={listHouseholdMembers}
          onChanged={() => {
            invalidateApiCache();
            void refreshMembers();
          }}
        />
      </div>
    </ProfileFrame>
  );
}
