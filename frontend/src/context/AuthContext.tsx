import React, { createContext, useContext, useState, useEffect } from "react";
import { AuthUser } from "../types";
import { fetchApi } from "../api-client";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
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
  };

  const isSuperAdmin = user?.role === "superadmin";
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isAdmin, isSuperAdmin, login, logout }}>
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
