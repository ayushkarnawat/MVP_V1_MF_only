import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FundLink } from "../components/FundLink";
import { NewsCategoryIcon } from "../components/NewsCategoryIcon";
import {
  NEWS_GENERAL_NOTE,
  NEWS_HOW_NOTE,
  NEWS_HOW_WE_PICK,
  NEWS_WHY_TEXT,
  hasNewsToShow,
  isGeneralOnly,
  isSafeUrl,
  newsMetaLine,
  staleLabel,
} from "../newsCopy";
import type { NewsResponse } from "../types";

export interface NewsProps {
  status: "loading" | "error" | "data";
  data: NewsResponse | null;
  refreshing: boolean;
  onRefresh: () => void;
}

export function News({ status, data, refreshing, onRefresh }: NewsProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  if (status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading news"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 space-y-4"
      >
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </section>
    );
  }

  if (status !== "data" || data === null || !hasNewsToShow(data)) {
    return null;
  }

  const now = data.computed_at;
  const opened = data.items.find(item => item.id === openId);

  return (
    <section
      aria-labelledby="news-title"
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3
            id="news-title"
            className="text-base font-semibold text-[var(--ui-text)]"
          >
            {data.texts.title}
          </h3>
          <p
            data-testid="news-subtext"
            className="mt-0.5 text-xs text-[var(--ui-text-muted)]"
          >
            {data.texts.subtext}
          </p>
        </div>
        <button
          type="button"
          aria-label="Refresh news"
          aria-busy={refreshing}
          title={
            data.feed_as_of ? staleLabel(data.feed_as_of, now) : "Refresh news"
          }
          onClick={() => {
            if (!refreshing) {
              onRefresh();
            }
          }}
          className="rounded-lg p-1.5 text-[var(--ui-text-muted)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={refreshing ? "animate-spin" : undefined}
          />
        </button>
      </div>

      {data.stale && data.feed_as_of ? (
        <p
          data-testid="news-stale"
          className="mt-2 text-xs text-[var(--warn-text)]"
        >
          {staleLabel(data.feed_as_of, now)}
        </p>
      ) : null}

      {isGeneralOnly(data.items) ? (
        <p
          data-testid="news-general-note"
          className="mt-2 text-sm text-[var(--ui-text-muted)]"
        >
          {NEWS_GENERAL_NOTE}
        </p>
      ) : null}

      <ul className="mt-3 divide-y divide-[var(--ui-divider)]">
        {data.items.map(item => (
          <li
            key={item.id}
            data-testid={`news-item-${item.id}`}
            className="relative flex gap-3 rounded-lg px-2 py-3 hover:bg-[var(--ui-row-hover)]"
          >
            <NewsCategoryIcon iconKey={item.icon_key} />
            <div className="min-w-0 space-y-0.5">
              {isSafeUrl(item.url) ? (
                <a
                  data-testid="news-headline"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold leading-snug text-[var(--ui-text)] hover:underline after:absolute after:inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
                >
                  {item.headline}
                </a>
              ) : (
                <span
                  data-testid="news-headline"
                  className="text-sm font-semibold leading-snug text-[var(--ui-text)]"
                >
                  {item.headline}
                </span>
              )}
              <div
                data-testid="news-meta"
                className="text-xs text-[var(--ui-text-muted)]"
              >
                {newsMetaLine(item, now)}
              </div>
              {item.specific ? (
                <div
                  data-testid="news-exposure"
                  className="text-xs text-[var(--ui-text-muted)]"
                >
                  {item.exposure_text ? `${item.exposure_text} · ` : null}
                  <button
                    type="button"
                    aria-label={`Why this? ${item.headline}`}
                    onClick={event => {
                      returnFocus.current = event.currentTarget;
                      setOpenId(item.id);
                    }}
                    className="relative z-10 font-medium text-[var(--ui-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
                  >
                    Why this?
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <p
        data-testid="news-disclaimer"
        className="mt-3 text-xs text-[var(--ui-text-muted)]"
      >
        {data.texts.disclaimer}
      </p>

      <Dialog
        open={opened !== undefined}
        onOpenChange={next => {
          if (!next) setOpenId(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={event => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Why this?</DialogTitle>
            <DialogDescription
              data-testid="why-reason"
              className="font-semibold text-[var(--ui-text)]"
            >
              {opened?.reason}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-[var(--ui-text-muted)]">{NEWS_WHY_TEXT}</p>
          {opened && opened.funds.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-[var(--ui-text-muted)]">
                Funds involved
              </h4>
              <ul
                data-testid="why-funds"
                className="divide-y divide-[var(--ui-divider)]"
              >
                {opened.funds.map(fund => (
                  <li key={fund.scheme_id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="text-[var(--ui-text)]">
                      <FundLink schemeId={fund.scheme_id}>{fund.name}</FundLink>
                    </span>
                    {/* The server sends its own 2-decimal text; shown untouched, and left out when it sends none. */}
                    {fund.weight_pct ? (
                      <span data-testid="why-fund-weight" className="shrink-0 text-[var(--ui-text-muted)]">
                        {fund.weight_pct}%
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <span
                aria-disabled="true"
                title="Coming soon"
                className="inline-block cursor-not-allowed text-sm text-[var(--ui-disabled-text)]"
              >
                See affected holdings
              </span>
            </div>
          ) : null}
          <details
            data-testid="why-how"
            className="text-sm text-[var(--ui-text-muted)]"
          >
            <summary className="cursor-pointer font-medium text-[var(--ui-text)]">
              How we pick these headlines
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {NEWS_HOW_WE_PICK.map(step => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="mt-2 text-xs">{NEWS_HOW_NOTE}</p>
          </details>
        </DialogContent>
      </Dialog>
    </section>
  );
}
