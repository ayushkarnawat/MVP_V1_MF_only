import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Search, X } from "lucide-react";
import { useScope } from "../../shell/scope/ScopeContext";
import { buildResults } from "./buildResults";
import { parseQuery } from "./queryParser";
import { pushRecentSearch, readRecentFunds, readRecentSearches } from "./recentSearches";
import { buildSectionEntries } from "./searchRegistry";
import type { PageFilterSource, Recents, ResultGroup, ResultRow, SearchScope } from "./searchResultTypes";
import { usePageSearchState } from "./usePageSearchState";
import { useScopeJump } from "./useScopeJump";
import { useSearchIndex } from "./useSearchIndex";

export interface PageSearchProps {
  pageKey: string;
  noun: string;
  total: number;
  matched: number;
  chipsAllowed: Array<"period" | "member" | "category">;
  extraResults?: ResultRow[];
  userId: string | null;
  jumpOnly?: boolean;
}

type FlatOption =
  | { kind: "page-match"; id: string }
  | { kind: "result"; id: string; row: ResultRow }
  | { kind: "recent-search"; id: string; term: string };

function getRowHint(row: ResultRow): string {
  if (row.disabled || row.action.type === "none") return "Coming soon";
  switch (row.action.type) {
    case "jump-fund":
      return row.action.switchTo ? `Switches to ${row.action.switchTo.label}` : "Go";
    case "go":
      return "Go";
    case "filter":
      return "Filter";
    case "switch-member":
      return `Switches to ${row.action.label}`;
  }
}

// Option ids go into aria-activedescendant, a list of ids split on spaces: a row id such as "category:Flexi Cap" must become one token.
const optionSlug = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "_");

