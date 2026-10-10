import { afterEach, expect, it, vi } from "vitest";
import { ApiError, invalidateApiCache } from "../../lib/apiClient";
import * as session from "../auth/session";
import { getScenarioResult, listScenarios } from "./api";
import { historical, historicalResult } from "./testFixtures";

afterEach(() => { invalidateApiCache(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("requests authenticated lists and results with abort signals, preserving decimal strings", async () => {
  vi.spyOn(session, "getToken").mockReturnValue("token");
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json([historical]))
    .mockResolvedValueOnce(Response.json([historical])).mockResolvedValueOnce(Response.json(historicalResult));
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  expect(await listScenarios(true, signal)).toEqual([historical]);
  await listScenarios(false, signal);
  expect(await getScenarioResult("c1", signal)).toEqual(historicalResult);
  expect(fetcher.mock.calls.map(([url]) => new URL(url).pathname + new URL(url).search))
    .toEqual(["/scenarios?curated=true", "/scenarios", "/scenarios/c1/results"]);
  for (const [, options] of fetcher.mock.calls) {
    expect(options.headers.get("Authorization")).toBe("Bearer token");
    expect(options.signal).toBe(signal);
  }
});

it("exposes server errors without manufacturing result values", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "Scenario not found" }, { status: 404 })));
  await expect(getScenarioResult("missing")).rejects.toMatchObject({ status: 404, message: "Scenario not found" });
  await expect(getScenarioResult("missing")).rejects.toBeInstanceOf(ApiError);
});
