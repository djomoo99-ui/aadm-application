import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type RoleCode = "member" | "data_entry" | "controller" | "treasurer" | "admin";

export type CurrentAccess = {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    memberNumber: string;
  };
  profile: {
    id: string;
    memberId: string | null;
    status: "pending" | "active" | "suspended";
    officeId: string;
    officeName: string;
    centralAccess: boolean;
  };
  requestStatus: "pending" | "approved" | "rejected" | "correction_requested" | null;
  roles: RoleCode[];
};

type AuthContextValue = {
  access: CurrentAccess | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<CurrentAccess | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/me", { credentials: "include" });
      setAccess(response.ok ? ((await response.json()) as CurrentAccess) : null);
    } catch {
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: "{}",
    });
    setAccess(null);
  }, []);

  const value = useMemo(() => ({ access, loading, refresh, signOut }), [access, loading, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans AuthProvider.");
  return value;
}
