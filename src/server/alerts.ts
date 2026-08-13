import type { Context } from "hono";
import { z } from "zod";

import type { AuthBindings } from "../auth";
import type { AlertsData, AlertScanResult, AlertSeverity, AlertStatus, OfficeAlert } from "../shared/alerts";
import { todayInParis } from "../shared/date";
import { requireOffice } from "./payments";

type AppContext = Context<{ Bindings: AuthBindings }>;
type Detection = Pick<OfficeAlert, "type" | "severity" | "title" | "message" | "entityType" | "entityId"> & { fingerprint: string; officeId: string | null };

const filtersSchema = z.object({
  status: z.enum(["all", "open", "in_review", "resolved"]).default("open"),
  severity: z.enum(["all", "info", "warning", "critical"]).default("all"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
const scanSchema = z.object({ reason: z.string().trim().min(5).max(300) });
const updateSchema = z.object({
  status: z.enum(["in_review", "resolved"]),
  note: z.string().trim().min(3).max(500),
});

function invalid(context: AppContext, message: string) {
  return context.json({ error: "INVALID_INPUT", message }, 400);
}

async function detectionOffice(database: D1Database, item: Omit<Detection, "officeId">) {
  if (item.entityType === "household") return (await database.prepare(`SELECT office_id AS officeId FROM households WHERE id = ?`).bind(item.entityId).first<{ officeId: string }>())?.officeId ?? null;
  if (item.entityType === "contribution_due") return (await database.prepare(`SELECT office_id AS officeId FROM contribution_dues WHERE id = ?`).bind(item.entityId).first<{ officeId: string }>())?.officeId ?? null;
  if (item.entityType === "payment") return (await database.prepare(`SELECT office_id AS officeId FROM payments WHERE id = ?`).bind(item.entityId).first<{ officeId: string }>())?.officeId ?? null;
  if (item.entityType === "association_meeting") return (await database.prepare(`SELECT office_id AS officeId FROM association_meetings WHERE id = ?`).bind(item.entityId).first<{ officeId: string }>())?.officeId ?? null;
  if (item.entityType === "member") return (await database.prepare(`SELECT h.office_id AS officeId FROM members m JOIN household_memberships hm ON hm.member_id = m.id AND hm.ends_at IS NULL JOIN households h ON h.id = hm.household_id WHERE m.id = ?`).bind(item.entityId).first<{ officeId: string }>())?.officeId ?? null;
  if (item.entityType === "access_request") return (await database.prepare(`SELECT h.office_id AS officeId FROM access_requests ar JOIN members m ON m.member_number = ar.member_number JOIN household_memberships hm ON hm.member_id = m.id AND hm.ends_at IS NULL JOIN households h ON h.id = hm.household_id WHERE ar.id = ?`).bind(item.entityId).first<{ officeId: string }>())?.officeId ?? null;
  return null;
}

async function detect(database: D1Database, scopeOfficeId?: string): Promise<Detection[]> {
  const today = todayInParis();
  const [pendingAccess, householdsToVerify, duesToVerify, missingBirthDates, missingActivityStatuses, missingPhones, imbalancedPayments, meetings] = await Promise.all([
    database.prepare(`SELECT id, declared_name AS name FROM access_requests WHERE status = 'pending'`).all<{ id: string; name: string }>(),
    database.prepare(`SELECT id, name FROM households WHERE status = 'to_verify'`).all<{ id: string; name: string }>(),
    database.prepare(`SELECT cd.id, cd.due_date AS dueDate, h.name AS householdName FROM contribution_dues cd JOIN households h ON h.id = cd.household_id WHERE cd.status = 'to_verify'`).all<{ id: string; dueDate: string; householdName: string }>(),
    database.prepare(`SELECT id, first_name || ' ' || last_name AS name FROM members WHERE status = 'active' AND birth_date IS NULL`).all<{ id: string; name: string }>(),
    database.prepare(`SELECT m.id, m.first_name || ' ' || m.last_name AS name FROM members m WHERE m.status = 'active' AND m.gender = 'male' AND m.birth_date IS NOT NULL AND DATE(m.birth_date, '+18 years') <= ? AND NOT EXISTS (SELECT 1 FROM member_activity_periods map WHERE map.member_id = m.id AND map.starts_at <= ? AND (map.ends_at IS NULL OR map.ends_at >= ?))`).bind(today, today, today).all<{ id: string; name: string }>(),
    database.prepare(`SELECT id, name FROM households WHERE status = 'active' AND (phone IS NULL OR TRIM(phone) = '')`).all<{ id: string; name: string }>(),
    database.prepare(`SELECT p.id, p.receipt_number AS receiptNumber, p.amount_cents AS amountCents, p.unallocated_amount_cents AS unallocatedAmountCents, COALESCE(SUM(pa.amount_cents), 0) AS allocatedAmountCents FROM payments p LEFT JOIN payment_allocations pa ON pa.payment_id = p.id WHERE p.status = 'posted' GROUP BY p.id HAVING p.amount_cents <> p.unallocated_amount_cents + COALESCE(SUM(pa.amount_cents), 0)`).all<{ id: string; receiptNumber: string; amountCents: number; unallocatedAmountCents: number; allocatedAmountCents: number }>(),
    database.prepare(`SELECT id, meeting_date AS meetingDate, label FROM association_meetings WHERE status = 'scheduled' AND meeting_date >= ? AND meeting_date <= DATE(?, '+30 day')`).bind(today, today).all<{ id: string; meetingDate: string; label: string }>(),
  ]);

  const raw: Array<Omit<Detection, "officeId">> = [
    ...pendingAccess.results.map((row) => ({ fingerprint: `pending_access:${row.id}`, type: "pending_access" as const, severity: "info" as const, title: "Demande d’accès à vérifier", message: `${row.name} attend la validation du bureau.`, entityType: "access_request", entityId: row.id })),
    ...householdsToVerify.results.map((row) => ({ fingerprint: `household_to_verify:${row.id}`, type: "household_to_verify" as const, severity: "warning" as const, title: "Foyer à vérifier", message: `La fiche du foyer ${row.name} contient des informations à confirmer.`, entityType: "household", entityId: row.id })),
    ...duesToVerify.results.map((row) => ({ fingerprint: `due_to_verify:${row.id}`, type: "due_to_verify" as const, severity: "warning" as const, title: "Cotisation à vérifier", message: `${row.householdName} · échéance du ${row.dueDate}.`, entityType: "contribution_due", entityId: row.id })),
    ...missingBirthDates.results.map((row) => ({ fingerprint: `missing_birth_date:${row.id}`, type: "missing_birth_date" as const, severity: "critical" as const, title: "Date de naissance manquante", message: `${row.name} ne peut pas être classé adulte ou enfant pour la caisse de rapatriement.`, entityType: "member", entityId: row.id })),
    ...missingActivityStatuses.results.map((row) => ({ fingerprint: `missing_activity_status:${row.id}`, type: "missing_activity_status" as const, severity: "warning" as const, title: "Activité rémunérée à renseigner", message: `La situation professionnelle de ${row.name} doit être datée pour calculer la cotisation trimestrielle.`, entityType: "member", entityId: row.id })),
    ...missingPhones.results.map((row) => ({ fingerprint: `missing_phone:${row.id}`, type: "missing_phone" as const, severity: "warning" as const, title: "Téléphone manquant", message: `Le foyer ${row.name} ne peut pas recevoir de rappel.`, entityType: "household", entityId: row.id })),
    ...imbalancedPayments.results.map((row) => ({ fingerprint: `payment_imbalance:${row.id}`, type: "payment_imbalance" as const, severity: "critical" as const, title: "Paiement déséquilibré", message: `Le reçu ${row.receiptNumber} vaut ${row.amountCents} centimes, mais ${row.allocatedAmountCents + row.unallocatedAmountCents} centimes sont justifiés.`, entityType: "payment", entityId: row.id })),
    ...meetings.results.map((row) => ({ fingerprint: `upcoming_meeting:${row.id}`, type: "upcoming_meeting" as const, severity: "info" as const, title: "Réunion prochaine", message: `${row.label} est prévue le ${row.meetingDate}.`, entityType: "association_meeting", entityId: row.id })),
  ];
  const enriched = await Promise.all(raw.map(async (item): Promise<Detection> => ({ ...item, officeId: await detectionOffice(database, item) })));
  return scopeOfficeId ? enriched.filter((item) => item.officeId === scopeOfficeId) : enriched;
}

export async function listAlerts(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "controller", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const parsed = filtersSchema.safeParse(context.req.query());
  if (!parsed.success) return invalid(context, "Les filtres sont invalides.");
  const status = parsed.data.status;
  const severity = parsed.data.severity;
  const where = `(? = 'all' OR status = ?) AND (? = 'all' OR severity = ?) AND (? = 1 OR office_id = ?)`;
  const scopeBindings = [status, status, severity, severity, office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId] as const;
  const count = await context.env.DB.prepare(`SELECT COUNT(*) AS count FROM office_alerts WHERE ${where}`).bind(...scopeBindings).first<{ count: number }>();
  const pageSize = 20;
  const total = count?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(parsed.data.page, pageCount);
  const [rows, summary, lastScan] = await Promise.all([
    context.env.DB.prepare(`SELECT id, type, severity, title, message, entity_type AS entityType, entity_id AS entityId, status, first_detected_at AS firstDetectedAt, last_seen_at AS lastSeenAt, resolved_at AS resolvedAt, resolution_note AS resolutionNote FROM office_alerts WHERE ${where} ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, last_seen_at DESC, id LIMIT ? OFFSET ?`).bind(...scopeBindings, pageSize, (page - 1) * pageSize).all<OfficeAlert>(),
    context.env.DB.prepare(`SELECT SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END) AS inReview, SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved, SUM(CASE WHEN status <> 'resolved' AND severity = 'critical' THEN 1 ELSE 0 END) AS critical FROM office_alerts WHERE (? = 1 OR office_id = ?)`).bind(office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).first<{ open: number | null; inReview: number | null; resolved: number | null; critical: number | null }>(),
    context.env.DB.prepare(`SELECT asr.created_at AS createdAt, asr.detected_count AS detectedCount, asr.opened_count AS openedCount, asr.reopened_count AS reopenedCount, asr.auto_resolved_count AS autoResolvedCount, asr.trigger, CASE WHEN asr.run_by = 'system' THEN 'Système' ELSE COALESCE(u.name, 'Responsable') END AS runByName FROM alert_scan_runs asr LEFT JOIN profiles p ON p.id = asr.run_by LEFT JOIN auth_user u ON u.id = p.auth_user_id ORDER BY asr.created_at DESC, asr.id DESC LIMIT 1`).first<AlertsData["lastScan"] extends infer T ? Exclude<T, null> : never>(),
  ]);
  const response: AlertsData = { items: rows.results, total, page, pageCount, summary: { open: summary?.open ?? 0, in_review: summary?.inReview ?? 0, resolved: summary?.resolved ?? 0, critical: summary?.critical ?? 0 }, lastScan: lastScan ?? null };
  return context.json(response, 200, { "Cache-Control": "no-store" });
}

type AlertScanOptions = {
  actorProfileId: string | null;
  reason: string;
  trigger: "manual" | "scheduled";
  runKey?: string;
  officeId?: string;
};

export async function runAlertScan(database: D1Database, options: AlertScanOptions): Promise<AlertScanResult> {
  if (options.runKey) {
    const previous = await database.prepare(`SELECT detected_count AS detectedCount, opened_count AS openedCount, reopened_count AS reopenedCount, auto_resolved_count AS autoResolvedCount FROM alert_scan_runs WHERE run_key = ?`).bind(options.runKey).first<Omit<AlertScanResult, "alreadyRun">>();
    if (previous) return { ...previous, alreadyRun: true };
  }
  const detections = await detect(database, options.officeId);
  const existing = await database.prepare(`SELECT id, fingerprint, status FROM office_alerts WHERE (? IS NULL OR office_id = ?)`).bind(options.officeId ?? null, options.officeId ?? null).all<{ id: string; fingerprint: string; status: AlertStatus }>();
  const byFingerprint = new Map(existing.results.map((item) => [item.fingerprint, item]));
  const detectedFingerprints = new Set(detections.map((item) => item.fingerprint));
  const openedCount = detections.filter((item) => !byFingerprint.has(item.fingerprint)).length;
  const reopenedCount = detections.filter((item) => byFingerprint.get(item.fingerprint)?.status === "resolved").length;
  const autoResolvedCount = existing.results.filter((item) => item.status !== "resolved" && !detectedFingerprints.has(item.fingerprint)).length;
  const scanId = crypto.randomUUID();
  const statements = [
    database.prepare(`INSERT INTO alert_scan_runs (id, detected_count, opened_count, reopened_count, auto_resolved_count, trigger, run_key, run_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(scanId, detections.length, openedCount, reopenedCount, autoResolvedCount, options.trigger, options.runKey ?? null, options.actorProfileId ?? "system", options.reason),
    ...detections.map((item) => database.prepare(`INSERT INTO office_alerts (id, office_id, fingerprint, type, severity, title, message, entity_type, entity_id, last_scan_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(fingerprint) DO UPDATE SET office_id = excluded.office_id, type = excluded.type, severity = excluded.severity, title = excluded.title, message = excluded.message, entity_type = excluded.entity_type, entity_id = excluded.entity_id, last_scan_id = excluded.last_scan_id, last_seen_at = CURRENT_TIMESTAMP, status = CASE WHEN office_alerts.status = 'resolved' THEN 'open' ELSE office_alerts.status END, resolved_at = CASE WHEN office_alerts.status = 'resolved' THEN NULL ELSE office_alerts.resolved_at END, resolved_by = CASE WHEN office_alerts.status = 'resolved' THEN NULL ELSE office_alerts.resolved_by END, resolution_note = CASE WHEN office_alerts.status = 'resolved' THEN NULL ELSE office_alerts.resolution_note END, updated_at = CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), item.officeId, item.fingerprint, item.type, item.severity, item.title, item.message, item.entityType, item.entityId, scanId)),
    database.prepare(`UPDATE office_alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by = NULL, resolution_note = 'Résolue automatiquement après contrôle', updated_at = CURRENT_TIMESTAMP WHERE source = 'scan' AND status <> 'resolved' AND (? IS NULL OR office_id = ?) AND (last_scan_id IS NULL OR last_scan_id <> ?)`).bind(options.officeId ?? null, options.officeId ?? null, scanId),
    database.prepare(`INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, new_values) VALUES (?, ?, 'alerts.scan_completed', 'alert_scan', ?, ?)`).bind(crypto.randomUUID(), options.actorProfileId, scanId, JSON.stringify({ detectedCount: detections.length, openedCount, reopenedCount, autoResolvedCount, trigger: options.trigger, reason: options.reason })),
  ];
  try {
    await database.batch(statements);
  } catch (error) {
    if (options.runKey) {
      const concurrentRun = await database.prepare(`SELECT detected_count AS detectedCount, opened_count AS openedCount, reopened_count AS reopenedCount, auto_resolved_count AS autoResolvedCount FROM alert_scan_runs WHERE run_key = ?`).bind(options.runKey).first<Omit<AlertScanResult, "alreadyRun">>();
      if (concurrentRun) return { ...concurrentRun, alreadyRun: true };
    }
    throw error;
  }
  return { detectedCount: detections.length, openedCount, reopenedCount, autoResolvedCount };
}

export async function scanAlerts(context: AppContext) {
  const office = await requireOffice(context, ["controller", "admin"]);
  if ("error" in office) return office.error;
  const parsed = scanSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Indiquez une raison d’au moins 5 caractères.");
  const result = await runAlertScan(context.env.DB, { actorProfileId: office.access.profile.id, reason: parsed.data.reason, trigger: "manual", officeId: office.access.profile.centralAccess ? undefined : office.access.profile.officeId });
  return context.json(result, 201, { "Cache-Control": "no-store" });
}

export async function updateAlert(context: AppContext) {
  const office = await requireOffice(context, ["controller", "admin"]);
  if ("error" in office) return office.error;
  const parsed = updateSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Choisissez un état et indiquez une note d’au moins 3 caractères.");
  const alert = await context.env.DB.prepare(`SELECT id, status FROM office_alerts WHERE id = ? AND (? = 1 OR office_id = ?)`)
    .bind(context.req.param("id"), office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId)
    .first<{ id: string; status: AlertStatus }>();
  if (!alert) return context.json({ error: "NOT_FOUND", message: "Cette alerte n’existe pas." }, 404);
  await context.env.DB.batch([
    context.env.DB.prepare(`UPDATE office_alerts SET status = ?, resolved_at = CASE WHEN ? = 'resolved' THEN CURRENT_TIMESTAMP ELSE NULL END, resolved_by = ?, resolution_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(parsed.data.status, parsed.data.status, office.access.profile.id, parsed.data.note, alert.id),
    context.env.DB.prepare(`INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, 'alerts.status_updated', 'office_alert', ?, ?, ?)`).bind(crypto.randomUUID(), office.access.profile.id, alert.id, JSON.stringify({ status: alert.status }), JSON.stringify(parsed.data)),
  ]);
  return context.json({ ok: true, message: parsed.data.status === "resolved" ? "Alerte classée comme résolue." : "Alerte prise en charge." });
}
