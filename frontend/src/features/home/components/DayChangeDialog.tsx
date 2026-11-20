import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AlertCircle, Check, ChevronRight, Clock, Factory, Layers, Moon, X } from "lucide-react";
import { SchemeLogo } from "@/components/SchemeLogo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  changeDirection,
  formatRupees,
  formatSignedPercent,
  formatSignedRupees,
} from "../homeFormat";
import {
  barHalfWidth,
  barSubtitle,
  groupLabel,
  splitShares,
  sumDecimals,
} from "../moversCopy";
import type {
  MissingFund,
  MoverAllBarOut,
  MoversAllResponse,
  MoversResponse,
  MoversView,
} from "../types";
import { FundLink } from "./FundLink";
import { PartialDataBadge } from "./PartialDataBadge";
import {
  formatDialogDateLine,
  formatWeekdayDate,
  groupUnitLabel,
  partitionMoverRows,
  sectorRowSubtitle,
} from "./dayChangeHelpers";

export interface DayChangeDialogProps {
  open: boolean;
  onClose: () => void;
  initialView: MoversView;
  card: MoversResponse;
  loadAll: (view: MoversView) => Promise<MoversAllResponse>;
  hideValues: boolean;
}

const MASK = "••••••";
const VIEW_OPTIONS: readonly MoversView[] = ["sector", "category", "fund"];
const FOCUSABLE_SELECTOR =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const roundOne = (value: number) => Math.round(value * 10) / 10;

type ViewCache = Partial<Record<MoversView, MoversAllResponse>>;
type ViewErrors = Partial<Record<MoversView, boolean>>;
type ViewLoading = Partial<Record<MoversView, boolean>>;

