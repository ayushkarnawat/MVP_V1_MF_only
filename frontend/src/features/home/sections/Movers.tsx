import { useEffect, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ChangeBadge } from "../components/ChangeBadge";
import { MoverRow } from "../components/MoverRow";
import { PartialDataBadge } from "../components/PartialDataBadge";
import { changeDirection, formatRupees, formatSignedRupees } from "../homeFormat";
import { groupLabel, othersLabel, splitShares } from "../moversCopy";
import type { MoverBarOut, MoversResponse, MoversView } from "../types";

export interface MoversProps {
  status: "loading" | "error" | "data";
  data: MoversResponse | null;
  view: MoversView;
  onViewChange: (view: MoversView) => void;
  onRetry: () => void;
  // Set by the greeting's top-mover link: open the popup of the row with this label once the fund rows are showing.
  openRequest?: { name: string; token: number } | null;
}

const roundOne = (x: number) => Math.round(x * 10) / 10;

export function Movers({
  status,
  data,
  view,
  onViewChange,
  onRetry,
  openRequest = null,
}: MoversProps) {
  const [opened, setOpened] = useState<{
    bar: MoverBarOut;
    view: MoversView;
  } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (opened && opened.view === view) {
      dialogRef.current?.focus();
    }
  }, [opened, view]);

  // Each request is handled once, even if the user closes the popup and the rows are reloaded.
  const handledToken = useRef<number | null>(null);
  useEffect(() => {
    if (!openRequest || handledToken.current === openRequest.token) return;
    if (status !== "data" || !data || data.view !== "fund" || view !== "fund") return;
    handledToken.current = openRequest.token;
    const bar = [...data.gains, ...data.losses].find(row => row.label === openRequest.name);
    if (bar) setOpened({ bar, view: "fund" });
  }, [openRequest, status, data, view]);

  if (status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading movers"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-8 w-48 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-4 w-full rounded" />
        <div className="space-y-3 pt-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </section>
    );
  }

  if (status === "error" || !data) {
    return (
      <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <h3 className="text-base font-semibold text-[var(--ui-text)]">
          What moved today
        </h3>
        <p className="mt-3 text-sm text-[var(--ui-text-muted)]">
          Could not load movers.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-[var(--ui-divider)] px-3 py-1.5 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)]"
        >
          Try again
        </button>
      </section>
    );
  }

  if (
    data.gains.length === 0 &&
    data.losses.length === 0 &&
    data.others_count === 0
  ) {
    return (
      <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <h3 className="text-base font-semibold text-[var(--ui-text)]">
          What moved today
        </h3>
        <p className="mt-3 text-sm text-[var(--ui-text-muted)]">
          No movement data yet
        </p>
      </section>
    );
  }

  const { gained, lost, gainedPct } = splitShares(
    data.gains,
    data.losses,
    data.others_change,
  );

  const allBars = [...data.gains, ...data.losses];
  const maxAbs = Math.max(
    0,
    ...allBars.map(bar => Math.abs(Number(bar.change))),
  );

  const othersLoss = changeDirection(data.others_change) === "down";
  const othersColor = othersLoss ? "var(--neg-text)" : "var(--pos-text)";

  const isDialogOpen = opened != null && opened.view === view;

  return (
    <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-[var(--ui-text)]">
            What moved today
          </h3>
          {data.estimated ? (
            <span
              title="Spread over each fund's sectors using its latest monthly holdings"
              className="inline-flex items-center rounded-full bg-[var(--ui-card)] px-2 py-0.5 text-xs font-medium text-[var(--ui-text-muted)]"
            >
              Estimated
            </span>
          ) : null}
          {data.partial ? (
            <PartialDataBadge missingFunds={data.missing_funds} />
          ) : null}
        </div>
        <div
          role="group"
          aria-label="Group by"
          className="inline-flex rounded-lg border border-[var(--ui-divider)] p-0.5 bg-[var(--ui-card)]"
        >
          {(["sector", "category", "fund"] as const).map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => onViewChange(option)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                view === option
                  ? "bg-[var(--ui-elevated)] text-[var(--ui-text)] shadow-sm"
                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              {groupLabel(option)}
            </button>
          ))}
        </div>
      </div>

      {data.fell_back ? (
        <p
          data-testid="movers-fallback"
          className="mt-3 text-xs text-[var(--warn-text)] bg-[var(--warn-bg)] rounded-lg p-2.5"
        >
          Sector view needs holdings for at least half of your funds, so categories are shown instead.
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-1">
        <span className="text-xs font-medium text-[var(--ui-text-muted)]">
          Net change today
        </span>
        <div>
          <ChangeBadge amount={data.net_change} pct={data.net_pct} />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div
          data-testid="movers-split"
          className="flex h-2 w-full overflow-hidden rounded bg-[var(--ui-divider)]"
        >
          {gained !== "0.00" ? (
            <i
              data-testid="split-gain"
              style={{
                width: `${gainedPct}%`,
                backgroundColor: "var(--pos-text)",
              }}
            />
          ) : null}
          {lost !== "0.00" ? (
            <i
              data-testid="split-loss"
              style={{
                width: `${roundOne(100 - gainedPct)}%`,
                backgroundColor: "var(--neg-text)",
              }}
            />
          ) : null}
        </div>
        <div className="flex items-center justify-between text-xs font-medium">
          <span style={{ color: "var(--pos-text)" }}>
            {`Gained ${formatRupees(gained)}`}
          </span>
          <span style={{ color: "var(--neg-text)" }}>
            {`Lost ${formatRupees(lost)}`}
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {data.gains.length > 0 ? (
          <div>
            <div className="mb-2 text-xs font-medium text-[var(--ui-text-muted)]">
              Lifted your portfolio
            </div>
            <div className="space-y-1">
              {data.gains.map(bar => (
                <MoverRow
                  key={bar.key}
                  bar={bar}
                  view={view}
                  maxAbs={maxAbs}
                  onOpen={b => setOpened({ bar: b, view })}
                />
              ))}
            </div>
          </div>
        ) : null}

        {data.losses.length > 0 ? (
          <div>
            <div className="mb-2 text-xs font-medium text-[var(--ui-text-muted)]">
              Pulled it down
            </div>
            <div className="space-y-1">
              {data.losses.map(bar => (
                <MoverRow
                  key={bar.key}
                  bar={bar}
                  view={view}
                  maxAbs={maxAbs}
                  onOpen={b => setOpened({ bar: b, view })}
                />
              ))}
            </div>
          </div>
        ) : null}

        {data.others_count > 0 ? (
          <div
            data-testid="movers-others"
            className="flex items-center justify-between rounded-lg px-2 py-2 text-sm"
          >
            <span className="text-[var(--ui-text-muted)]">
              {othersLabel(data.others_count)}
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{ color: othersColor }}
            >
              {formatSignedRupees(data.others_change)}
            </span>
          </div>
        ) : null}
      </div>

      {isDialogOpen && opened ? (
        <div
          role="dialog"
          aria-label={`${opened.bar.label} funds`}
          tabIndex={-1}
          ref={dialogRef}
          onKeyDown={e => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpened(null);
            }
          }}
          className="mt-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 focus-visible:outline-none"
        >
          <div className="flex items-center justify-between border-b border-[var(--ui-divider)] pb-2">
            <span className="font-medium text-[var(--ui-text)]">
              {opened.bar.label}
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpened(null)}
              className="rounded p-1 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <ul className="mt-2 divide-y divide-[var(--ui-divider)]">
            {opened.bar.funds.map(fund => (
              <li
                key={fund.scheme_id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-[var(--ui-text)]">{fund.name}</span>
                {fund.change != null ? (
                  <span
                    className="font-semibold tabular-nums"
                    style={{
                      color:
                        changeDirection(fund.change) === "down"
                          ? "var(--neg-text)"
                          : "var(--pos-text)",
                    }}
                  >
                    {formatSignedRupees(fund.change)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 border-t border-[var(--ui-divider)] pt-3 text-xs text-[var(--ui-text-muted)] sm:flex-row sm:items-center sm:justify-between">
        <span
          aria-disabled="true"
          title="Coming soon"
          className="inline-flex cursor-not-allowed items-center gap-1 text-[var(--ui-disabled-text)]"
        >
          <span>View all by day's change</span>
          <ArrowRight
            size={14}
            className="text-[var(--ui-text-muted)]"
            aria-hidden="true"
          />
        </span>
        <span>
          {data.estimated
            ? "Sector figures are estimates and add up to the exact change."
            : "Rows add up to the net change."}
        </span>
      </div>
    </section>
  );
}
