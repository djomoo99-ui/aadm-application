import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth, type RoleCode } from "./AuthContext";

function LoadingScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-100 px-6 text-center">
      <div>
        <p className="text-sm font-black tracking-[0.16em] text-[#173B57]">AADM</p>
        <div className="mx-auto mt-5 size-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-700" />
        <p className="mt-4 text-sm font-semibold text-slate-600">Vérification de votre accès…</p>
      </div>
    </div>
  );
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { access, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!access) return children;
  if (access.profile.status !== "active") return <Navigate to="/validation" replace />;
  return <Navigate to="/membre" replace />;
}

export function ActiveMemberOnly({ children }: { children: ReactNode }) {
  const { access, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!access) return <Navigate to="/connexion" state={{ from: location.pathname }} replace />;
  if (access.profile.status !== "active") return <Navigate to="/validation" replace />;
  return children;
}

export function PendingMemberOnly({ children }: { children: ReactNode }) {
  const { access, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!access) return <Navigate to="/connexion" replace />;
  if (access.profile.status === "active") return <Navigate to="/membre" replace />;
  return children;
}

export function OfficeOnly({ children, roles }: { children: ReactNode; roles?: RoleCode[] }) {
  const { access, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!access) return <Navigate to="/connexion" replace />;
  if (access.profile.status !== "active") return <Navigate to="/validation" replace />;

  const allowed = roles ?? ["data_entry", "controller", "treasurer", "admin"];
  if (!access.roles.some((role) => allowed.includes(role))) return <Navigate to="/membre" replace />;
  return children;
}

