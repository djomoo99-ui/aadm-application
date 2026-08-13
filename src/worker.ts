import { Hono } from "hono";
import { z } from "zod";

import { getAccessContext, hasAnyRole } from "./access";
import { createAuth, type AuthBindings } from "./auth";
import { getMemberContributions, getMemberDashboard, getMemberProfile, getMemberQr } from "./server/member";
import { analyzeWorkbookImport, confirmWorkbookImport } from "./server/imports";
import {
  getOfficeDashboard,
  getOfficeMemberDetail,
  listOfficeHouseholds,
  listOfficePayments,
  reverseOfficePayment,
} from "./server/office";
import { recordCashPayment, scanMemberQr, searchOfficeMembers } from "./server/payments";
import { getReminderCandidates, getReminderHistory, markReminderSent, prepareReminders } from "./server/reminders";
import {
  assignContributionRule,
  createAdministrationHousehold,
  createAdministrationMember,
  createContributionRule,
  listAdministrationHouseholds,
  listContributionRules,
  updateAdministrationHousehold,
  updateAdministrationMember,
  updateMemberActivity,
} from "./server/administration";
import {
  listResponsibles,
  revokeResponsibleSessions,
  updateResponsibleRoles,
  updateResponsibleStatus,
} from "./server/responsibles";
import {
  createBusinessBackup,
  exportAdministrativeCsv,
  getExportSummary,
  listAuditLogs,
} from "./server/audit-exports";
import { generateYearDues, getCalendar } from "./server/calendar";
import { listAlerts, runAlertScan, scanAlerts, updateAlert } from "./server/alerts";
import { assignResponsibleOffice, createOffice, listOffices, moveHouseholdOffice, updateOffice } from "./server/offices";
import { hmacSha256, sha256 } from "./security";

const app = new Hono<{ Bindings: AuthBindings }>();

const reviewSchema = z.object({
  note: z.string().trim().max(500).optional().default(""),
});

function forbidden(context: Parameters<typeof getAccessContext>[0]) {
  return context.json(
    { error: "FORBIDDEN", message: "Vous n’êtes pas autorisé à effectuer cette action." },
    403,
  );
}

app.use("/api/office/*", async (context, next) => {
  if (context.req.method !== "GET") {
    const origin = context.req.header("Origin");
    const expectedOrigin = new URL(context.req.url).origin;
    if (origin && origin !== expectedOrigin) {
      return context.json({ error: "INVALID_ORIGIN", message: "Origine de la requête refusée." }, 403);
    }
    if (!context.req.header("Content-Type")?.toLowerCase().includes("application/json")) {
      return context.json({ error: "INVALID_CONTENT_TYPE", message: "Format de requête refusé." }, 415);
    }
  }
  await next();
});

app.on(["GET", "POST"], "/api/auth/*", (context) =>
  createAuth(context.env, context.req.raw).handler(context.req.raw),
);

app.get("/api/me", async (context) => {
  const access = await getAccessContext(context);
  if (!access) {
    return context.json({ error: "UNAUTHENTICATED", message: "Connexion requise." }, 401);
  }
  return context.json(access);
});

app.get("/api/member/dashboard", getMemberDashboard);
app.get("/api/member/contributions", getMemberContributions);
app.get("/api/member/qr", getMemberQr);
app.get("/api/member/profile", getMemberProfile);

app.post("/api/office/scan-qr", scanMemberQr);
app.get("/api/office/members/search", searchOfficeMembers);
app.get("/api/office/dashboard", getOfficeDashboard);
app.get("/api/office/households", listOfficeHouseholds);
app.get("/api/office/member-detail", getOfficeMemberDetail);
app.get("/api/office/payments", listOfficePayments);
app.post("/api/office/payments", recordCashPayment);
app.post("/api/office/payments/:id/reverse", reverseOfficePayment);
app.post("/api/office/imports/analyze", analyzeWorkbookImport);
app.post("/api/office/imports/confirm", confirmWorkbookImport);
app.get("/api/office/reminders/candidates", getReminderCandidates);
app.get("/api/office/reminders/history", getReminderHistory);
app.post("/api/office/reminders/prepare", prepareReminders);
app.post("/api/office/reminders/:id/sent", markReminderSent);
app.get("/api/office/administration/households", listAdministrationHouseholds);
app.post("/api/office/administration/households", createAdministrationHousehold);
app.patch("/api/office/administration/households/:id", updateAdministrationHousehold);
app.post("/api/office/administration/households/:id/members", createAdministrationMember);
app.patch("/api/office/administration/members/:id", updateAdministrationMember);
app.post("/api/office/administration/members/:id/activity", updateMemberActivity);
app.get("/api/office/administration/contribution-rules", listContributionRules);
app.post("/api/office/administration/contribution-rules", createContributionRule);
app.post("/api/office/administration/households/:id/rule-assignment", assignContributionRule);
app.get("/api/office/responsibles", listResponsibles);
app.patch("/api/office/responsibles/:id/roles", updateResponsibleRoles);
app.patch("/api/office/responsibles/:id/status", updateResponsibleStatus);
app.post("/api/office/responsibles/:id/revoke-sessions", revokeResponsibleSessions);
app.get("/api/office/audit-logs", listAuditLogs);
app.get("/api/office/exports/summary", getExportSummary);
app.post("/api/office/exports/csv", exportAdministrativeCsv);
app.post("/api/office/backups", createBusinessBackup);
app.get("/api/office/calendar", getCalendar);
app.post("/api/office/calendar/generate", generateYearDues);
app.get("/api/office/alerts", listAlerts);
app.post("/api/office/alerts/scan", scanAlerts);
app.patch("/api/office/alerts/:id", updateAlert);
app.get("/api/office/offices", listOffices);
app.post("/api/office/offices", createOffice);
app.patch("/api/office/offices/:id", updateOffice);
app.post("/api/office/households/:id/change-office", moveHouseholdOffice);
app.patch("/api/office/responsibles/:id/office", assignResponsibleOffice);