export function PageSearch({
  pageKey,
  noun,
  total,
  matched,
  chipsAllowed,
  extraResults,
  userId,
  jumpOnly = false,
}: PageSearchProps) {
  const { text, chips, setText, addChip, removeChip } = usePageSearchState(pageKey);
  const { status, data, retry, load } = useSearchIndex();
  const { jumpTo } = useScopeJump(userId);
  const navigate = useNavigate();
  const { viewMode, memberId, setMember } = useScope();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(text);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [recents, setRecents] = useState<Recents>({ funds: [], searches: [] });

  const hasLoadedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    setDraft(text);
  }, [text]);

  const openDropdown = useCallback(() => {
    setOpen(true);
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      load();
    }
    setRecents({
      funds: readRecentFunds(userId),
      searches: readRecentSearches(userId),
    });
  }, [load, userId]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        inputRef.current?.focus();
        openDropdown();
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [openDropdown]);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  const registry = useMemo(() => buildSectionEntries(), []);

  const hasDraft = draft.trim().length > 0;

  const groups: ResultGroup[] = useMemo(() => {
    if (!open) return [];
    const parsed = parseQuery(draft);
    const source: PageFilterSource = {
      pageKey,
      noun,
      total,
      matched,
      chipsAllowed,
      extraResults,
    };
    const scope: SearchScope = {
      memberIds: viewMode === "aggregate" ? "family" : memberId ? [memberId] : [],
    };
    return buildResults(parsed, source, data, registry, recents, scope);
  }, [open, draft, pageKey, noun, total, matched, chipsAllowed, extraResults, data, registry, recents, viewMode, memberId]);

  const flatOptions: FlatOption[] = useMemo(() => {
    if (!open) return [];
    const items: FlatOption[] = [];
    if (hasDraft && !jumpOnly) {
      items.push({ kind: "page-match", id: `${listboxId}-opt-page-match` });
    }
    for (const group of groups) {
      for (const row of group.rows) {
        items.push({ kind: "result", id: `${listboxId}-opt-${optionSlug(row.id)}`, row });
      }
    }
    if (!hasDraft) {
      recents.searches.forEach((term, idx) => {
        items.push({ kind: "recent-search", id: `${listboxId}-opt-recent-search-${idx}`, term });
      });
    }
    return items;
  }, [open, hasDraft, jumpOnly, groups, recents.searches, listboxId]);

  const optionIndexById = useMemo(() => {
    const map = new Map<string, number>();
    flatOptions.forEach((opt, idx) => map.set(opt.id, idx));
    return map;
  }, [flatOptions]);

  const activeOption = activeIndex >= 0 && activeIndex < flatOptions.length ? flatOptions[activeIndex] : null;

  // The highlighted row stays visible as the arrow keys walk a list longer than the dropdown.
  // The box can sit at the right end of a page's top row: when a 32 rem dropdown would run past the window edge it opens leftwards.
  const [alignRight, setAlignRight] = useState(false);
  useLayoutEffect(() => {
    if (!open) return;
    const rect = containerRef.current?.getBoundingClientRect();
    setAlignRight(rect ? rect.left + 512 > window.innerWidth - 16 : false);
  }, [open]);

  const activeOptionId = activeOption?.id;
  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeOptionId]);

  const applyDraftFilter = useCallback(() => {
    setText(draft);
    if (draft.trim().length > 0) {
      pushRecentSearch(userId, draft);
    }
    setOpen(false);
    setActiveIndex(-1);
  }, [draft, setText, userId]);

  const runRowAction = useCallback(
    (row: ResultRow) => {
      if (row.disabled || row.action.type === "none") return;

      switch (row.action.type) {
        case "jump-fund": {
          const schemeId = row.action.schemeId;
          const fund = data?.funds.find((f) => f.scheme_id === schemeId);
          if (fund) {
            jumpTo(fund);
          }
          break;
        }
        case "filter":
          addChip(row.action.chip);
          break;
        case "go": {
          const state = row.action.sectionId
            ? { searchIntent: { section: row.action.sectionId } }
            : undefined;
          if (row.action.text) {
            const params = new URLSearchParams();
            params.set("q", row.action.text);
            void navigate(`${row.action.path}?${params.toString()}`, state ? { state } : undefined);
          } else {
            void navigate(row.action.path, state ? { state } : undefined);
          }
          break;
        }
        case "switch-member":
          setMember(row.action.memberId);
          break;
      }

      setDraft("");
      setOpen(false);
      setActiveIndex(-1);
    },
    [data, jumpTo, addChip, navigate, setMember],
  );

  const activateOption = useCallback(
    (option: FlatOption) => {
      if (option.kind === "page-match") {
        applyDraftFilter();
      } else if (option.kind === "recent-search") {
        setDraft(option.term);
        if (!jumpOnly) {
          setText(option.term);
          setOpen(false);
        }
        setActiveIndex(-1);
      } else {
        runRowAction(option.row);
      }
    },
    [applyDraftFilter, jumpOnly, setText, runRowAction],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      if (!open) openDropdown();
      if (flatOptions.length > 0) {
        event.preventDefault();
        setActiveIndex((prev) => (prev < 0 || prev >= flatOptions.length - 1 ? 0 : prev + 1));
      }
      return;
    }

    if (event.key === "ArrowUp") {
      if (!open) openDropdown();
      if (flatOptions.length > 0) {
        event.preventDefault();
        setActiveIndex((prev) => (prev <= 0 ? flatOptions.length - 1 : prev - 1));
      }
      return;
    }

    if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      if (activeOption) {
        activateOption(activeOption);
      } else if (!jumpOnly) {
        applyDraftFilter();
      }
      return;
    }

    if (event.key === "Escape") {
      if (draft.length > 0 || text.length > 0) {
        event.preventDefault();
        setDraft("");
        if (text.length > 0 && !jumpOnly) {
          setText("");
        }
        setActiveIndex(-1);
      } else if (open) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === "Tab") {
      // With the index failed, the list stays open so Tab can reach "Try again" (a keyboard user has no other way to retry).
      if (status === "error") return;
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Backspace" && draft === "" && chips.length > 0) {
      event.preventDefault();
      removeChip(chips[chips.length - 1]);
    }
  };

  const isMac = typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  const shortcutLabel = isMac ? "Cmd S" : "Ctrl S";
  const labelText = `Search ${noun}`;
  const totalCount = flatOptions.length;

  const inputElement = (
    <input
      ref={inputRef}
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-label={labelText}
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      aria-activedescendant={open && activeOption ? activeOption.id : undefined}
      placeholder={labelText}
      value={draft}
      onFocus={openDropdown}
      onClick={openDropdown}
      onChange={(event) => {
        if (!open) openDropdown();
        setDraft(event.target.value);
        setActiveIndex(-1);
      }}
      onKeyDown={handleKeyDown}
      className={
        chips.length === 0
          ? "h-9 w-full max-w-md rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] pl-9 pr-16 text-xs text-[var(--ui-text)] placeholder:text-[var(--ui-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--pos)]"
          : "min-w-[6rem] flex-1 bg-transparent text-xs text-[var(--ui-text)] placeholder:text-[var(--ui-text-muted)] focus:outline-none"
      }
    />
  );

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ui-text-muted)]"
        aria-hidden="true"
      />

      {/* One wrapper in both cases, so the input element keeps its identity (and its focus) when the first chip is added or the last one removed. */}
      {(
        <div className={chips.length === 0 ? "contents" : "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] py-1 pl-9 pr-16 focus-within:ring-1 focus-within:ring-[var(--pos)]"}>
          {chips.map((chip) => (
            <span
              key={`${chip.kind}:${chip.value}`}
              className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--pos)_30%,transparent)] bg-[var(--pos-bg)] px-2 py-0.5 text-xs font-medium text-[var(--pos-text)]"
            >
              <span>{chip.value}</span>
              <button
                type="button"
                aria-label={`Remove filter ${chip.value}`}
                data-clickable=""
                data-effect="select"
                aria-pressed="true"
                onClick={() => {
                  removeChip(chip);
                  inputRef.current?.focus();
                }}
                className="rounded-full p-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--pos)]"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          {inputElement}
        </div>
      )}

      <kbd
        data-testid="search-hint"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[var(--ui-divider)] px-1.5 text-[10px] text-[var(--ui-text-muted)]"
      >
        {shortcutLabel}
      </kbd>

      {/* Mounted before the box opens, so a screen reader has already registered it when the first count arrives. */}
      <div role="status" aria-live="polite" data-testid="search-live" className="sr-only">
        {open ? (totalCount === 1 ? "1 result" : `${totalCount} results`) : ""}
      </div>

      {open && (
        <>
          <div data-testid="search-dropdown" className={`absolute ${alignRight ? "right-0" : "left-0"} top-full z-40 mt-2 max-h-[70vh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-2 shadow-lg`}>
          <div id={listboxId} role="listbox" aria-label="Search results">
            {hasDraft && !jumpOnly && (() => {
              const pageMatchId = `${listboxId}-opt-page-match`;
              const isSelected = activeOption?.id === pageMatchId;
              return (
                <div
                  id={pageMatchId}
                  role="option"
                  aria-selected={isSelected}
                  data-testid="row-page-match"
                  onMouseEnter={() => setHoveredId(pageMatchId)}
                  onMouseLeave={() => setHoveredId((prev) => (prev === pageMatchId ? null : prev))}
                  onClick={applyDraftFilter}
                  className={`mb-1 flex min-h-9 cursor-pointer items-center gap-3 rounded-lg border-b border-[var(--ui-divider)] px-2 py-1.5 pb-2 text-sm ${
                    isSelected
                      ? "bg-[var(--pos-bg)] text-[var(--pos-text)]"
                      : "text-[var(--ui-text)] hover:bg-[color-mix(in_srgb,var(--ui-text)_6%,transparent)]"
                  }`}
                >
                  <span className="truncate">
                    {matched} of {total} {noun}
                  </span>
                </div>
              );
            })()}

            {groups.map((group) => (
              <div key={group.kind} role="group" aria-label={group.label}>
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">
                  {group.label}
                </div>
                {group.rows.map((row) => {
                  const optId = `${listboxId}-opt-${optionSlug(row.id)}`;
                  const isSelected = activeOption?.id === optId;
                  const showHint = isSelected || hoveredId === row.id;
                  const isDisabled = Boolean(row.disabled);
                  const optIdx = optionIndexById.get(optId);
                  return (
                    <div
                      key={row.id}
                      id={optId}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={isDisabled ? "true" : undefined}
                      onMouseEnter={() => setHoveredId(row.id)}
                      onMouseLeave={() => setHoveredId((prev) => (prev === row.id ? null : prev))}
                      onClick={() => {
                        if (optIdx !== undefined) setActiveIndex(optIdx);
                        runRowAction(row);
                      }}
                      className={`flex min-h-9 items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${
                        isDisabled
                          ? "cursor-default opacity-60"
                          : isSelected
                            ? "cursor-pointer bg-[var(--pos-bg)]"
                            : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--ui-text)_6%,transparent)]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate ${
                            isSelected && !isDisabled ? "text-[var(--pos-text)]" : "text-[var(--ui-text)]"
                          }`}
                        >
                          {row.title}
                        </div>
                        {row.subtitle && (
                          <div className="truncate text-xs text-[var(--ui-text-muted)]">{row.subtitle}</div>
                        )}
                      </div>
                      {row.tag && (
                        <span className="shrink-0 rounded-full border border-[var(--ui-divider)] px-2 py-0.5 text-[10px] text-[var(--ui-text-muted)]">
                          {row.tag}
                        </span>
                      )}
                      {showHint && (
                        <span
                          data-testid={`row-hint-${row.id}`}
                          className="ml-auto shrink-0 text-[10px] text-[var(--ui-text-muted)]"
                        >
                          {getRowHint(row)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {!hasDraft && recents.searches.length > 0 && (
              <div role="group" aria-label="Recent searches">
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">
                  Recent searches
                </div>
                {recents.searches.map((term, idx) => {
                  const optId = `${listboxId}-opt-recent-search-${idx}`;
                  const isSelected = activeOption?.id === optId;
                  return (
                    <div
                      key={term}
                      id={optId}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setDraft(term);
                        if (!jumpOnly) {
                          setText(term);
                          setOpen(false);
                        }
                        setActiveIndex(-1);
                      }}
                      className={`flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${
                        isSelected
                          ? "bg-[var(--pos-bg)] text-[var(--pos-text)]"
                          : "text-[var(--ui-text)] hover:bg-[color-mix(in_srgb,var(--ui-text)_6%,transparent)]"
                      }`}
                    >
                      <span className="truncate">{term}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

            {status === "error" && (
              <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs text-[var(--ui-text-muted)]">
                <span>Some results are unavailable right now.</span>
                <button
                  type="button"
                  onClick={retry}
                  data-clickable=""
                  data-effect="retry"
                  className="rounded-lg border border-[var(--ui-divider)] px-3 py-1 text-xs text-[var(--ui-text)] focus:outline-none focus:ring-1 focus:ring-[var(--pos)]"
                >
                  Try again
                </button>
              </div>
            )}

            {hasDraft && groups.length === 0 && status !== "error" && (
              <div className="px-2 py-2 text-xs text-[var(--ui-text-muted)]">
                Nothing found for &quot;{draft}&quot;.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
