import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ACTIVE_ORG_KEY, api, refreshSession, setAccessToken, setUnauthorizedHandler } from "../services/api";
import type { MeResponse, OrgMembership, TokenResponse, User } from "../types/api";

type Status = "loading" | "anonymous" | "authenticated";

interface AuthState {
  status: Status;
  user: User | null;
  organizations: OrgMembership[];
  activeOrg: OrgMembership | null;
  canAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveOrg: (id: string) => void;
  reloadMe: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function pickOrg(orgs: OrgMembership[]): string | null {
  const stored = localStorage.getItem(ACTIVE_ORG_KEY);
  const id = orgs.find((o) => o.id === stored)?.id ?? orgs[0]?.id ?? null;
  if (id) localStorage.setItem(ACTIVE_ORG_KEY, id);
  else localStorage.removeItem(ACTIVE_ORG_KEY);
  return id;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  const apply = useCallback((data: MeResponse | null) => {
    setMe(data);
    setActiveOrgId(data ? pickOrg(data.organizations) : null);
    setStatus(data ? "authenticated" : "anonymous");
  }, []);

  const reset = useCallback(() => {
    setAccessToken(null);
    qc.clear();
    apply(null);
  }, [qc, apply]);

  // Sayfa yenilendiğinde HttpOnly refresh cookie'si ile oturumu geri yükle.
  useEffect(() => {
    setUnauthorizedHandler(reset);
    refreshSession().then((data) => apply(data));
  }, [apply, reset]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api<TokenResponse>("/auth/login", { method: "POST", body: { email, password } });
      setAccessToken(data.access_token);
      qc.clear();
      apply(data);
    },
    [qc, apply],
  );

  const logout = useCallback(async () => {
    try {
      await api<void>("/auth/logout", { method: "POST" });
    } finally {
      reset();
    }
  }, [reset]);

  const setActiveOrg = useCallback(
    (id: string) => {
      localStorage.setItem(ACTIVE_ORG_KEY, id);
      setActiveOrgId(id);
      qc.clear(); // başka tenant'ın önbelleğe alınmış verisi görünmesin
    },
    [qc],
  );

  const reloadMe = useCallback(async () => {
    const data = await api<MeResponse>("/auth/me");
    setMe(data);
  }, []);

  const value = useMemo<AuthState>(() => {
    const organizations = me?.organizations ?? [];
    const activeOrg = organizations.find((o) => o.id === activeOrgId) ?? null;
    return {
      status,
      user: me?.user ?? null,
      organizations,
      activeOrg,
      canAdmin: activeOrg?.role === "owner" || activeOrg?.role === "admin",
      login,
      logout,
      setActiveOrg,
      reloadMe,
    };
  }, [status, me, activeOrgId, login, logout, setActiveOrg, reloadMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth AuthProvider içinde kullanılmalı");
  return ctx;
}
