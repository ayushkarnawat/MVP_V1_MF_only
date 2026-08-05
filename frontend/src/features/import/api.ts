import type {
  ImportConfirmResponse,
  ImportPreviewResponse,
  ParseErrorPayload,
  SchemeConfirmation,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const HOUSEHOLD_MEMBER_ID = import.meta.env.VITE_DEV_HOUSEHOLD_MEMBER_ID ?? "";

export class ApiError extends Error {
  status: number;
  payload: ParseErrorPayload | string;

  constructor(status: number, payload: ParseErrorPayload | string) {
    super(typeof payload === "string" ? payload : payload.message);
    this.status = status;
    this.payload = payload;
  }
}

async function parseErrorDetail(response: Response): Promise<ParseErrorPayload | string> {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail) && "code" in detail) {
      return detail as ParseErrorPayload;
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

export async function parseImport(file: File, password: string): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("password", password);

  const response = await fetch(`${API_BASE_URL}/imports/parse`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  return (await response.json()) as ImportPreviewResponse;
}

export async function confirmImport(
  sessionId: string,
  schemeConfirmations: SchemeConfirmation[],
): Promise<ImportConfirmResponse> {
  const response = await fetch(`${API_BASE_URL}/imports/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      household_member_id: HOUSEHOLD_MEMBER_ID,
      scheme_confirmations: schemeConfirmations,
    }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  return (await response.json()) as ImportConfirmResponse;
}
