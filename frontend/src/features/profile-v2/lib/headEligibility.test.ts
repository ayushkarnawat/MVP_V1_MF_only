import { describe, expect, it } from "vitest";
import { FIXABLE_REASONS, fixableHint, isFixable } from "./headEligibility";

const FIXABLE = ["no_email", "no_phone", "no_pan", "label_missing", "same_email_as_head", "same_phone_as_head", "email_in_use", "phone_in_use"];
const NOT_FIXABLE = ["pan_registered_elsewhere", "account_pending_deletion", "import_in_progress", "head_change_already_open"];

describe("headEligibility (QA fixes, C1)", () => {
  it("knows exactly the eight reasons a person can fix from the Choose head dialog", () => {
    expect([...FIXABLE_REASONS].sort()).toEqual([...FIXABLE].sort());
  });
  it("a member is fixable when every one of their reasons is fixable", () => {
    for (const reason of FIXABLE) expect(isFixable([reason])).toBe(true);
    expect(isFixable(["no_email", "no_phone"])).toBe(true);
    expect(isFixable([...FIXABLE])).toBe(true);
  });
  it("a member with no reasons is eligible, not fixable", () => {
    expect(isFixable([])).toBe(false);
  });
  it("a member is not fixable when any reason cannot be fixed here", () => {
    for (const reason of NOT_FIXABLE) expect(isFixable([reason])).toBe(false);
    expect(isFixable(["no_email", "import_in_progress"])).toBe(false);
    expect(isFixable(["pan_registered_elsewhere", "no_pan"])).toBe(false);
    expect(isFixable(["no_email", "some_reason_added_later"])).toBe(false);
  });
});

describe("fixableHint (QA fixes, C1)", () => {
  it("names one thing, or joins several with a comma and 'and'", () => {
    expect(fixableHint(["no_email", "no_phone"])).toBe("Needs an email address and a phone number.");
    expect(fixableHint(["no_email"])).toBe("Needs an email address.");
    expect(fixableHint(["no_phone"])).toBe("Needs a phone number.");
    expect(fixableHint(["no_pan"])).toBe("Needs their PAN.");
    expect(fixableHint(["label_missing"])).toBe("Needs their relationship to you.");
    expect(fixableHint(["no_email", "no_phone", "no_pan", "label_missing"])).toBe(
      "Needs an email address, a phone number, their PAN and their relationship to you.",
    );
  });
  it("a clash with the head or another account asks for a different one", () => {
    expect(fixableHint(["same_email_as_head"])).toBe("Needs a different email address.");
    expect(fixableHint(["email_in_use"])).toBe("Needs a different email address.");
    expect(fixableHint(["same_phone_as_head"])).toBe("Needs a different phone number.");
    expect(fixableHint(["phone_in_use"])).toBe("Needs a different phone number.");
    expect(fixableHint(["same_email_as_head", "same_phone_as_head"])).toBe("Needs a different email address and a different phone number.");
  });
  it("says each thing once, in a fixed order, whatever order the reasons arrive in", () => {
    expect(fixableHint(["email_in_use", "same_email_as_head"])).toBe("Needs a different email address.");
    expect(fixableHint(["no_phone", "no_email"])).toBe("Needs an email address and a phone number.");
  });
});
