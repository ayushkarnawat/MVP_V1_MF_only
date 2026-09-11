import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  getMe,
  reactivateAccount as apiReactivateAccount,
  requestAccountDeletion as apiRequestAccountDeletion,
  updateMe as apiUpdateMe,
  requestContactChange as apiRequestContactChange,
  verifyContactChange as apiVerifyContactChange,
} from "./api";
import { clearToken, getToken, setToken } from "./session";
import type { AccountDeletionReason, ContactChangeChannel, MeResponse, OtpRequestResponse, UpdateMeBody } from "./types";

interface AuthContextValue {
  token: string | null;
  me: MeResponse | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  updateMe: (body: UpdateMeBody) => Promise<void>;
  requestAccountDeletion: (reason: AccountDeletionReason, feedback?: string) => Promise<void>;
  reactivateAccount: () => Promise<void>;
  requestContactChange: (channel: ContactChangeChannel, identifier: string) => Promise<OtpRequestResponse>;
  verifyContactChange: (channel: ContactChangeChannel, identifier: string, otp: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resume() {
      const stored = getToken();
      if (!stored) {
        setLoading(false);
        return;
      }
      try {
        const meResponse = await getMe();
        if (!cancelled) {
          setTokenState(stored);
          setMe(meResponse);
        }
      } catch {
        clearToken();
        if (!cancelled) {
          setTokenState(null);
          setMe(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void resume();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (newToken: string) => {
    setToken(newToken);
    setTokenState(newToken);
    const meResponse = await getMe();
    setMe(meResponse);
  };

  const logout = () => {
    clearToken();
    setTokenState(null);
    setMe(null);
  };

  const updateMe = async (body: UpdateMeBody) => {
    const updated = await apiUpdateMe(body);
    setMe(updated);
  };

  const requestAccountDeletion = async (reason: AccountDeletionReason, feedback?: string) => {
    setMe(await apiRequestAccountDeletion(reason, feedback));
  };

  const reactivateAccount = async () => {
    setMe(await apiReactivateAccount());
  };

  const requestContactChange = (channel: ContactChangeChannel, identifier: string) =>
    apiRequestContactChange(channel, identifier);

  const verifyContactChange = async (channel: ContactChangeChannel, identifier: string, otp: string) => {
    setMe(await apiVerifyContactChange(channel, identifier, otp));
  };

  return (
    <AuthContext.Provider value={{
      token,
      me,
      loading,
      login,
      logout,
      updateMe,
      requestAccountDeletion,
      reactivateAccount,
      requestContactChange,
      verifyContactChange,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
