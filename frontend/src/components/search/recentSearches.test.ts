import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRecents,
  pushRecentFund,
  pushRecentSearch,
  readRecentFunds,
  readRecentSearches,
} from "./recentSearches";

describe("recentSearches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("stores at most 5 newest searches and trims/ignores empty or 1-char text", () => {
    pushRecentSearch("u1", "");
    pushRecentSearch("u1", "   ");
    pushRecentSearch("u1", "a");
    pushRecentSearch("u1", " b ");
    expect(readRecentSearches("u1")).toEqual([]);

    for (const q of ["one", "two", "three", "four", "five", "  six  "]) {
      pushRecentSearch("u1", q);
    }
    expect(readRecentSearches("u1")).toEqual(["six", "five", "four", "three", "two"]);
  });

  it("deduplicates case-insensitively and moves repeat to front", () => {
    pushRecentSearch("u1", "HDFC");
    pushRecentSearch("u1", "Parag");
    pushRecentSearch("u1", "hdfc");

    expect(readRecentSearches("u1")).toEqual(["hdfc", "Parag"]);
  });

  it("isolates searches and funds per userId and handles null userId", () => {
    pushRecentSearch("u1", "hdfc");
    pushRecentSearch("u2", "icici");
    pushRecentFund("u1", "s1");
    pushRecentFund("u2", "s2");
    pushRecentSearch(null, "ignored");
    pushRecentFund(null, "ignored-fund");

    expect(readRecentSearches("u1")).toEqual(["hdfc"]);
    expect(readRecentSearches("u2")).toEqual(["icici"]);
    expect(readRecentFunds("u1")).toEqual(["s1"]);
    expect(readRecentFunds("u2")).toEqual(["s2"]);
    expect(readRecentSearches(null)).toEqual([]);
    expect(readRecentFunds(null)).toEqual([]);
  });

  it("stores at most 5 newest recent funds with deduplication", () => {
    for (const id of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
      pushRecentFund("u1", id);
    }
    expect(readRecentFunds("u1")).toEqual(["s6", "s5", "s4", "s3", "s2"]);

    pushRecentFund("u1", "s3");
    expect(readRecentFunds("u1")).toEqual(["s3", "s6", "s5", "s4", "s2"]);
  });

  it("never throws when localStorage is blocked", () => {
    const blocked = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
    vi.stubGlobal("localStorage", {
      get length() {
        return blocked();
      },
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
      key: blocked,
      clear: blocked,
    });

    expect(() => pushRecentSearch("u1", "hdfc")).not.toThrow();
    expect(() => pushRecentFund("u1", "s1")).not.toThrow();
    expect(readRecentSearches("u1")).toEqual([]);
    expect(readRecentFunds("u1")).toEqual([]);
    expect(() => clearRecents()).not.toThrow();
  });

  it("clearRecents removes every user's recent keys without touching other keys", () => {
    localStorage.setItem("unrelated.key", "keep");
    pushRecentSearch("u1", "hdfc");
    pushRecentSearch("u2", "icici");
    pushRecentFund("u1", "s1");

    clearRecents();

    expect(readRecentSearches("u1")).toEqual([]);
    expect(readRecentSearches("u2")).toEqual([]);
    expect(readRecentFunds("u1")).toEqual([]);
    expect(localStorage.getItem("unrelated.key")).toBe("keep");
  });
});
