export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname || "localhost"}:8000`
    : "http://localhost:8000");

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(
      typeof payload === "string"
        ? payload
        : ((payload as { message?: string } | null)?.message ?? "Request failed"),
    );
    this.status = status;
    this.payload = payload;
  }
}

// Repeat navigation (dashboard <-> analytics, family-combined <-> per-
// member) re-mounts the same view and re-issues the exact same GET set —
// there was no caching layer anywhere on the frontend (live-verified
// 2026-08-14), so every switch re-fetched everything from scratch even
// seconds after the same data was already loaded. A short, session-only
// TTL closes that gap without risking meaningfully stale data; mutations
// that change dashboard/analytics-visible data (confirmImport,
// postOpeningBalance) call `invalidateApiCache()` explicitly rather than
// waiting out the window.
const GET_CACHE_TTL_MS = 60_000;
type CachedResponse = {
  body: ArrayBuffer;
  headers: [string, string][];
  status: number;
  statusText: string;
  expiresAt: number;
};

const _getCache = new Map<string, CachedResponse>();

function responseFromCache(cached: CachedResponse): Response {
  const body = cached.status === 204 || cached.status === 205 ? null : cached.body.slice(0);
  return new Response(body, {
    status: cached.status,
    statusText: cached.statusText,
    headers: cached.headers,
  });
}

export function invalidateApiCache(): void {
  _getCache.clear();
}

export async function cachedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const isGet = !options.method || options.method.toUpperCase() === "GET";
  if (isGet) {
    const cached = _getCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return responseFromCache(cached);
    }
  }

  const response = await fetch(url, options);
  if (isGet && response.ok) {
    // `fetch()` resolves when response headers arrive, before its body is
    // necessarily complete. Caching a live Response clone lets a later
    // AbortController cancellation poison that cached body stream. Buffer
    // the body first and cache detached bytes so only fully completed
    // responses can be reused after rapid route changes.
    const body = await response.arrayBuffer();
    const cached: CachedResponse = {
      body,
      headers: Array.from(response.headers.entries()),
      status: response.status,
      statusText: response.statusText,
      expiresAt: Date.now() + GET_CACHE_TTL_MS,
    };
    _getCache.set(url, cached);
    return responseFromCache(cached);
  }
  return response;
}

export async function parseErrorDetail(response: Response): Promise<unknown> {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail) && "code" in detail) {
      return detail;
    }
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === "string") {
      return detail[0].msg as string;
    }
    return `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}
