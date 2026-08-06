import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getMe, updateMe as apiUpdateMe } from "./api";
import { clearToken, getToken, setToken } from "./session";
import type { MeResponse, UpdateMeBody } from "./types";

interface AuthContextValue {
  token: string | null;
  me: MeResponse | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  updateMe: (body: UpdateMeBody) => Promise<void>;
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

  return (
    <AuthContext.Provider value={{ token, me, loading, login, logout, updateMe }}>
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
