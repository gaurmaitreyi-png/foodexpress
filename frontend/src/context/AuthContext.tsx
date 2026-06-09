import { createContext, useContext, useState, ReactNode } from "react";
import api from "../api/client";

interface AuthState {
  username: string | null;
  isAuthed: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(
    localStorage.getItem("username")
  );

  async function login(u: string, password: string) {
    const res = await api.post("/auth/login/", { username: u, password });
    localStorage.setItem("access_token", res.data.access);
    localStorage.setItem("username", u);
    setUsername(u);
  }

  async function register(data: RegisterData) {
    await api.post("/auth/register/", data);
    await login(data.username, data.password);
  }

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    setUsername(null);
  }

  return (
    <AuthContext.Provider
      value={{ username, isAuthed: !!username, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
