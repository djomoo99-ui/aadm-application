import type { Context } from "hono";
import { z } from "zod";

import type { AuthBindings } from "../auth";
import { sha256 } from "../security";
import type { AuditData, AuditItem, ExportSummary } from "../shared/audit";
import { requireOffice } from "./payments";

type AppContext = Context<{ Bindings: AuthBindings }>;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const auditFilters = z.object({
  q: z.string().trim().max(60).default(""),
  from: z.union([date, z.literal("")]).default(""),
  to: z.union([date, z.literal("")]).default(""),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
const exportSchema = z.object({
  type: z.enum(["members", "contributions", "payments"]),
  confirmation: z.literal("EXPORTER"),
  reason: z.string().trim().min(5).max(300),
});
const backupSchema = z.object({
  confirmation: z.literal("CREER UNE SAUVEGARDE"),
  reason: z.string().trim().min(5).max(300),
});

function invalid(context: AppContext, message: string, status: 400 | 413 = 400) {
  return context.json({ error: status === 413 ? "TOO_LARGE" : "INVALID_INPUT", message }, status);
}

function centralOnly(context: AppContext) {
  return context.json({ error: "FORBIDDEN", message: "Cette opération globale est réservée au bureau central." }, 403);
}

function safeJson(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value) as unknown; } catch { return { raw: value }; }
}

function auditStatement(context: AppContext, actorProfileId: string, action: string, newValues: unknown) {
  return context.env.DB.prepare(
    `INSERT INTO audit_logs
      (id, actor_profile_id, action, entity_type, entity_id, new_values)
     VALUES (?, ?, ?, 'export', NULL, ?)`,
  ).bind(crypto.randomUUID(), actorProfileId, action, JSON.stringify(newValues));
}

