import type { Context } from "hono";
import { z } from "zod";

import type { RoleCode } from "../access";
import type { AuthBindings } from "../auth";
import type { ResponsibleItem, ResponsiblesData } from "../shared/responsibles";
import { requireOffice } from "./payments";

type AppContext = Context<{ Bindings: AuthBindings }>;
const officeRoleCodes = ["data_entry", "controller", "treasurer", "admin"] as const;

const roleUpdateSchema = z.object({
  roles: z.array(z.enum(officeRoleCodes)).max(4)
    .refine((roles) => new Set(roles).size === roles.length),
  expectedUpdatedAt: z.string().min(10).max(40),
  reason: z.string().trim().min(5).max(300),
});

const statusUpdateSchema = z.object({
  status: z.enum(["active", "suspended"]),
  expectedUpdatedAt: z.string().min(10).max(40),
  reason: z.string().trim().min(5).max(300),
});

const revokeSessionsSchema = z.object({
  confirmation: z.literal("FERMER LES SESSIONS"),
  reason: z.string().trim().min(5).max(300),
});

function invalid(context: AppContext, message: string, status: 400 | 403 | 404 | 409 = 400) {
  const errors = { 400: "INVALID_INPUT", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT" } as const;
  return context.json({ error: errors[status], message }, status);
}

async function activeAdminCount(context: AppContext) {
  const row = await context.env.DB.prepare(
    `SELECT COUNT(DISTINCT p.id) AS count
       FROM profiles p JOIN user_roles ur ON ur.profile_id = p.id
       JOIN roles r ON r.id = ur.role_id
      WHERE p.status = 'active' AND ur.revoked_at IS NULL AND r.code = 'admin'`,
  ).first<{ count: number }>();
  return row?.count ?? 0;
}

async function targetProfile(context: AppContext, profileId: string) {
  return context.env.DB.prepare(
    `SELECT p.id AS profileId, p.auth_user_id AS authUserId, p.status,
            p.updated_at AS updatedAt,
            EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                     WHERE ur.profile_id = p.id AND ur.revoked_at IS NULL AND r.code = 'admin') AS isAdmin
       FROM profiles p WHERE p.id = ?`,
  ).bind(profileId).first<{
    profileId: string;
    authUserId: string;
    status: "pending" | "active" | "suspended";
    updatedAt: string;
    isAdmin: number;
  }>();
}

function auditStatement(
  context: AppContext,
  actorProfileId: string,
  action: string,
  entityId: string,
  oldValues: unknown,
  newValues: unknown,
) {
  return context.env.DB.prepare(
    `INSERT INTO audit_logs
      (id, actor_profile_id, action, entity_type, entity_id, old_values, new_values)
     VALUES (?, ?, ?, 'profile', ?, ?, ?)`,
  ).bind(crypto.randomUUID(), actorProfileId, action, entityId,
    JSON.stringify(oldValues), JSON.stringify(newValues));
}

export async function listResponsibles(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  if (!office.access.profile.centralAccess) return invalid(context, "La gestion des responsables est réservée au bureau central.", 403);
  const query = (context.req.query("q") ?? "").trim();
  if (query.length > 60 || (query && !/^[\p{L}\p{N}@._ +'’\-]+$/u.test(query))) {
    return invalid(context, "La recherche n’est pas valide.");
  }
  const pattern = `%${query}%`;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const rows = await context.env.DB.prepare(
    `SELECT p.id AS profileId, p.auth_user_id AS authUserId, p.office_id AS officeId,
            o.name AS officeName, p.central_access AS centralAccess, u.name, u.email,
            p.phone, u.member_number AS memberNumber, p.status,
            p.updated_at AS updatedAt,
            CASE WHEN m.id IS NULL THEN NULL ELSE m.first_name || ' ' || m.last_name END AS memberName,
            (SELECT COUNT(*) FROM auth_session s WHERE s.user_id = u.id AND s.expires_at > ?) AS activeSessionCount,
            (SELECT MAX(s.created_at) FROM auth_session s WHERE s.user_id = u.id AND s.expires_at > ?) AS latestSessionAt
       FROM profiles p JOIN auth_user u ON u.id = p.auth_user_id JOIN offices o ON o.id = p.office_id
       LEFT JOIN members m ON m.id = p.member_id
      WHERE ? = '' OR u.name LIKE ? COLLATE NOCASE OR u.email LIKE ? COLLATE NOCASE
         OR p.phone LIKE ? OR u.member_number LIKE ? COLLATE NOCASE
      ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'suspended' THEN 1 ELSE 2 END,
               u.name COLLATE NOCASE LIMIT 100`,
  ).bind(nowSeconds, nowSeconds, query, pattern, pattern, pattern, pattern).all<{
    profileId: string; authUserId: string; officeId: string; officeName: string; centralAccess: number; name: string; email: string; phone: string;
    memberNumber: string; status: ResponsibleItem["status"]; updatedAt: string;
    memberName: string | null; activeSessionCount: number; latestSessionAt: number | null;
  }>();

  const items = await Promise.all(rows.results.map(async (row): Promise<ResponsibleItem> => {
    const roleRows = await context.env.DB.prepare(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.profile_id = ? AND ur.revoked_at IS NULL ORDER BY r.code`,
    ).bind(row.profileId).all<{ code: RoleCode }>();
    return {
      ...row,
      centralAccess: Boolean(row.centralAccess),
      roles: roleRows.results.map((role) => role.code),
      latestSessionAt: row.latestSessionAt == null
        ? null
        : new Date(row.latestSessionAt < 10_000_000_000 ? row.latestSessionAt * 1000 : row.latestSessionAt).toISOString(),
    };
  }));
  const response: ResponsiblesData = {
    items,
    currentProfileId: office.access.profile.id,
    activeAdminCount: await activeAdminCount(context),
  };
  return context.json(response);
}

export async function updateResponsibleRoles(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  if (!office.access.profile.centralAccess) return invalid(context, "La gestion des responsables est réservée au bureau central.", 403);
  const parsed = roleUpdateSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Sélectionnez des rôles valides et indiquez une raison.");
  const profileId = context.req.param("id") ?? "";
  const target = await targetProfile(context, profileId);
  if (!target) return invalid(context, "Responsable introuvable.", 404);
  if (target.status !== "active") return invalid(context, "Réactivez d’abord ce compte avant de modifier ses rôles.", 409);
  if (profileId === office.access.profile.id && !parsed.data.roles.includes("admin")) {
    return invalid(context, "Vous ne pouvez pas retirer votre propre rôle administrateur.", 403);
  }
  if (target.isAdmin && !parsed.data.roles.includes("admin") && await activeAdminCount(context) <= 1) {
    return invalid(context, "Impossible de retirer le dernier administrateur actif.", 409);
  }
  const currentRows = await context.env.DB.prepare(
    `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.profile_id = ? AND ur.revoked_at IS NULL AND r.code <> 'member'`,
  ).bind(profileId).all<{ code: RoleCode }>();
  const previousRoles = currentRows.results.map((row) => row.code);
  const now = new Date().toISOString();
  const update = await context.env.DB.prepare(
    "UPDATE profiles SET updated_at = ? WHERE id = ? AND updated_at = ?",
  ).bind(now, profileId, parsed.data.expectedUpdatedAt).run();
  if (update.meta.changes !== 1) return invalid(context, "Cette fiche a été modifiée ailleurs. Rechargez-la.", 409);

  const statements = officeRoleCodes.map((code) => parsed.data.roles.includes(code)
    ? context.env.DB.prepare(
      `INSERT INTO user_roles (profile_id, role_id, assigned_by, assigned_at, revoked_at)
       SELECT ?, id, ?, CURRENT_TIMESTAMP, NULL FROM roles WHERE code = ?
       ON CONFLICT(profile_id, role_id) DO UPDATE SET assigned_by = excluded.assigned_by,
         assigned_at = CURRENT_TIMESTAMP, revoked_at = NULL`,
    ).bind(profileId, office.access.profile.id, code)
    : context.env.DB.prepare(
      `UPDATE user_roles SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
        WHERE profile_id = ? AND role_id = (SELECT id FROM roles WHERE code = ?)`,
    ).bind(profileId, code));
  statements.push(auditStatement(context, office.access.profile.id, "responsible.roles_updated", profileId,
    { roles: previousRoles }, { roles: parsed.data.roles, reason: parsed.data.reason }));
  await context.env.DB.batch(statements);
  return context.json({ ok: true, updatedAt: now });
}

export async function updateResponsibleStatus(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  if (!office.access.profile.centralAccess) return invalid(context, "La gestion des responsables est réservée au bureau central.", 403);
  const parsed = statusUpdateSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Indiquez le nouvel état et une raison.");
  const profileId = context.req.param("id") ?? "";
  const target = await targetProfile(context, profileId);
  if (!target) return invalid(context, "Responsable introuvable.", 404);
  if (target.status === "pending") return invalid(context, "Une demande en attente doit être traitée dans l’écran des validations.", 409);
  if (profileId === office.access.profile.id && parsed.data.status === "suspended") {
    return invalid(context, "Vous ne pouvez pas suspendre votre propre compte.", 403);
  }
  if (target.isAdmin && parsed.data.status === "suspended" && await activeAdminCount(context) <= 1) {
    return invalid(context, "Impossible de suspendre le dernier administrateur actif.", 409);
  }
  if (target.status === parsed.data.status) return invalid(context, "Ce compte possède déjà cet état.", 409);
  const now = new Date().toISOString();
  const update = await context.env.DB.prepare(
    "UPDATE profiles SET status = ?, updated_at = ? WHERE id = ? AND updated_at = ?",
  ).bind(parsed.data.status, now, profileId, parsed.data.expectedUpdatedAt).run();
  if (update.meta.changes !== 1) return invalid(context, "Cette fiche a été modifiée ailleurs. Rechargez-la.", 409);
  const statements = [
    auditStatement(context, office.access.profile.id,
      parsed.data.status === "suspended" ? "responsible.suspended" : "responsible.reactivated",
      profileId, { status: target.status }, { status: parsed.data.status, reason: parsed.data.reason }),
  ];
  if (parsed.data.status === "suspended") {
    statements.unshift(context.env.DB.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(target.authUserId));
  }
  await context.env.DB.batch(statements);
  return context.json({ ok: true, updatedAt: now, sessionsClosed: parsed.data.status === "suspended" });
}

export async function revokeResponsibleSessions(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  if (!office.access.profile.centralAccess) return invalid(context, "La gestion des responsables est réservée au bureau central.", 403);
  const parsed = revokeSessionsSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Recopiez « FERMER LES SESSIONS » et indiquez une raison.");
  const profileId = context.req.param("id") ?? "";
  const target = await targetProfile(context, profileId);
  if (!target) return invalid(context, "Responsable introuvable.", 404);
  if (profileId === office.access.profile.id) {
    return invalid(context, "Utilisez la déconnexion normale pour fermer votre propre session.", 403);
  }
  const count = await context.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM auth_session WHERE user_id = ?",
  ).bind(target.authUserId).first<{ count: number }>();
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(target.authUserId),
    auditStatement(context, office.access.profile.id, "responsible.sessions_revoked", profileId,
      { activeSessionCount: count?.count ?? 0 }, { activeSessionCount: 0, reason: parsed.data.reason }),
  ]);
  return context.json({ ok: true, sessionsClosed: count?.count ?? 0 });
}
