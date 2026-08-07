import { API_BASE_URL, ApiError, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "./session";
import type {
  HouseholdMember,
  MeResponse,
  OtpRequestResponse,
  OtpVerifyResponse,
  Relationship,
  UpdateMeBody,
} from "./types";

export { ApiError };

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function throwIfError(response: Response): Promise<void> {
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }
}

export async function requestOtp(phoneNumber: string): Promise<OtpRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone_number: phoneNumber }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpRequestResponse;
}

export async function verifyOtp(phoneNumber: string, otp: string): Promise<OtpVerifyResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone_number: phoneNumber, otp }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpVerifyResponse;
}

export async function getMe(): Promise<MeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, { headers: authHeaders() });
  await throwIfError(response);
  return (await response.json()) as MeResponse;
}

export async function updateMe(body: UpdateMeBody): Promise<MeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  await throwIfError(response);
  return (await response.json()) as MeResponse;
}

export async function createHouseholdMember(
  name: string,
  relationship: Relationship,
  relationshipOtherLabel?: string,
): Promise<HouseholdMember> {
  const response = await fetch(`${API_BASE_URL}/household-members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      name,
      relationship,
      relationship_other_label: relationshipOtherLabel ?? null,
    }),
  });
  await throwIfError(response);
  return (await response.json()) as HouseholdMember;
}

export async function listHouseholdMembers(): Promise<HouseholdMember[]> {
  const response = await fetch(`${API_BASE_URL}/household-members`, { headers: authHeaders() });
  await throwIfError(response);
  return (await response.json()) as HouseholdMember[];
}

export const getHouseholdMembers = listHouseholdMembers;