export async function listAuditLogs(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  if (!office.access.profile.centralAccess) return centralOnly(context);
  const parsed = auditFilters.safeParse(context.req.query());
  if (!parsed.success || (parsed.data.q && !/^[\p{L}\p{N}@._ +'’:\-]+$/u.test(parsed.data.q))) {
    return invalid(context, "Les filtres du journal sont invalides.");
  }
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) {
    return invalid(context, "La date de début doit précéder la date de fin.");
  }
  const pattern = `%${parsed.data.q}%`;
  const where = `(? = '' OR al.action LIKE ? COLLATE NOCASE OR al.entity_type LIKE ? COLLATE NOCASE
                    OR COALESCE(u.name, '') LIKE ? COLLATE NOCASE)
                 AND (? = '' OR DATE(al.created_at) >= ?)
                 AND (? = '' OR DATE(al.created_at) <= ?)`;
  const bindings = [parsed.data.q, pattern, pattern, pattern,
    parsed.data.from, parsed.data.from, parsed.data.to, parsed.data.to] as const;
  const count = await context.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM audit_logs al
       LEFT JOIN profiles p ON p.id = al.actor_profile_id
       LEFT JOIN auth_user u ON u.id = p.auth_user_id WHERE ${where}`,
  ).bind(...bindings).first<{ count: number }>();
  const pageSize = 25;
  const total = count?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(parsed.data.page, pageCount);
  const rows = await context.env.DB.prepare(
    `SELECT al.id, COALESCE(u.name, 'Système') AS actorName, al.action,
            al.entity_type AS entityType, al.entity_id AS entityId,
            al.old_values AS oldValues, al.new_values AS newValues,
            al.created_at AS createdAt
       FROM audit_logs al LEFT JOIN profiles p ON p.id = al.actor_profile_id
       LEFT JOIN auth_user u ON u.id = p.auth_user_id
      WHERE ${where} ORDER BY al.created_at DESC, al.id DESC LIMIT ? OFFSET ?`,
  ).bind(...bindings, pageSize, (page - 1) * pageSize).all<{
    id: string; actorName: string; action: string; entityType: string;
    entityId: string | null; oldValues: string | null; newValues: string | null; createdAt: string;
  }>();
  const response: AuditData = {
    items: rows.results.map((row): AuditItem => ({ ...row, oldValues: safeJson(row.oldValues), newValues: safeJson(row.newValues) })),
    total, page, pageCount,
  };
  return context.json(response, 200, { "Cache-Control": "no-store" });
}

export async function getExportSummary(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  if (!office.access.profile.centralAccess) return centralOnly(context);
  const [members, households, contributions, payments, lastBackup] = await Promise.all([
    context.env.DB.prepare("SELECT COUNT(*) AS count FROM members").first<{ count: number }>(),
    context.env.DB.prepare("SELECT COUNT(*) AS count FROM households").first<{ count: number }>(),
    context.env.DB.prepare("SELECT COUNT(*) AS count FROM contribution_dues").first<{ count: number }>(),
    context.env.DB.prepare("SELECT COUNT(*) AS count FROM payments").first<{ count: number }>(),
    context.env.DB.prepare(
      `SELECT al.created_at AS createdAt, COALESCE(u.name, 'Administrateur') AS actorName
         FROM audit_logs al LEFT JOIN profiles p ON p.id = al.actor_profile_id
         LEFT JOIN auth_user u ON u.id = p.auth_user_id
        WHERE al.action = 'backup.created' ORDER BY al.created_at DESC LIMIT 1`,
    ).first<{ createdAt: string; actorName: string }>(),
  ]);
  const response: ExportSummary = {
    members: members?.count ?? 0, households: households?.count ?? 0,
    contributions: contributions?.count ?? 0, payments: payments?.count ?? 0,
    lastBackupAt: lastBackup?.createdAt ?? null, lastBackupBy: lastBackup?.actorName ?? null,
  };
  return context.json(response, 200, { "Cache-Control": "no-store" });
}

function csvCell(value: unknown) {
  if (value == null) return "";
  let text = String(value).replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(rows: unknown[][]) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

function fileDate() { return new Date().toISOString().replace(/[:.]/g, "-"); }

export async function exportAdministrativeCsv(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  if (!office.access.profile.centralAccess) return centralOnly(context);
  const parsed = exportSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Choisissez un export, recopiez EXPORTER et indiquez une raison.");
  let rows: unknown[][];
  if (parsed.data.type === "members") {
    const result = await context.env.DB.prepare(
      `SELECT m.member_number AS memberNumber, m.first_name AS firstName, m.last_name AS lastName,
              m.gender, m.birth_date AS birthDate, m.phone, m.joined_at AS joinedAt,
              m.left_at AS leftAt, m.status, h.name AS householdName, hm.relationship
         FROM members m LEFT JOIN household_memberships hm ON hm.member_id = m.id AND hm.ends_at IS NULL
         LEFT JOIN households h ON h.id = hm.household_id ORDER BY m.last_name, m.first_name`,
    ).all<Record<string, unknown>>();
    rows = [["Numero_AADM", "Prenom", "Nom", "Sexe", "Naissance", "Telephone", "Adhesion", "Depart", "Statut", "Foyer", "Lien"],
      ...result.results.map((row) => [row.memberNumber, row.firstName, row.lastName, row.gender, row.birthDate,
        row.phone, row.joinedAt, row.leftAt, row.status, row.householdName, row.relationship])];
  } else if (parsed.data.type === "contributions") {
    const result = await context.env.DB.prepare(
      `SELECT h.name AS householdName, COALESCE(m.first_name || ' ' || m.last_name, '') AS memberName,
              d.due_date AS dueDate, cr.name AS ruleName, d.contribution_kind AS contributionKind,
              d.expected_amount_cents AS expectedAmountCents, d.paid_amount_cents AS paidAmountCents,
              d.age_snapshot AS ageSnapshot, d.working_snapshot AS workingSnapshot, d.status, d.source
         FROM contribution_dues d JOIN households h ON h.id = d.household_id
         JOIN contribution_rules cr ON cr.id = d.rule_id
         LEFT JOIN members m ON m.id = d.member_id ORDER BY d.due_date, h.name, memberName`,
    ).all<Record<string, unknown>>();
    rows = [["Foyer", "Membre", "Echeance", "Caisse", "Regle", "Montant_attendu_EUR", "Montant_paye_EUR", "Age", "Activite_remuneree", "Statut", "Source"],
      ...result.results.map((row) => [row.householdName, row.memberName, row.dueDate, row.contributionKind, row.ruleName,
        (Number(row.expectedAmountCents) / 100).toFixed(2), (Number(row.paidAmountCents) / 100).toFixed(2),
        row.ageSnapshot, row.workingSnapshot ? "oui" : "non", row.status, row.source])];
  } else {
    const result = await context.env.DB.prepare(
      `SELECT p.receipt_number AS receiptNumber, h.name AS householdName,
              COALESCE(m.first_name || ' ' || m.last_name, '') AS memberName,
              p.amount_cents AS amountCents, p.unallocated_amount_cents AS creditCents,
              p.payment_date AS paymentDate, p.method, p.status, p.note,
              pr.reason AS reversalReason, pr.reversed_at AS reversedAt
         FROM payments p JOIN households h ON h.id = p.household_id
         LEFT JOIN members m ON m.id = p.member_id LEFT JOIN payment_reversals pr ON pr.payment_id = p.id
        ORDER BY p.payment_date, p.created_at`,
    ).all<Record<string, unknown>>();
    rows = [["Recu", "Foyer", "Membre", "Montant_EUR", "Credit_EUR", "Date", "Methode", "Statut", "Note", "Motif_annulation", "Date_annulation"],
      ...result.results.map((row) => [row.receiptNumber, row.householdName, row.memberName,
        (Number(row.amountCents) / 100).toFixed(2), (Number(row.creditCents) / 100).toFixed(2), row.paymentDate,
        row.method, row.status, row.note, row.reversalReason, row.reversedAt])];
  }
  await auditStatement(context, office.access.profile.id, "export.csv_created", {
    type: parsed.data.type, rowCount: Math.max(0, rows.length - 1), reason: parsed.data.reason,
  }).run();
  const filename = `AADM-${parsed.data.type}-${fileDate()}.csv`;
  return context.body(csv(rows), 200, {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  });
}

const backupTables = [
  "offices", "households", "household_office_assignments", "members", "household_memberships", "member_activity_periods", "contribution_rules", "rule_due_months",
  "household_rule_assignments", "contribution_dues", "payments", "payment_allocations",
  "payment_reversals", "reminders", "imports", "audit_logs", "app_settings",
  "association_meetings", "due_generation_runs",
  "office_alerts", "alert_scan_runs",
] as const;

export async function createBusinessBackup(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  if (!office.access.profile.centralAccess) return centralOnly(context);
  const parsed = backupSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Recopiez CREER UNE SAUVEGARDE et indiquez une raison.");
  const total = await context.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM members) + (SELECT COUNT(*) FROM contribution_dues)
          + (SELECT COUNT(*) FROM payments) + (SELECT COUNT(*) FROM audit_logs) AS count`,
  ).first<{ count: number }>();
  if ((total?.count ?? 0) > 50_000) return invalid(context, "La sauvegarde est trop volumineuse pour un téléchargement direct.", 413);
  const backupId = crypto.randomUUID();
  await auditStatement(context, office.access.profile.id, "backup.created", {
    backupId, scope: "business_without_authentication", reason: parsed.data.reason,
  }).run();
  const data: Record<string, unknown[]> = {};
  for (const table of backupTables) {
    const rows = await context.env.DB.prepare(`SELECT * FROM ${table}`).all<Record<string, unknown>>();
    data[table] = rows.results;
  }
  const payload = JSON.stringify(data);
  const generatedAt = new Date().toISOString();
  const document = {
    manifest: {
      application: "AADM", format: "aadm-business-backup", schemaVersion: 1,
      backupId, generatedAt, generatedByProfileId: office.access.profile.id,
      excludes: ["mots de passe", "comptes de connexion", "sessions", "secrets", "codes QR"],
      tables: Object.fromEntries(backupTables.map((table) => [table, data[table].length])),
      dataSha256: await sha256(payload),
    },
    data,
  };
  return context.body(JSON.stringify(document, null, 2), 200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="AADM-sauvegarde-${fileDate()}.json"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  });
}
