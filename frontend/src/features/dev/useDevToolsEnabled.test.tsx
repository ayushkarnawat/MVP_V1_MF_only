import { renderHook, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { ApiError } from "../../lib/apiClient";
import * as api from "./api";
import { useDevToolsEnabled } from "./useDevToolsEnabled";
it("stays disabled after 404", async () => {
  vi.spyOn(api, "fetchDevStatus").mockRejectedValue(new ApiError(404, "missing"));
  const { result } = renderHook(useDevToolsEnabled);
  await waitFor(() => expect(api.fetchDevStatus).toHaveBeenCalled());
  expect(result.current).toBe(false);
});
it("enables when status resolves", async () => {
  vi.spyOn(api, "fetchDevStatus").mockResolvedValue({ enabled: true });
  const { result } = renderHook(useDevToolsEnabled);
  await waitFor(() => expect(result.current).toBe(true));
});
