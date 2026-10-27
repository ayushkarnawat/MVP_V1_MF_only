// Test support for the Home page tests (orchestrator-owned: do not edit). It replaces `fetch` with a router
// that answers every Home route from the golden fixtures, records each call, and lets a test override one
// section with a body, an error status, a never-ending request or a function.
import { vi } from "vitest";
import { invalidateApiCache } from "../../../lib/apiClient";
import { fixture } from "../fixtures";
import { newsFixture } from "../fixtures/newsFixtures";

export type HomeRouteName = "summary" | "wealth-series" | "allocation" | "movers" | "worth-a-look" | "benchmarks" | "news";

export interface HomeCall {
  section: HomeRouteName;
  scope: "aggregate" | "member";
  memberId: string | null;
  query: URLSearchParams;
  url: string;
}

export class HttpFailure {
  status: number;
  constructor(status = 500) { this.status = status; }
}

/** A request that never answers; it rejects with an AbortError when the page cancels it. */
export const PENDING = Symbol("pending");

export type HomeHandler = unknown | HttpFailure | typeof PENDING | ((call: HomeCall) => unknown | Promise<unknown>);

export const ASHA = "81e5a369-bbd4-59f1-b480-8a5bbf1c74ef";
export const DEV = "e6b4557c-b0e3-58f9-8642-54da2db3a27d";
export const MEMBERS = [{ id: ASHA, name: "ASHA RAO" }, { id: DEV, name: "Dev Rao" }];

const ROUTE = /\/home\/(summary|wealth-series|allocation|movers|worth-a-look|benchmarks|news)(?:\?|$)/;

function defaults(call: HomeCall): unknown {
  const member = call.scope === "member";
  switch (call.section) {
    case "summary": return fixture(member ? "summary_member" : "summary_family");
    case "benchmarks": return fixture(member ? "benchmarks_no_mix" : "benchmarks_family");
    case "allocation": return fixture(member ? "allocation_member" : "allocation_family");
    case "worth-a-look": return fixture("worth_three_cards");
    case "movers": {
      const by = call.query.get("by");
      if (by === "fund") return fixture("movers_fund");
      const sector = fixture<Record<string, unknown>>("movers_sector");
      // The golden set has no plain category response: a sector one relabelled as category is enough here.
      return by === "category" ? { ...sector, view: "category", requested_view: "category", estimated: false } : sector;
    }
    case "wealth-series": {
      const period = call.query.get("period");
      if (period === "1D") return fixture("wealth_1d_family");
      if (period === "1Y") return fixture("wealth_1y_member_clipped");
      if (period === "custom") return fixture("wealth_custom_past_range");
      return fixture("wealth_1m_family_benchmark");
    }
    case "news": return newsFixture(member ? "news_member_debt" : "news_specific_three");
  }
}

function abortable(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise<Response>((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

export function mockHomeApi(overrides: Partial<Record<HomeRouteName, HomeHandler>> = {}) {
  invalidateApiCache();
  const handlers: Partial<Record<HomeRouteName, HomeHandler>> = { ...overrides };
  const calls: HomeCall[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const match = ROUTE.exec(url);
    if (!match) return new Response(JSON.stringify({ detail: "not found" }), { status: 404 });
    const section = match[1] as HomeRouteName;
    const memberMatch = /\/household-members\/([^/]+)\/home\//.exec(url);
    const call: HomeCall = {
      section,
      scope: memberMatch ? "member" : "aggregate",
      memberId: memberMatch ? decodeURIComponent(memberMatch[1]) : null,
      query: new URL(url, "http://localhost").searchParams,
      url,
    };
    calls.push(call);

    const handler = section in handlers ? handlers[section] : undefined;
    if (handler === PENDING) return abortable(init?.signal);
    if (handler instanceof HttpFailure) return new Response(JSON.stringify({ detail: "failed" }), { status: handler.status });
    const body = typeof handler === "function" ? await (handler as (c: HomeCall) => unknown)(call)
      : handler !== undefined ? handler : defaults(call);
    if (body === PENDING) return abortable(init?.signal);
    if (body instanceof HttpFailure) return new Response(JSON.stringify({ detail: "failed" }), { status: body.status });
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    calls,
    callsFor: (section: HomeRouteName) => calls.filter(call => call.section === section),
    set: (section: HomeRouteName, handler: HomeHandler) => { handlers[section] = handler; },
  };
}
