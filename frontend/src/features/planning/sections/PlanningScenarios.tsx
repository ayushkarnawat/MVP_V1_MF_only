import { useEffect, useRef, useState } from "react";
import { getScenarioResult, listScenarios } from "../api";
import { ScenarioList } from "../components/ScenarioList";
import { LIST_ERROR, TRY_AGAIN } from "../planningCopy";
import type { MemberChoice, ScenarioResult, ScenarioSummary } from "../types";
import { ScenarioDetail } from "./ScenarioDetail";

export interface PlanningBinding {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onImport: () => void;
  onLearnMore: () => void;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";

function ErrorCard({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 text-sm text-[var(--ui-text)]"
    >
      <p>{LIST_ERROR}</p>
      <p className="mt-1 text-[var(--ui-text-muted)]">{text}</p>
      <button
        type="button"
        onClick={onRetry}
        className={`mt-2.5 rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-page)] px-3.5 py-1.5 font-semibold ${FOCUS}`}
      >
        {TRY_AGAIN}
      </button>
    </div>
  );
}

function membersOf(result: ScenarioResult): { id: string; name: string }[] {
  return result.by_member
    .filter(m => m.funds.length > 0)
    .map(m => ({ id: m.household_member_id, name: m.member_name }));
}

export function PlanningScenarios({ selectedId, onSelect, onImport, onLearnMore }: PlanningBinding) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [curated, setCurated] = useState<ScenarioSummary[]>([]);
  const [all, setAll] = useState<ScenarioSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listAttempt, setListAttempt] = useState(0);

  const [memberId, setMemberId] = useState<MemberChoice>("family");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState<{
    scenarioId: string;
    memberId: MemberChoice;
    data: ScenarioResult;
  } | null>(null);
  const loadedRef = useRef<{
    scenarioId: string;
    memberId: MemberChoice;
    data: ScenarioResult;
  } | null>(null);
  const [failure, setFailure] = useState<{
    scenarioId: string;
    memberId: MemberChoice;
    message: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const message = (error: unknown) => (error instanceof Error ? error.message : "Request failed");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listScenarios(true, controller.signal), listScenarios(false, controller.signal)])
      .then(([curatedData, allData]) => {
        if (controller.signal.aborted) return;
        setCurated(curatedData);
        setAll(allData);
        setListError(null);
        setListLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setListError(message(error));
        setListLoading(false);
      });
    return () => controller.abort();
  }, [listAttempt]);

  useEffect(() => {
    if (selectedId === null) return;
    const current = loadedRef.current;
    if (current && current.scenarioId === selectedId && current.memberId === memberId) return;

    const controller = new AbortController();
    setFailure(null);
    getScenarioResult(selectedId, controller.signal, memberId === "family" ? undefined : memberId)
      .then(data => {
        if (controller.signal.aborted) return;
        const next = { scenarioId: selectedId, memberId, data };
        loadedRef.current = next;
        setLoaded(next);
        setFailure(null);
        if (memberId === "family") setMembers(membersOf(data));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFailure({ scenarioId: selectedId, memberId, message: message(error) });
        const shown = loadedRef.current;
        if (shown && shown.scenarioId === selectedId) setMemberId(shown.memberId);
      });
    return () => controller.abort();
  }, [selectedId, memberId, attempt]);

  const shown = loaded && loaded.scenarioId === selectedId ? loaded : null;
  const failed = failure && failure.scenarioId === selectedId ? failure : null;
  const hasResult = shown !== null;
  const summary = [...all, ...curated].find(item => item.scenario_id === selectedId);

  useEffect(() => {
    if (selectedId === null || !headingRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heading = headingRef.current;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [selectedId]);

  useEffect(() => {
    if (hasResult && document.activeElement === document.body) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [hasResult, selectedId]);

  const retry = () => {
    if (failed) {
      setFailure(null);
      setMemberId(failed.memberId);
      setAttempt(v => v + 1);
    }
  };

  return (
    <div className="space-y-6">
      {listError ? (
        <ErrorCard
          text={listError}
          onRetry={() => {
            setListError(null);
            setListLoading(true);
            setListAttempt(v => v + 1);
          }}
        />
      ) : (
        <ScenarioList
          curated={curated}
          all={all}
          selectedId={selectedId}
          onSelect={onSelect}
          isLoading={listLoading}
        />
      )}

      {selectedId !== null &&
        (shown ? (
          <>
            {failed && <ErrorCard text={failed.message} onRetry={retry} />}
            <ScenarioDetail
              result={shown.data}
              members={members}
              selectedMemberId={memberId}
              resultMemberId={shown.memberId}
              onMemberChange={setMemberId}
              refreshing={shown.memberId !== memberId}
              onImport={onImport}
              onLearnMore={onLearnMore}
              headingRef={headingRef}
            />
          </>
        ) : (
          <div className="space-y-4">
            {summary && (
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="break-words font-heading text-lg font-bold text-[var(--ui-text)] focus:outline-none"
              >
                {summary.name}
              </h2>
            )}
            {failed ? (
              <ErrorCard text={failed.message} onRetry={retry} />
            ) : (
              <div role="status" data-testid="detail-loading" className="space-y-3">
                <span className="sr-only">Loading scenario result</span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 min-[1280px]:grid-cols-4">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div
                      key={i}
                      data-testid="skeleton-tile"
                      aria-hidden="true"
                      className="h-24 animate-pulse rounded-xl bg-[var(--ui-elevated)]"
                    />
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {Array.from({ length: 2 }, (_, i) => (
                    <div
                      key={i}
                      data-testid="skeleton-chart"
                      aria-hidden="true"
                      className="h-52 animate-pulse rounded-xl bg-[var(--ui-elevated)]"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
