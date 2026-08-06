export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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
