import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CircleCheck, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewFundsList, type NewFund } from "./NewFundsList";
import { useAuth } from "@/features/auth/AuthContext";

export interface PostImportNoticeContent {
  text: string;
  details?: string[];
  newFunds?: NewFund[];
  members?: { name: string; added: number; skipped: number }[];
  warnings?: string[];
  counts?: { newFunds: number; added: number; skipped: number };
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

  const title = notice.counts ? "Import complete" : notice.text;

  return (
    <div
      data-testid="import-notice-card"
      role="status"
      className="mb-4 rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-3.5 text-sm text-[var(--ui-text)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CircleCheck className="h-[18px] w-[18px] shrink-0 text-[var(--pos)]" aria-hidden="true" />
          <p data-testid="import-notice-title" className="text-[14.5px] font-bold leading-snug">{title}</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss import notice"
          onClick={() => {
            void navigate(
              { pathname: location.pathname, search: location.search, hash: location.hash },
              { replace: true, state: null }
            );
          }}
          className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md text-[var(--ui-text-muted)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {notice.counts && (
        <p data-testid="import-notice-summary" className="mt-1.5 text-[13px] text-[var(--ui-text-muted)]">
          <b className="font-semibold text-[var(--ui-text)]">
            {notice.counts.newFunds} {notice.counts.newFunds === 1 ? "new fund" : "new funds"}
          </b>
          {" "}· {notice.counts.added} {notice.counts.added === 1 ? "transaction" : "transactions"} added
        </p>
      )}

      {notice.members && notice.members.length > 0 && (
        <div data-testid="import-notice-members" className="mt-2.5">
          {notice.members.map((member) => (
            <div
              key={member.name}
              data-testid="import-notice-member"
              className="flex items-center justify-between gap-3 border-t border-[var(--ui-divider)] py-1.5"
            >
              <span className="min-w-0 truncate text-[13px]">{member.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                {member.skipped > 0 && (
                  <span className="text-[11.5px] text-[var(--ui-text-muted)]">
                    {member.skipped} already saved
                  </span>
                )}
                <span className="rounded-full border border-[var(--pos)]/35 bg-[var(--pos-bg)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--pos-text)]">
                  {member.added} added
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Warnings have a line of their own below, so a detail line that is only a warning is not shown twice. */}
      {!notice.counts && (!notice.members || notice.members.length === 0) && notice.details?.filter((detail) => !notice.warnings?.includes(detail)).map((detail, index) => (
        <p key={index} className="mt-1 text-[13px] text-[var(--ui-text-muted)]">
          {detail}
        </p>
      ))}

      {/* At most two warnings are written out; a statement can carry dozens (QA fixes, A1). */}
      {notice.warnings && notice.warnings.length > 0 && (
        <>
          {notice.warnings.slice(0, 2).map((warning, index) => (
            <p
              key={index}
              className="border-t border-[var(--ui-divider)] py-1.5 text-[12.5px] text-[var(--ui-text-muted)]"
            >
              {warning}
            </p>
          ))}
          {notice.warnings.length > 2 && (
            <p className="border-t border-[var(--ui-divider)] py-1.5 text-[12.5px] text-[var(--ui-text-muted)]">
              +{notice.warnings.length - 2} more {notice.warnings.length - 2 === 1 ? "note" : "notes"}
            </p>
          )}
        </>
      )}

      {notice.newFunds && notice.newFunds.length > 0 && (
        <div data-testid="import-notice-fund-chips" className="border-t border-[var(--ui-divider)] pb-2.5 pt-2">
          <span className="mb-1.5 block text-[11.5px] text-[var(--ui-text-muted)]">New funds</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {notice.newFunds.slice(0, 3).map((fund) => (
              <span
                key={fund.scheme_id}
                data-testid="import-notice-fund-chip"
                title={fund.scheme_name}
                className="max-w-[220px] truncate rounded-full border border-[var(--ui-divider)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--ui-text-muted)]"
              >
                {fund.scheme_name}
              </span>
            ))}
            {notice.newFunds.length > 3 && (
              <span className="text-[11.5px] text-[var(--ui-text-muted)]">
                +{notice.newFunds.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {notice.newFunds && notice.newFunds.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="cursor-pointer rounded-full border border-[var(--pos)] px-3.5 py-[7px] text-[12.5px] font-semibold text-[var(--pos-text)] hover:bg-[var(--pos-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
          >
            View new funds
          </button>
          <Dialog open={listOpen} onOpenChange={setListOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New funds in this statement</DialogTitle>
              </DialogHeader>
              <NewFundsList funds={notice.newFunds} showHistoryLink />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
