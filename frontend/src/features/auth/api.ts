import { API_BASE_URL, ApiError, invalidateApiCache, parseErrorDetail } from "../../lib/apiClient";
import { getOrCreateDeviceId } from "./deviceId";
import { getToken } from "./session";
import type { AcceptedDocument } from "../legal/types";
import type {
  EmailOtpRequiredResponse,
  EmailOtpVerifyResult,
  HouseholdMember,
  MemberProfileBody,
  MergeMemberResult,
  MeResponse,
  OtpRequestResponse,
  OtpVerifyResult,
  Relationship,
  UpdateMeBody,
  AccountDeletionReason,
  ContactChangeChannel,
  ContactChangeReverseResponse,
  HeadChangeCompleteResponse,
  HeadChangeEligibilityResponse,
  HeadChangeErrorDetail,
  HeadChangeParty,
  HeadChangePreviewResponse,
  HeadChangeResendResponse,
  HeadChangeStartResponse,
  HeadChangeStatus,
  HeadChangeUndoResponse,
  PendingHeadChangeResponse,
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

export async function requestOtp(
  phoneNumber: string,
  pendingToken?: string,
  flow?: "signup" | "login",
  /** Phone sign-up only: the T&C + Privacy versions agreed by clicking "Get OTP". */
  acceptedDocuments?: AcceptedDocument[],
): Promise<OtpRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getOrCreateDeviceId() },
    body: JSON.stringify({
      phone_number: phoneNumber,
      ...(pendingToken ? { pending_token: pendingToken } : {}),
      ...(flow ? { flow } : {}),
      ...(acceptedDocuments ? { accepted_documents: acceptedDocuments } : {}),
    }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpRequestResponse;
}

export async function signupEmail(email: string, accepted?: AcceptedDocument[]): Promise<EmailOtpRequiredResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/signup/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getOrCreateDeviceId() },
    body: JSON.stringify({ email, ...(accepted ? { accepted_documents: accepted } : {}) }),
  });
  await throwIfError(response);
  return (await response.json()) as EmailOtpRequiredResponse;
}

export async function requestEmailOtp(email: string, pendingToken?: string, flow?: "login"): Promise<OtpRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/email-otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getOrCreateDeviceId() },
    body: JSON.stringify({
      email,
      ...(pendingToken ? { pending_token: pendingToken } : {}),
      ...(flow ? { flow } : {}),
    }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpRequestResponse;
}

export async function verifyEmailOtp(
  email: string,
  otp: string,
  pendingToken?: string,
): Promise<EmailOtpVerifyResult> {
  const response = await fetch(`${API_BASE_URL}/auth/email-otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      otp,
      ...(pendingToken ? { pending_token: pendingToken } : {}),
    }),
  });
  await throwIfError(response);
  return (await response.json()) as EmailOtpVerifyResult;
}

export async function verifyOtp(
  phoneNumber: string,
  otp: string,
  pendingToken?: string,
  flow?: "signup" | "login",
  accepted?: AcceptedDocument[],
): Promise<OtpVerifyResult> {
  const response = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getOrCreateDeviceId() },
    body: JSON.stringify({
      phone_number: phoneNumber,
      otp,
      ...(pendingToken ? { pending_token: pendingToken } : {}),
      ...(flow ? { flow } : {}),
      ...(accepted ? { accepted_documents: accepted } : {}),
    }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpVerifyResult;
}

export async function verifyGoogleCredential(
  idToken: string,
  pendingToken?: string,
  accepted?: AcceptedDocument[],
): Promise<OtpVerifyResult> {
  const response = await fetch(`${API_BASE_URL}/auth/oauth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getOrCreateDeviceId() },
    body: JSON.stringify({
      id_token: idToken,
      ...(pendingToken ? { pending_token: pendingToken } : {}),
      ...(accepted ? { accepted_documents: accepted } : {}),
    }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpVerifyResult;
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

/** Saves the Complete profile popup (name, relationship, phone, email, PAN) for a member. */
export async function updateMemberProfile(memberId: string, body: MemberProfileBody): Promise<HouseholdMember> {
  const response = await fetch(`${API_BASE_URL}/household-members/${memberId}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  await throwIfError(response);
  invalidateApiCache();
  return (await response.json()) as HouseholdMember;
}

/** Merges a manually added member (no detected PAN) into a detected one. */
export async function mergeMemberInto(sourceId: string, targetId: string): Promise<MergeMemberResult> {
  const response = await fetch(`${API_BASE_URL}/household-members/${sourceId}/merge-into/${targetId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  await throwIfError(response);
  invalidateApiCache();
  return (await response.json()) as MergeMemberResult;
}

export async function requestAccountDeletion(
  reason: AccountDeletionReason,
  feedback?: string,
): Promise<MeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/account-deletion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ reason, feedback: feedback || null }),
  });
  await throwIfError(response);
  return (await response.json()) as MeResponse;
}