app.get("/api/office/access-requests", async (context) => {
  const access = await getAccessContext(context);
  if (!access) return context.json({ error: "UNAUTHENTICATED" }, 401);
  if (!hasAnyRole(access, ["controller", "treasurer", "admin"])) return forbidden(context);

  const requests = await context.env.DB.prepare(
    `SELECT ar.id, ar.member_number AS memberNumber, ar.declared_name AS declaredName,
            ar.phone, ar.status, ar.created_at AS createdAt,
            m.id AS matchingMemberId, m.first_name AS matchingFirstName,
            m.last_name AS matchingLastName
       FROM access_requests ar
       LEFT JOIN members m ON m.member_number = ar.member_number
       LEFT JOIN household_memberships hm ON hm.member_id = m.id AND hm.ends_at IS NULL
       LEFT JOIN households h ON h.id = hm.household_id
      WHERE ar.status = 'pending' AND (? = 1 OR h.office_id = ?)
      ORDER BY ar.created_at ASC`,
  ).bind(access.profile.centralAccess ? 1 : 0, access.profile.officeId).all();

  return context.json({ requests: requests.results });
});

app.post("/api/office/access-requests/:id/approve", async (context) => {
  const access = await getAccessContext(context);
  if (!access) return context.json({ error: "UNAUTHENTICATED" }, 401);
  if (!hasAnyRole(access, ["controller", "treasurer", "admin"])) return forbidden(context);

  const parsedBody = reviewSchema.safeParse(await context.req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return context.json({ error: "INVALID_INPUT", message: "La note est trop longue." }, 400);
  }

  const request = await context.env.DB.prepare(
    `SELECT ar.id, ar.auth_user_id AS authUserId, ar.member_number AS memberNumber,
            ar.status, p.id AS profileId
       FROM access_requests ar
       JOIN profiles p ON p.auth_user_id = ar.auth_user_id
      WHERE ar.id = ?`,
  )
    .bind(context.req.param("id"))
    .first<{
      id: string;
      authUserId: string;
      memberNumber: string;
      status: string;
      profileId: string;
    }>();

  if (!request || request.status !== "pending") {
    return context.json({ error: "NOT_FOUND", message: "Cette demande n’est plus disponible." }, 404);
  }

  const member = await context.env.DB.prepare(
    `SELECT m.id FROM members m JOIN household_memberships hm ON hm.member_id = m.id AND hm.ends_at IS NULL JOIN households h ON h.id = hm.household_id WHERE m.member_number = ? AND m.status = 'active' AND (? = 1 OR h.office_id = ?)`,
  )
    .bind(request.memberNumber, access.profile.centralAccess ? 1 : 0, access.profile.officeId)
    .first<{ id: string }>();

  if (!member) {
    return context.json(
      { error: "MEMBER_NOT_FOUND", message: "Aucun membre actif ne correspond à ce numéro." },
      409,
    );
  }

  const existingLink = await context.env.DB.prepare(
    `SELECT id FROM profiles WHERE member_id = ? AND id <> ?`,
  )
    .bind(member.id, request.profileId)
    .first();

  if (existingLink) {
    return context.json(
      { error: "MEMBER_ALREADY_LINKED", message: "Ce membre possède déjà un compte validé." },
      409,
    );
  }

  const qrId = crypto.randomUUID();
  const qrSignature = await hmacSha256(`${qrId}:${member.id}`, context.env.QR_TOKEN_SECRET);
  const qrTokenHash = await sha256(`${qrId}.${qrSignature}`);
  const auditId = crypto.randomUUID();

  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE profiles
          SET member_id = ?, status = 'active', approved_by = ?,
              approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND member_id IS NULL
          AND EXISTS (SELECT 1 FROM access_requests WHERE id = ? AND status = 'pending')`,
    ).bind(member.id, access.profile.id, request.profileId, request.id),
    context.env.DB.prepare(
      `UPDATE access_requests
          SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
              review_note = ?
        WHERE id = ? AND status = 'pending'`,
    ).bind(access.profile.id, parsedBody.data.note, request.id),
    context.env.DB.prepare(
      `INSERT OR IGNORE INTO user_roles (profile_id, role_id, assigned_by)
       SELECT ?, 'role_member', ?
        WHERE EXISTS (
          SELECT 1 FROM access_requests
           WHERE id = ? AND status = 'approved' AND reviewed_by = ?
        )`,
    ).bind(request.profileId, access.profile.id, request.id, access.profile.id),
    context.env.DB.prepare(
      `INSERT INTO member_qr_codes (id, member_id, token_hash, status)
       SELECT ?, ?, ?, 'active'
        WHERE EXISTS (
          SELECT 1 FROM access_requests
           WHERE id = ? AND status = 'approved' AND reviewed_by = ?
        )
          AND NOT EXISTS (
            SELECT 1 FROM member_qr_codes WHERE member_id = ? AND status = 'active'
          )`,
    ).bind(qrId, member.id, qrTokenHash, request.id, access.profile.id, member.id),
    context.env.DB.prepare(
      `INSERT INTO audit_logs
        (id, actor_profile_id, action, entity_type, entity_id, new_values)
       VALUES (?, ?, 'access_request.approved', 'profile', ?, ?)`,
    ).bind(auditId, access.profile.id, request.profileId, JSON.stringify({ memberId: member.id })),
  ]);

  return context.json({ ok: true, message: "Le compte membre est maintenant actif." });
});

app.post("/api/office/access-requests/:id/reject", async (context) => {
  const access = await getAccessContext(context);
  if (!access) return context.json({ error: "UNAUTHENTICATED" }, 401);
  if (!hasAnyRole(access, ["controller", "treasurer", "admin"])) return forbidden(context);

  const parsedBody = reviewSchema.safeParse(await context.req.json().catch(() => ({})));
  if (!parsedBody.success || parsedBody.data.note.length < 3) {
    return context.json({ error: "INVALID_INPUT", message: "Indiquez la raison du refus." }, 400);
  }

  const result = await context.env.DB.prepare(
    `UPDATE access_requests
        SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
            review_note = ?
      WHERE id = ? AND status = 'pending'
        AND (? = 1 OR EXISTS (
          SELECT 1 FROM members m
          JOIN household_memberships hm ON hm.member_id = m.id AND hm.ends_at IS NULL
          JOIN households h ON h.id = hm.household_id
          WHERE m.member_number = access_requests.member_number AND h.office_id = ?
        ))`,
  )
    .bind(access.profile.id, parsedBody.data.note, context.req.param("id"),
      access.profile.centralAccess ? 1 : 0, access.profile.officeId)
    .run();

  if (result.meta.changes !== 1) {
    return context.json({ error: "NOT_FOUND", message: "Cette demande n’est plus disponible." }, 404);
  }

  return context.json({ ok: true, message: "La demande a été refusée." });
});

app.get("/api/health", (context) =>
  context.json({
    ok: true,
    application: "AADM",
    environment: context.env.APP_ENV ?? "local",
    timestamp: new Date().toISOString(),
  }),
);

app.get("/api/health/database", async (context) => {
  try {
    const result = await context.env.DB.prepare("SELECT 1 AS healthy").first<{ healthy: number }>();
    return context.json({ ok: result?.healthy === 1, database: "D1" });
  } catch {
    return context.json(
      { ok: false, database: "D1", message: "La base de données est indisponible." },
      503,
    );
  }
});

app.notFound((context) =>
  context.json({ error: "NOT_FOUND", message: "La ressource demandée est introuvable." }, 404),
);

const worker: ExportedHandler<AuthBindings> = {
  fetch: (request, env, executionContext) => app.fetch(request, env, executionContext),
  scheduled: (controller, env, executionContext) => {
    const scheduledDate = new Date(controller.scheduledTime).toISOString().slice(0, 10);
    executionContext.waitUntil(runAlertScan(env.DB, {
      actorProfileId: null,
      reason: "Contrôle quotidien automatique",
      trigger: "scheduled",
      runKey: `scheduled:${scheduledDate}`,
    }));
  },
};

export default worker;
