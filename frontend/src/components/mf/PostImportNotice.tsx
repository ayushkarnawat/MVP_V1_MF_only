import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewFundsList, type NewFund } from "./NewFundsList";
import { useAuth } from "@/features/auth/AuthContext";

export interface PostImportNoticeContent {
  text: string;
  details?: string[];
  newFunds?: NewFund[];
}

type NoticeState = { importNotice?: PostImportNoticeContent | null; importNoticeUser?: string | null } | null;

/** The "N transactions added" notice the import flow leaves in the history state. The state outlives a logout in
 * the same tab, so the notice carries the user it was written for and is shown only to that user (register C29). */
export function PostImportNotice() {
  const { me } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [listOpen, setListOpen] = useState(false);
  const state = location.state as NoticeState;
  const notice = me && state?.importNoticeUser === me.user_id ? state.importNotice ?? null : null;
  if (!notice) return null;
  return (
    <div role="status" className="mb-4 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 p-3 text-sm">
      <p>{notice.text}</p>
      {notice.details?.map((detail, index) => <p key={index}>{detail}</p>)}
      {notice.newFunds && notice.newFunds.length > 0 && (
        <>
          <button type="button" onClick={() => setListOpen(true)}>View new funds</button>
          <Dialog open={listOpen} onOpenChange={setListOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>New funds in this statement</DialogTitle></DialogHeader>
              <NewFundsList funds={notice.newFunds} showHistoryLink />
            </DialogContent>
          </Dialog>
        </>
      )}
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
