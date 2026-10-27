import { useLocation, useNavigate } from "react-router";
import { useAuth } from "@/features/auth/AuthContext";

export interface PostImportNoticeContent {
  text: string;
  details?: string[];
}

type NoticeState = { importNotice?: PostImportNoticeContent | null; importNoticeUser?: string | null } | null;

/** The "N transactions added" notice the import flow leaves in the history state. The state outlives a logout in
 * the same tab, so the notice carries the user it was written for and is shown only to that user (register C29). */
export function PostImportNotice() {
  const { me } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as NoticeState;
  const notice = me && state?.importNoticeUser === me.user_id ? state.importNotice ?? null : null;
  if (!notice) return null;
  return (
    <div role="status" className="mb-4 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 p-3 text-sm">
      <p>{notice.text}</p>
      {notice.details?.map((detail, index) => <p key={index}>{detail}</p>)}
      <button
        type="button"
        aria-label="Dismiss import notice"
        onClick={() => { void navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null }); }}
      >
        Dismiss
      </button>
    </div>
  );
}