function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function DayChangeDialog({
  open,
  onClose,
  initialView,
  card,
  loadAll,
  hideValues,
}: DayChangeDialogProps) {
  const [view, setView] = useState<MoversView>(initialView);
  const [cache, setCache] = useState<ViewCache>({});
  const [loadingMap, setLoadingMap] = useState<ViewLoading>({});
  const [errorMap, setErrorMap] = useState<ViewErrors>({});
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [noChangeOpen, setNoChangeOpen] = useState(false);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closedCycleRef = useRef(false);
  const wasOpenRef = useRef(false);
  const openSessionRef = useRef(0);
  const cacheRef = useRef<ViewCache>({});
  const inFlightRef = useRef<Partial<Record<MoversView, boolean>>>({});
  const loadAllRef = useRef(loadAll);
  loadAllRef.current = loadAll;

  // Track the last focused element outside the dialog so focus reliably returns to the opening link on close.
  useEffect(() => {
    if (!open && document.activeElement instanceof HTMLElement) {
      if (!contentRef.current?.contains(document.activeElement)) {
        returnFocusRef.current = document.activeElement;
      }
    }

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && !contentRef.current?.contains(target)) {
        returnFocusRef.current = target;
      }
    };

    document.addEventListener("focusin", handleFocusIn, true);
    return () => document.removeEventListener("focusin", handleFocusIn, true);
  }, [open]);

  const restoreFocus = useCallback(() => {
    const target = returnFocusRef.current;
    if (target && target.isConnected && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  }, []);

  const requestClose = useCallback(() => {
    if (!open || closedCycleRef.current) return;
    closedCycleRef.current = true;
    onClose();
  }, [open, onClose]);

  const fetchView = useCallback((targetView: MoversView, force = false) => {
    if (!force && (cacheRef.current[targetView] || inFlightRef.current[targetView])) {
      return;
    }

    const sessionId = openSessionRef.current;
    inFlightRef.current[targetView] = true;
    setErrorMap(prev => ({ ...prev, [targetView]: false }));
    setLoadingMap(prev => ({ ...prev, [targetView]: true }));

    loadAllRef.current(targetView).then(
      response => {
        if (openSessionRef.current !== sessionId) return;
        inFlightRef.current[targetView] = false;
        cacheRef.current = { ...cacheRef.current, [targetView]: response };
        setCache(prev => ({ ...prev, [targetView]: response }));
        setLoadingMap(prev => ({ ...prev, [targetView]: false }));
      },
      () => {
        if (openSessionRef.current !== sessionId) return;
        inFlightRef.current[targetView] = false;
        setLoadingMap(prev => ({ ...prev, [targetView]: false }));
        setErrorMap(prev => ({ ...prev, [targetView]: true }));
      },
    );
  }, []);

  // Reset per-open session state when opening, and restore focus when closing.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      closedCycleRef.current = false;
      openSessionRef.current += 1;
      cacheRef.current = {};
      inFlightRef.current = {};
      setView(initialView);
      setCache({});
      setLoadingMap({});
      setErrorMap({});
      setExpandedKeys({});
      setNoChangeOpen(false);
      fetchView(initialView, true);
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      openSessionRef.current += 1;
      inFlightRef.current = {};
      restoreFocus();
    }
  }, [open, initialView, fetchView, restoreFocus]);

  // Outside click closes the dialog once (covers jsdom pointerdown on document.body as well as real clicks).
  useEffect(() => {
    if (!open) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.ctrlKey) return;
      const content = contentRef.current;
      const target = event.target;
      if (content && target instanceof Node && !content.contains(target)) {
        requestClose();
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [open, requestClose]);

  const handleViewChange = (nextView: MoversView) => {
    setView(nextView);
    setExpandedKeys({});
    setNoChangeOpen(false);
    fetchView(nextView);
  };

  const handleRetry = () => {
    fetchView(view, true);
  };

  const handleContentKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      requestClose();
      return;
    }

    if (event.key !== "Tab") return;
    const container = contentRef.current;
    if (!container) return;

    const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      isElementVisible,
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !container.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  const loaded = cache[view] ?? null;
  const isError = Boolean(errorMap[view]) && !loaded;
  const isLoading = (!loaded && !isError) || Boolean(loadingMap[view]);

  const activeData: MoversResponse = loaded ?? card;
  const displayView: MoversView = loaded ? loaded.view : view;
  const waitingForPrice = loaded?.waiting_for_price ?? [];

  const { gainers, losers, noChange } = loaded
    ? partitionMoverRows(loaded.rows)
    : { gainers: [], losers: [], noChange: [] };

  const isMarketsClosed =
    loaded !== null &&
    loaded.rows.length === 0 &&
    changeDirection(loaded.net_change) === "flat";

  const split = loaded
    ? isMarketsClosed
      ? { gained: "0.00", lost: "0.00", gainedPct: 0 }
      : splitShares(gainers, losers, "0.00")
    : splitShares(card.gains, card.losses, card.others_change);

  const summaryNetChange = loaded ? loaded.net_change : card.net_change;
  const summaryNetPct = loaded ? loaded.net_pct : card.net_pct;
  const netDir = isMarketsClosed ? "flat" : changeDirection(summaryNetChange);
  const netTextClass =
    netDir === "up"
      ? "text-[var(--pos-text)]"
      : netDir === "down"
        ? "text-[var(--neg-text)]"
        : "text-[var(--ui-text-muted)]";

  const summaryBoxClass =
    netDir === "up"
      ? "bg-[var(--pos-bg)] border-[color-mix(in_srgb,var(--pos)_28%,var(--ui-divider))]"
      : netDir === "down"
        ? "bg-[var(--neg-bg)] border-[color-mix(in_srgb,var(--neg)_28%,var(--ui-divider))]"
        : "bg-[var(--ui-card)] border-[var(--ui-divider)]";

  const partialFunds: MissingFund[] =
    activeData.missing_funds.length > 0
      ? activeData.missing_funds
      : waitingForPrice.map(fund => ({ scheme_id: fund.fund_id, name: fund.name }));
  const showPartial = activeData.partial || waitingForPrice.length > 0;

  const changedRows = [...gainers, ...losers];
  const maxAbs = Math.max(
    0,
    ...changedRows.map(row => Math.abs(Number(row.change))),
  );

  const gainersTotal = gainers.length > 0 ? sumDecimals(gainers.map(row => row.change)) : "0.00";
  const losersTotal = losers.length > 0 ? sumDecimals(losers.map(row => row.change)) : "0.00";

  const formatMoney = (value: string | null | undefined, signed = false) => {
    if (hideValues) return MASK;
    return signed ? formatSignedRupees(value) : formatRupees(value);
  };

  const toggleRow = (key: string) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const dateLine = formatDialogDateLine(activeData.computed_at, activeData.nav_as_of);

  let footerText = "Rows add up to the net change.";
  let showFooterCheck = true;

  if (isLoading) {
    footerText = "Loading every fund… The summary above is already from the card.";
    showFooterCheck = false;
  } else if (isError) {
    footerText = "Nothing was changed.";
    showFooterCheck = false;
  } else if (isMarketsClosed) {
    footerText = "Nothing to add up.";
    showFooterCheck = false;
  } else if (activeData.estimated) {
    footerText =
      "Estimated: each fund's change is spread over its sectors by its holdings, so the sector gained and lost totals differ from the fund view. Rows still add up to the net change.";
  } else if (waitingForPrice.length > 0) {
    const countLabel =
      waitingForPrice.length === 1
        ? "1 fund is not counted yet."
        : `${waitingForPrice.length} funds are not counted yet.`;
    footerText = `Rows add up to the net change. ${countLabel}`;
  }

  const renderRowIcon = (row: MoverAllBarOut, rowView: MoversView, small = false) => {
    if (rowView === "fund") {
      return <SchemeLogo schemeName={row.label} size={small ? "sm" : "md"} />;
    }
    const Icon = rowView === "sector" ? Factory : Layers;
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center bg-[var(--ui-card)] text-[var(--ui-text-muted)]",
          small ? "h-7 w-7 rounded-lg" : "h-[34px] w-[34px] rounded-[10px]",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
    );
  };

  const renderCenterBar = (change: string | null, isZero: boolean) => {
    const dir = change != null ? changeDirection(change) : "flat";
    const isLoss = dir === "down";
    const width = !isZero && change != null ? barHalfWidth(change, maxAbs) : 0;

    return (
      <div aria-hidden="true" className="relative h-2.5 w-full">
        <span className="absolute left-1/2 -top-[3px] -bottom-[3px] w-px -translate-x-1/2 bg-[var(--ui-border-hover)] opacity-60" />
        {!isZero && width > 0 ? (
          <span
            style={{
              width: `${width}%`,
              backgroundColor: isLoss ? "var(--neg)" : "var(--pos)",
              ...(isLoss ? { right: "50%" } : { left: "50%" }),
            }}
            className={cn(
              "absolute top-0 h-2.5",
              isLoss ? "rounded-l-[5px]" : "rounded-r-[5px]",
            )}
          />
        ) : null}
      </div>
    );
  };

  const renderAmountCell = (change: string | null, isZero: boolean) => {
    if (isZero || change == null || changeDirection(change) === "flat") {
      return (
        <span className="text-right text-[13.5px] font-semibold tabular-nums text-[var(--ui-text-muted)]">
          —
        </span>
      );
    }
    const isLoss = changeDirection(change) === "down";
    return (
      <div
        className={cn(
          "text-right text-[13.5px] font-bold tabular-nums",
          isLoss ? "text-[var(--neg-text)]" : "text-[var(--pos-text)]",
        )}
      >
        <span className={hideValues ? "tracking-[2px]" : undefined}>
          {formatMoney(change, true)}
        </span>
      </div>
    );
  };

  const renderDataRow = (row: MoverAllBarOut) => {
    const isZero = row.no_change || changeDirection(row.change) === "flat";
    const isExpandable = displayView !== "fund" && row.funds.length > 0;
    const isExpanded = Boolean(expandedKeys[row.key]);
    const singleFundId =
      displayView === "fund" && row.funds.length === 1 ? row.funds[0].scheme_id : null;

    const subtitle =
      displayView === "sector"
        ? sectorRowSubtitle(row.funds.length)
        : displayView === "category"
          ? barSubtitle(row)
          : row.funds.length > 1
            ? barSubtitle(row)
            : "";

    if (isExpandable) {
      return (
        <li key={row.key}>
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => toggleRow(row.key)}
            className="grid w-full grid-cols-[34px_minmax(0,1.2fr)_minmax(150px,1fr)_96px] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-[var(--ui-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1 motion-reduce:transition-none cursor-pointer"
          >
            {renderRowIcon(row, displayView)}
            <div className="min-w-0">
              <div className="flex items-center gap-1 truncate text-[13.5px] font-semibold leading-snug text-[var(--ui-text)]">
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-[var(--ui-text-muted)] transition-transform motion-reduce:transition-none",
                    isExpanded && "rotate-90",
                  )}
                />
                <span className="truncate">{row.label}</span>
              </div>
              {subtitle ? (
                <div className="pl-[18px] text-[11.5px] text-[var(--ui-text-muted)]">
                  {subtitle}
                </div>
              ) : null}
            </div>
            {renderCenterBar(row.change, isZero)}
            {renderAmountCell(row.change, isZero)}
          </button>

          {isExpanded ? (
            <ul className="mt-0.5 mb-1.5 space-y-0.5 pl-[34px]">
              {row.funds.map(fund => {
                const fundZero =
                  fund.change == null || changeDirection(fund.change) === "flat";
                return (
                  <li
                    key={fund.scheme_id}
                    className="grid grid-cols-[28px_minmax(0,1.2fr)_minmax(150px,1fr)_96px] items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--ui-row-hover)] motion-reduce:transition-none"
                  >
                    <SchemeLogo schemeName={fund.name} size="sm" />
                    <div className="min-w-0 truncate text-[13px] font-medium text-[var(--ui-text)]">
                      <FundLink
                        schemeId={fund.scheme_id}
                        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1 rounded"
                      >
                        {fund.name}
                      </FundLink>
                    </div>
                    {renderCenterBar(fund.change, fundZero)}
                    {renderAmountCell(fund.change, fundZero)}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </li>
      );
    }

    return (
      <li
        key={row.key}
        className="grid grid-cols-[34px_minmax(0,1.2fr)_minmax(150px,1fr)_96px] items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-[var(--ui-row-hover)] motion-reduce:transition-none"
      >
        {renderRowIcon(row, displayView)}
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold leading-snug text-[var(--ui-text)]">
            <FundLink
              schemeId={singleFundId}
              className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1 rounded"
            >
              {row.label}
            </FundLink>
          </div>
          {subtitle ? (
            <div className="text-[11.5px] text-[var(--ui-text-muted)]">{subtitle}</div>
          ) : null}
        </div>
        {renderCenterBar(row.change, isZero)}
        {renderAmountCell(row.change, isZero)}
      </li>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) requestClose();
      }}
    >
      <DialogContent
        ref={contentRef}
        hideClose
        onKeyDown={handleContentKeyDown}
        onCloseAutoFocus={event => {
          event.preventDefault();
          restoreFocus();
        }}
        className="flex max-h-[86vh] w-[min(92vw,720px)] max-w-[720px] flex-col gap-0 overflow-hidden rounded-[22px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-0 text-[var(--ui-text)] shadow-2xl motion-reduce:animate-none motion-reduce:transition-none motion-reduce:duration-0"
      >
        {/* Header */}
        <DialogHeader className="flex-row items-start justify-between gap-4 space-y-0 px-6 pt-5 pb-3 text-left">
          <div className="min-w-0">
            <DialogTitle className="font-display text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ui-text)]">
              Everything that changed today
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-[var(--ui-text-muted)]">
              {dateLine}
            </DialogDescription>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={requestClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ui-card)] text-[var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-elevated)] motion-reduce:transition-none cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </DialogHeader>

        {/* Summary band */}
        <div className={cn("mx-6 rounded-2xl border px-4 py-3.5", summaryBoxClass)}>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <div>
              <div className="mb-0.5 text-xs font-medium text-[var(--ui-text-muted)]">
                Net change today
              </div>
              <div
                className={cn(
                  "font-display text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums",
                  netTextClass,
                  hideValues && "tracking-[2px]",
                )}
              >
                {isMarketsClosed
                  ? hideValues
                    ? MASK
                    : "₹0"
                  : formatMoney(summaryNetChange, true)}
              </div>
            </div>

            {isMarketsClosed ? (
              <span className="text-[13px] font-semibold text-[var(--ui-text-muted)]">
                No price changes
              </span>
            ) : summaryNetPct != null ? (
              <span className={cn("text-[13px] font-semibold tabular-nums", netTextClass)}>
                {formatSignedPercent(summaryNetPct)} of your portfolio
              </span>
            ) : null}

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {activeData.estimated ? (
                <span
                  title="Spread over each fund's sectors using its latest monthly holdings"
                  className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--c4)_25%,transparent)] bg-[color-mix(in_srgb,var(--c4)_12%,var(--ui-elevated))] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--c4)]"
                >
                  Estimated
                </span>
              ) : null}
              {showPartial ? (
                partialFunds.length > 0 ? (
                  <PartialDataBadge missingFunds={partialFunds} />
                ) : (
                  <span className="inline-flex items-center rounded-full bg-[var(--warn-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--warn-text)]">
                    Partial
                  </span>
                )
              ) : null}
            </div>
          </div>

          {isMarketsClosed ? (
            <p className="mt-2 text-xs text-[var(--ui-text-muted)]">
              No fund changed in value.
            </p>
          ) : (
            <>
              <div className="my-2.5 flex h-2 w-full overflow-hidden rounded-[5px] bg-[var(--ui-divider)]">
                {split.gained !== "0.00" ? (
                  <span
                    aria-hidden="true"
                    style={{
                      width: `${split.gainedPct}%`,
                      backgroundColor: "var(--pos)",
                    }}
                    className="block h-full"
                  />
                ) : null}
                {split.lost !== "0.00" ? (
                  <span
                    aria-hidden="true"
                    style={{
                      width: `${roundOne(100 - split.gainedPct)}%`,
                      backgroundColor: "var(--neg)",
                    }}
                    className="block h-full"
                  />
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--ui-text-muted)]">
                <span>
                  Gained{" "}
                  <strong
                    className={cn(
                      "font-semibold tabular-nums text-[var(--ui-text)]",
                      hideValues && "tracking-[2px]",
                    )}
                  >
                    {formatMoney(split.gained)}
                  </strong>
                </span>
                {" "}
                <span>
                  Lost{" "}
                  <strong
                    className={cn(
                      "font-semibold tabular-nums text-[var(--ui-text)]",
                      hideValues && "tracking-[2px]",
                    )}
                  >
                    {formatMoney(split.lost)}
                  </strong>
                </span>
                {" "}
              </div>
            </>
          )}
        </div>

        {/* View switch & sort hint */}
        <div className="flex flex-wrap items-center gap-3 px-6 pt-3.5 pb-1.5">
          <div
            role="group"
            aria-label="Group by"
            className="inline-flex rounded-[10px] border border-[var(--ui-divider)] bg-[var(--ui-card)] p-[3px]"
          >
            {VIEW_OPTIONS.map(option => {
              const active = view === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleViewChange(option)}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1 motion-reduce:transition-none cursor-pointer",
                    active
                      ? "bg-[var(--ui-elevated)] text-[var(--ui-text)] shadow-sm"
                      : "bg-transparent text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]",
                  )}
                >
                  {groupLabel(option)}
                </button>
              );
            })}
          </div>
          <span className="ml-auto text-xs text-[var(--ui-text-muted)]">
            Largest first
          </span>
        </div>

        {/* Scrollable body */}
        <div
          aria-busy={isLoading}
          className="min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-2"
        >
          {loaded?.fell_back ? (
            <p className="mb-2 rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-xs text-[var(--warn-text)]">
              Sector view needs holdings for at least half of your funds, so categories are shown instead.
            </p>
          ) : null}

          {isLoading ? (
            <div role="status" aria-label="Loading every fund" className="space-y-1 py-1">
              {[0, 1, 2, 3, 4, 5].map(index => (
                <div
                  key={index}
                  className="grid grid-cols-[34px_minmax(0,1.2fr)_minmax(150px,1fr)_96px] items-center gap-3 px-2 py-2.5"
                >
                  <Skeleton className="h-[34px] w-[34px] rounded-[10px] motion-reduce:animate-none" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-[70%] rounded-md motion-reduce:animate-none" />
                    <Skeleton className="h-2.5 w-[40%] rounded-md motion-reduce:animate-none" />
                  </div>
                  <Skeleton className="h-2.5 w-full rounded-md motion-reduce:animate-none" />
                  <Skeleton className="ml-auto h-3.5 w-[70px] rounded-md motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div role="alert" className="px-6 py-10 text-center text-[var(--ui-text-muted)]">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--neg-bg)] text-[var(--neg-text)]">
                <AlertCircle className="h-7 w-7" aria-hidden="true" />
              </div>
              <h3 className="font-display text-base font-bold text-[var(--ui-text)]">
                We couldn&apos;t load the full list
              </h3>
              <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
                The card behind this window is unchanged. Try again in a moment.
              </p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-4 inline-flex items-center justify-center rounded-[10px] bg-[var(--pos)] px-5 py-2.5 text-[13px] font-bold text-[var(--tier-1-fg)] transition-colors hover:brightness-95 active:bg-[var(--pos-text)] active:text-[var(--ui-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-elevated)] motion-reduce:transition-none cursor-pointer"
              >
                Try again
              </button>
            </div>
          ) : isMarketsClosed ? (
            <div className="px-6 py-10 text-center text-[var(--ui-text-muted)]">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ui-card)] text-[var(--ui-text-muted)]">
                <Moon className="h-7 w-7" aria-hidden="true" />
              </div>
              <h3 className="font-display text-base font-bold text-[var(--ui-text)]">
                Markets were closed today
              </h3>
              <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
                {activeData.nav_as_of
                  ? `No fund had a new price. Latest prices are as on ${formatWeekdayDate(activeData.nav_as_of)}.`
                  : "No fund had a new price."}
              </p>
            </div>
          ) : (
            <div>
              {gainers.length > 0 ? (
                <div>
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--ui-elevated)] pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--ui-text-muted)]">
                    <span>
                      Lifted your portfolio · {groupUnitLabel(displayView, gainers.length)}
                    </span>
                    <span
                      className={cn(
                        "ml-auto text-[12.5px] font-semibold normal-case tracking-normal tabular-nums text-[var(--pos-text)]",
                        hideValues && "tracking-[2px]",
                      )}
                    >
                      {formatMoney(gainersTotal, true)}
                    </span>
                  </div>
                  <ul className="space-y-0.5">{gainers.map(renderDataRow)}</ul>
                </div>
              ) : null}

              {losers.length > 0 ? (
                <div>
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--ui-elevated)] pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--ui-text-muted)]">
                    <span>
                      Pulled it down · {groupUnitLabel(displayView, losers.length)}
                    </span>
                    <span
                      className={cn(
                        "ml-auto text-[12.5px] font-semibold normal-case tracking-normal tabular-nums text-[var(--neg-text)]",
                        hideValues && "tracking-[2px]",
                      )}
                    >
                      {formatMoney(losersTotal, true)}
                    </span>
                  </div>
                  <ul className="space-y-0.5">{losers.map(renderDataRow)}</ul>
                </div>
              ) : null}

              {noChange.length > 0 ? (
                <div className="mt-1">
                  <button
                    type="button"
                    aria-expanded={noChangeOpen}
                    onClick={() => setNoChangeOpen(prev => !prev)}
                    className="sticky top-0 z-10 flex w-full items-center gap-1.5 rounded-lg bg-[var(--ui-elevated)] pt-3 pb-1.5 text-left text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1 motion-reduce:transition-none cursor-pointer"
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none",
                        noChangeOpen && "rotate-90",
                      )}
                    />
                    <span>
                      No change · {groupUnitLabel(displayView, noChange.length)}
                    </span>
                    <span className="ml-auto text-[12px] font-semibold normal-case tracking-normal text-[var(--ui-text-muted)]">
                      {noChangeOpen ? "Hide" : "Show"}
                    </span>
                  </button>
                  {noChangeOpen ? (
                    <ul className="space-y-0.5">{noChange.map(renderDataRow)}</ul>
                  ) : null}
                </div>
              ) : null}

              {waitingForPrice.length > 0 ? (
                <div className="my-2 rounded-[14px] border border-dashed border-[var(--warn)] bg-[var(--warn-bg)] px-3 pt-2.5 pb-2">
                  <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--warn-text)]">
                    Waiting for today&apos;s price ·{" "}
                    {groupUnitLabel("fund", waitingForPrice.length)}
                  </div>
                  <p className="pt-0.5 pb-1.5 text-xs text-[var(--warn-text)]">
                    Not counted in the net change until the price arrives. They are never shown as zero.
                  </p>
                  <ul className="divide-y divide-[color-mix(in_srgb,var(--warn)_22%,transparent)]">
                    {waitingForPrice.map(fund => (
                      <li
                        key={fund.fund_id}
                        className="grid grid-cols-[34px_minmax(0,1.2fr)_1fr_40px] items-center gap-3 py-1.5"
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--warn)_18%,var(--ui-elevated))] text-[var(--warn-text)]"
                        >
                          <Clock className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-semibold leading-snug text-[var(--ui-text)]">
                            <FundLink
                              schemeId={fund.fund_id}
                              className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-1 rounded"
                            >
                              {fund.name}
                            </FundLink>
                          </div>
                          {fund.category ? (
                            <div className="truncate text-[11.5px] text-[var(--ui-text-muted)]">
                              {fund.category}
                            </div>
                          ) : null}
                        </div>
                        <span className="text-xs text-[var(--ui-text-muted)]">
                          price expected later today
                        </span>
                        <span className="text-right text-xs text-[var(--ui-text-muted)]">
                          —
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[var(--ui-divider)] px-6 pt-3 pb-4 text-xs text-[var(--ui-text-muted)]">
          {showFooterCheck ? (
            <span
              aria-hidden="true"
              className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--pos-bg)] text-[var(--pos-text)]"
            >
              <Check className="h-3 w-3" />
            </span>
          ) : null}
          <span className="leading-snug">{footerText}</span>
          <button
            type="button"
            onClick={requestClose}
            className="ml-auto shrink-0 rounded-[10px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-4 py-1.5 text-[12.5px] font-semibold text-[var(--ui-text)] transition-colors hover:border-[var(--ui-border-hover)] hover:bg-[var(--ui-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-elevated)] motion-reduce:transition-none cursor-pointer"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
