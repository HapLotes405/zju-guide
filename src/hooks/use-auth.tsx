"use client";

// =============================================================================
// use-auth.ts — 登录态管理（React Context）
// =============================================================================

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, persistTokens, clearTokens, ApiError } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  username: string;
  avatar: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  /** The currently authenticated user, or null if not logged in. */
  user: User | null;
  /** True while the initial token validation is in progress. */
  isLoading: boolean;
  /** Convenience flag: true when user is not null. */
  isAuthenticated: boolean;
  /** Authenticate with username + password. Throws on failure. */
  login: (username: string, password: string) => Promise<void>;
  /** Register a new account. Does NOT auto-login. */
  register: (username: string, password: string) => Promise<void>;
  /** Clear tokens and reset user state. Does NOT redirect — caller should route. */
  logout: () => void;
  updateProfile: (form: FormData) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: if a token exists, validate it against /api/auth/me
  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("auth_access_token")
        : null;

    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    api
      .get<User>("/api/auth/me")
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        clearTokens();
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Actions ----

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<{
      accessToken: string;
      refreshToken: string;
    }>("/api/auth/login", { username, password });

    persistTokens(result.accessToken, result.refreshToken);

    const me = await api.get<User>("/api/auth/me");
    setUser(me);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    await api.post("/api/auth/register", { username, password });
  }, []);

  const updateProfile = useCallback(async (form: FormData) => {
    const updated = await api.patchForm<User>("/api/auth/me", form);
    setUser(updated);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
