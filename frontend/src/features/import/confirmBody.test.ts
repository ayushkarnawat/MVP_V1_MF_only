import { describe, expect, it } from "vitest";
import { buildConfirmBody } from "./confirmBody";
import { person, preview, scheme } from "./testFixtures";

describe("buildConfirmBody (Phase 7: what the review screen used to send)", () => {
  it("one entry per person, Me first, with an unassigned fund's owner always sent", () => {
    const p = preview({
      schemes: [scheme("r1", { person_key: "ramesh" }), scheme("m1", { person_key: "me" }), scheme("t9", { person_key: null })],
      people: [person("ramesh", "Ramesh Sharma"), person("me", "Aditi Sharma", { is_me: true, status: "me" })],
      unassigned_temp_ids: ["t9"],
    });
    const { people, movedFunds } = buildConfirmBody(p, p.people, {});
    expect(people.map((x) => x.person_key)).toEqual(["me", "ramesh"]);
    expect(movedFunds).toEqual({ t9: "me" });
  });

  it("sends typed names, U10 owner picks, name-notice answers and U8 includes", () => {
    const p = preview({
      schemes: [scheme("m1", { person_key: "me" }), scheme("t9", { person_key: null }), scheme("k1", { person_key: "kiran" })],
      people: [
        person("me", "Aditi Sharma", { is_me: true, status: "me" }),
        person("p2", "Person 2", { needs_name: true }),
        person("kiran", "Kiran Sharma", { status: "other_account" }),
      ],
      unassigned_temp_ids: ["t9"],
    });
    const shown = p.people.filter((x) => x.person_key !== "kiran"); // U8: Kiran left out
    const { people, movedFunds } = buildConfirmBody(p, shown, {
      names: { p2: "  Meera Sharma " }, owners: { t9: "p2" }, nameAnswers: { me: true },
    });
    expect(people).toEqual([
      { person_key: "me", scheme_confirmations: [], accept_name_update: true },
      { person_key: "p2", scheme_confirmations: [], name: "Meera Sharma" },
      { person_key: "kiran", include: false, scheme_confirmations: [] },
    ]);
    expect(movedFunds).toEqual({ t9: "p2" });
  });

  it("puts each fallback-dialog answer on the person who owns that fund", () => {
    const p = preview({
      schemes: [scheme("m1", { person_key: "me" }), scheme("t9", { person_key: null })],
      unassigned_temp_ids: ["t9"],
    });
    const { people } = buildConfirmBody(p, p.people, {
      schemeConfirmations: [{ temp_id: "m1", amfi_code: "123" }, { temp_id: "t9", unlisted: true }],
    });
    expect(people[0].scheme_confirmations).toEqual([{ temp_id: "m1", amfi_code: "123" }, { temp_id: "t9", unlisted: true }]);
  });
});

it("preserves legacy included-person and plan-override confirmations", () => {
  const p = preview({
    people: [person("kiran", "Kiran Sharma", { status: "other_account" }),
      person("me", "Aditi Sharma", { is_me: true, status: "me" })],
    schemes: [scheme("k1", { person_key: "kiran" }), scheme("m1", { person_key: "me" })],
  });
  expect(buildConfirmBody(p, p.people, {
    nameAnswers: { me: false }, schemeConfirmations: [{ temp_id: "k1", plan_type_override: "direct" }],
  })).toEqual({
    people: [
      { person_key: "me", accept_name_update: false, scheme_confirmations: [] },
      { person_key: "kiran", include: true, scheme_confirmations: [{ temp_id: "k1", plan_type_override: "direct" }] },
    ],
    movedFunds: {},
  });
});