export async function reactivateAccount(accepted: AcceptedDocument[]): Promise<MeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/reactivate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ accepted_documents: accepted }),
  });
  await throwIfError(response);
  return (await response.json()) as MeResponse;
}

export async function requestContactChange(
  channel: ContactChangeChannel,
  identifier: string,
): Promise<OtpRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/contact-change/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ channel, identifier }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpRequestResponse;
}

export async function verifyContactChange(
  channel: ContactChangeChannel,
  identifier: string,
  otp: string,
): Promise<MeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/contact-change/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ channel, identifier, otp }),
  });
  await throwIfError(response);
  return (await response.json()) as MeResponse;
}

export function parseHeadChangeError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): HeadChangeErrorDetail {
  if (err && typeof err === "object") {
    const payload =
      (err as { payload?: unknown }).payload ??
      (err as { detail?: unknown }).detail ??
      err;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const code =
        typeof (payload as { code?: unknown }).code === "string"
          ? (payload as { code: string }).code
          : null;
      const message = (payload as { message?: unknown }).message;
      if (typeof message === "string" && message) {
        return { code, message };
      }
    }
    if (typeof payload === "string" && payload && !/^Request failed with status \d+$/.test(payload)) {
      return { code: null, message: payload };
    }
    const errMsg = (err as { message?: unknown }).message;
    if (typeof errMsg === "string" && errMsg && !/^Request failed/.test(errMsg)) {
      return { code: null, message: errMsg };
    }
  }
  return { code: null, message: fallback };
}

export async function getHeadChangeEligibility(): Promise<HeadChangeEligibilityResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/head-change/eligibility`, {
    headers: authHeaders(),
  });
  await throwIfError(response);
  return (await response.json()) as HeadChangeEligibilityResponse;
}

export async function requestHeadChangeStartCode(toMemberId: string): Promise<OtpRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/head-change/start-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ to_member_id: toMemberId }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpRequestResponse;
}

export async function startHeadChange(
  toMemberId: string,
  currentHeadCode: string,
): Promise<HeadChangeStartResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/head-change/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      to_member_id: toMemberId,
      current_head_code: currentHeadCode,
    }),
  });
  await throwIfError(response);
  return (await response.json()) as HeadChangeStartResponse;
}

export async function verifyHeadChangeCode(
  requestId: string,
  party: HeadChangeParty,
  channel: ContactChangeChannel,
  code: string,
): Promise<HeadChangeStatus> {
  const response = await fetch(`${API_BASE_URL}/auth/head-change/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      request_id: requestId,
      party,
      channel,
      code,
    }),
  });
  await throwIfError(response);
  return (await response.json()) as HeadChangeStatus;
}

export async function resendHeadChangeCode(
  requestId: string,
  party: HeadChangeParty,
  channel: ContactChangeChannel,
): Promise<HeadChangeResendResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/head-change/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      request_id: requestId,
      party,
      channel,
    }),
  });
  await throwIfError(response);
  return (await response.json()) as HeadChangeResendResponse;
}

export async function cancelHeadChange(): Promise<HeadChangeStatus> {
  const response = await fetch(`${API_BASE_URL}/auth/head-change/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({}),
  });
  await throwIfError(response);
  return (await response.json()) as HeadChangeStatus;
}

export async function getPendingHeadChange(): Promise<PendingHeadChangeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/head-change/pending`, {
    headers: authHeaders(),
  });
  await throwIfError(response);
  return (await response.json()) as PendingHeadChangeResponse;
}

export async function previewHeadChange(requestId: string): Promise<HeadChangePreviewResponse> {
  const response = await fetch(
    `${API_BASE_URL}/auth/head-change/preview?request_id=${encodeURIComponent(requestId)}`,
    {
      headers: authHeaders(),
    },
  );
  await throwIfError(response);
  return (await response.json()) as HeadChangePreviewResponse;
}

export async function completeHeadChange(requestId: string): Promise<HeadChangeCompleteResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/head-change/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ request_id: requestId }),
  });
  await throwIfError(response);
  return (await response.json()) as HeadChangeCompleteResponse;
}

export async function undoHeadChange(token: string): Promise<HeadChangeUndoResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/head-change/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  await throwIfError(response);
  return (await response.json()) as HeadChangeUndoResponse;
}

export async function reverseContactChange(token: string): Promise<ContactChangeReverseResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/contact-change/reverse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  await throwIfError(response);
  return (await response.json()) as ContactChangeReverseResponse;
}
