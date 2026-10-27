import { ArrowLeft } from "lucide-react";
import { listHouseholdMembers } from "@/features/auth/api";
import {
  deleteHouseholdImport,
  getHouseholdImportHistory,
} from "@/features/import/api";
import { ImportHistorySection } from "@/features/profile/ImportHistorySection";
import { invalidateApiCache } from "@/lib/apiClient";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";
import { useScope } from "@/shell/scope/ScopeContext";
import { ProfileFrame } from "../ProfileFrame";

export default function ImportHistoryPage() {
  const { refreshMembers } = useScope();

  return (
    <ProfileFrame>
      <div className="space-y-4">
        <AppLink
          to={paths.profileSettings()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--shell-text-body)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Settings
        </AppLink>

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
