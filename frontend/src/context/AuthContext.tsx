import React, { createContext, useContext, useState, useEffect } from "react";
import { AuthUser, LoginResponse, TokenResponse } from "../types";
import { fetchApi } from "../api-client";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  verify2FA: (tempToken: string, code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("desire_token"));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function verifySession() {
      const savedToken = localStorage.getItem("desire_token");
      if (!savedToken) {
        setIsLoading(false);
        return;
      }
      try {
        const userData = await fetchApi<AuthUser>("/auth/me");
        setUser(userData);
      } catch (err) {
        console.error("Session verification failed:", err);
        localStorage.removeItem("desire_token");
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    verifySession();
  }, []);

  const login = async (email: string, password: string): Promise<LoginResponse> => {
    const res = await fetchApi<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!res.require_2fa && res.access_token && res.user) {
      localStorage.setItem("desire_token", res.access_token);
      setToken(res.access_token);
      setUser(res.user);
    }

    return res;
  };

  const verify2FA = async (tempToken: string, code: string): Promise<void> => {
    const res = await fetchApi<TokenResponse>("/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ temp_token: tempToken, code }),
    });

    localStorage.setItem("desire_token", res.access_token);
    setToken(res.access_token);
    setUser(res.user);
  };

  const logout = () => {
    // Clear all token and tenant cache
    localStorage.clear();
    sessionStorage.clear();
    setToken(null);
    setUser(null);
  };

  const isSuperAdmin = user?.role === "superadmin";
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isAdmin, isSuperAdmin, login, verify2FA, logout }}>
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
