import type { Context } from "hono";

import { createAuth, type AuthBindings } from "./auth";

export type RoleCode = "member" | "data_entry" | "controller" | "treasurer" | "admin";

export type AccessContext = {
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

export async function getAccessContext(
  context: Context<{ Bindings: AuthBindings }>,
): Promise<AccessContext | null> {
  const auth = createAuth(context.env, context.req.raw);
  const session = await auth.api.getSession({ headers: context.req.raw.headers });

  if (!session) return null;

  const profile = await context.env.DB.prepare(
    `SELECT p.id, p.member_id AS memberId, p.status, p.office_id AS officeId,
            o.name AS officeName, p.central_access AS centralAccess,
            ar.status AS requestStatus
       FROM profiles p JOIN offices o ON o.id = p.office_id
       LEFT JOIN access_requests ar ON ar.auth_user_id = p.auth_user_id
      WHERE p.auth_user_id = ?`,
  )
    .bind(session.user.id)
    .first<{
      id: string;
      memberId: string | null;
      status: "pending" | "active" | "suspended";
      requestStatus: AccessContext["requestStatus"];
      officeId: string;
      officeName: string;
      centralAccess: number;
    }>();

  if (!profile) return null;

  const roleRows = await context.env.DB.prepare(
    `SELECT r.code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.profile_id = ? AND ur.revoked_at IS NULL`,
  )
    .bind(profile.id)
    .all<{ code: RoleCode }>();

  const user = session.user as typeof session.user & { phone: string; memberNumber: string };

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      memberNumber: user.memberNumber,
    },
    profile: {
      id: profile.id,
      memberId: profile.memberId,
      status: profile.status,
      officeId: profile.officeId,
      officeName: profile.officeName,
      centralAccess: Boolean(profile.centralAccess),
    },
    requestStatus: profile.requestStatus,
    roles: roleRows.results.map((row) => row.code),
  };
}

export function hasAnyRole(access: AccessContext, allowed: RoleCode[]) {
  return access.roles.some((role) => allowed.includes(role));
}
