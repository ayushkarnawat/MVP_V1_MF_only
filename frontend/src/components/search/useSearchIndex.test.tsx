import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getToken } from "@/features/auth/session";
import { fetchSearchIndex } from "./searchApi";
import { clearSearchState } from "./searchIndexStore";
import { useSearchIndex } from "./useSearchIndex";
import type { SearchIndexResponse } from "./searchTypes";

vi.mock("@/features/auth/session", () => ({
  getToken: vi.fn(() => "tok-1"),
}));

vi.mock("./searchApi", () => ({
  fetchSearchIndex: vi.fn(),
}));

const mockedGetToken = vi.mocked(getToken);
const mockedFetchSearchIndex = vi.mocked(fetchSearchIndex);

const SAMPLE: SearchIndexResponse = {
  generated_at: "2026-11-20T10:00:00+05:30",
  funds: [
    {
      scheme_id: "s1",
      name: "Parag Parikh Flexi Cap",
      amc_name: "PPFAS",
      sebi_category: "Flexi Cap",
      plan_type: "direct",
      main_manager: "Rajeev Thakkar",
      holders: [],
    },
  ],
};

function Harness() {
  const { status, data, load, retry } = useSearchIndex();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="count">{data ? String(data.funds.length) : "none"}</span>
      <button type="button" onClick={load}>
        Load
      </button>
      <button type="button" onClick={retry}>
        Retry
      </button>
    </div>
  );
}

describe("useSearchIndex", () => {
  afterEach(() => {
    clearSearchState();
    vi.clearAllMocks();
    mockedGetToken.mockReturnValue("tok-1");
  });

  it("does not fetch on mount until load() is called", async () => {
    mockedFetchSearchIndex.mockResolvedValueOnce(SAMPLE);

    render(<Harness />);

    expect(screen.getByTestId("status").textContent).toBe("idle");
    expect(screen.getByTestId("count").textContent).toBe("none");
    expect(mockedFetchSearchIndex).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText("Load"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("ready");
    });
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(mockedFetchSearchIndex).toHaveBeenCalledTimes(1);
  });

  it("transitions to error on failure and recovers on retry()", async () => {
    mockedFetchSearchIndex
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(SAMPLE);

    render(<Harness />);

    await act(async () => {
      fireEvent.click(screen.getByText("Load"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("error");
    });
    expect(screen.getByTestId("count").textContent).toBe("none");

    await act(async () => {
      fireEvent.click(screen.getByText("Retry"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("ready");
    });
    expect(screen.getByTestId("count").textContent).toBe("1");
  });
});
