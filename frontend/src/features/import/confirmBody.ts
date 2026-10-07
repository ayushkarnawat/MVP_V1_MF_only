import type { ImportPreviewResponse, PersonConfirmation, PersonPreview, SchemeConfirmation, SchemeMatchPreview } from "./types";

export interface ConfirmChoices {
  /** person_key -> name typed in the people popup (U9). */
  names?: Record<string, string>;
  /** temp_id -> person_key: the popup's U10 owner pick for an unmatched fund. */
  owners?: Record<string, string>;
  /** person_key -> answer to an M8 "ask" name notice. */
  nameAnswers?: Record<string, boolean>;
  /** Answers from the fallback dialog for funds that couldn't be identified. */
  schemeConfirmations?: SchemeConfirmation[];
}

/**
 * Phase 7: the one confirm request, built straight after the people popup now
 * that the review screen is gone. The same rules MemberRibbonReview's
 * "Confirm imports" used: one entry per person shown (Me first), an explicit
 * `include: false` for an other-account person left out (U8), and every
 * unassigned fund's owner always sent so the client's default can never
 * differ from the server's own fallback. The review screen's "Move to…" is
 * gone (PRD-01 updated): a fund stays with the person it was matched to.
 */
export function buildConfirmBody(
  preview: ImportPreviewResponse,
  people: PersonPreview[],
  choices: ConfirmChoices,
): { people: PersonConfirmation[]; movedFunds: Record<string, string> } {
  const { names = {}, owners = {}, nameAnswers = {}, schemeConfirmations = [] } = choices;
  const shown = [...people].sort((a, b) => Number(b.is_me) - Number(a.is_me));
  const shownKeys = new Set(shown.map((p) => p.person_key));
  const meKey = shown.find((p) => p.is_me)?.person_key ?? shown[0]?.person_key ?? "";

  const ownerOf = (s: SchemeMatchPreview): string | null => {
    const pick = owners[s.temp_id];
    if (pick && shownKeys.has(pick)) return pick;
    if (s.person_key && shownKeys.has(s.person_key)) return s.person_key;
    // Unassigned funds default to Me; a fund of an excluded person belongs to nobody.
    return s.person_key ? null : meKey;
  };

  const byPerson: Record<string, SchemeConfirmation[]> = {};
  for (const conf of schemeConfirmations) {
    const s = preview.schemes.find((x) => x.temp_id === conf.temp_id);
    const owner = s ? ownerOf(s) : null;
    if (owner) (byPerson[owner] ??= []).push(conf);
  }

  const body: PersonConfirmation[] = shown.map((p) => {
    const out: PersonConfirmation = { person_key: p.person_key, scheme_confirmations: byPerson[p.person_key] ?? [] };
    const name = names[p.person_key]?.trim();
    if (name) out.name = name;
    if (p.status === "other_account") out.include = true;
    if (p.person_key in nameAnswers) out.accept_name_update = nameAnswers[p.person_key];
    return out;
  });
  // U8 "Leave it": tell the server explicitly rather than rely on its default.
  for (const p of preview.people) {
    if (!shownKeys.has(p.person_key) && p.status === "other_account") {
      body.push({ person_key: p.person_key, include: false, scheme_confirmations: [] });
    }
  }
  const movedFunds: Record<string, string> = {};
  for (const s of preview.schemes) {
    const pick = owners[s.temp_id];
    if (pick && shownKeys.has(pick) && pick !== s.person_key) movedFunds[s.temp_id] = pick;
    else if (s.person_key === null) {
      const owner = ownerOf(s);
      if (owner) movedFunds[s.temp_id] = owner;
    }
  }
  return { people: body, movedFunds };
}
