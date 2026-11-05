import React, { createContext, useContext, useState, useEffect } from "react";
import { AuthUser } from "../types";
import { fetchApi, LIVE } from "../api-client";

// A session is only invalid when the server says so. A restarting server, a sleeping host or a dropped connection says nothing
// about the session, so the saved token is kept and the check is retried.
const SESSION_RETRY_DELAYS_MS = [1000, 2500, 5000, 9000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  sessionError: string | null; // set when the saved session could not be checked because the server did not answer
  retrySession: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("desire_token"));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionCheck, setSessionCheck] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function verifySession() {
      const savedToken = localStorage.getItem("desire_token");
      if (!savedToken) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setSessionError(null);
      for (let attempt = 0; attempt <= SESSION_RETRY_DELAYS_MS.length; attempt++) {
        try {
          const userData = await fetchApi<AuthUser>("/auth/me", LIVE);
          if (!cancelled) {
            setUser(userData);
            setIsLoading(false);
          }
          return;
        } catch (err: any) {
          if (err?.status === 401 || err?.status === 403) {
            // The server answered and the token is not valid (expired or revoked): sign out for real
            localStorage.removeItem("desire_token");
            if (!cancelled) {
              setToken(null);
              setUser(null);
              setIsLoading(false);
            }
            return;
          }
          console.warn("Session check could not reach the server, will retry:", err?.message || err);
          if (attempt < SESSION_RETRY_DELAYS_MS.length) {
            await sleep(SESSION_RETRY_DELAYS_MS[attempt]);
            if (cancelled) return;
          }
        }
      }
      // Still no answer: keep the token and say so, instead of showing the sign-in page
      if (!cancelled) {
        setSessionError("The server is not responding yet.");
        setIsLoading(false);
      }
    }
    verifySession();
    return () => {
      cancelled = true;
    };
  }, [sessionCheck]);

  const retrySession = () => setSessionCheck((n) => n + 1);

  const login = async (email: string, password: string) => {
    const res = await fetchApi<{ access_token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem("desire_token", res.access_token);
    setToken(res.access_token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem("desire_token");
    setToken(null);
    setUser(null);
    window.location.href = "/";
  };

  const isSuperAdmin = user?.role === "superadmin";
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isAdmin, isSuperAdmin, login, logout, sessionError, retrySession }}>
      {children}
    </AuthContext.Provider>
  );
};


export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
