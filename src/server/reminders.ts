import type { Context } from "hono";
import { z } from "zod";

import type { AuthBindings } from "../auth";
import { hmacSha256 } from "../security";
import { todayInParis } from "../shared/date";
import type {
  PreparedReminder,
  ReminderCandidate,
  ReminderCandidatesData,
  ReminderHistoryData,
  ReminderKind,
} from "../shared/reminders";
import { requireOffice } from "./payments";

type AppContext = Context<{ Bindings: AuthBindings }>;

const prepareSchema = z.object({
  items: z.array(z.object({
    householdReference: z.string().trim().min(60).max(200),
    kind: z.enum(["overdue", "upcoming"]),
    idempotencyKey: z.string().uuid(),
  })).min(1).max(20),
}).superRefine((value, context) => {
  const keys = value.items.map((item) => `${item.householdReference}:${item.kind}`);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", message: "Un foyer apparaît plusieurs fois." });
});
const sentSchema = z.object({ confirmed: z.literal(true) });

type CandidateRow = {
  householdId: string;
  householdName: string;
  phone: string | null;
  recipientName: string;
  dueNowCents: number;
  oldestUnpaidDueDate: string | null;
  latestUnpaidDueDate: string | null;
  nextDueDate: string | null;
  nextDueAmountCents: number | null;
  lastOverdueReminderAt: string | null;
  lastUpcomingReminderAt: string | null;
};

function formatDateFr(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })
    .format(new Date(`${date}T12:00:00Z`));
}

function formatEuros(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function normalizeWhatsappPhone(phone: string | null) {
  if (!phone) return null;
  const compact = phone.replace(/[\s().-]/g, "");
  const international = compact.startsWith("+") ? compact.slice(1) : compact.startsWith("00") ? compact.slice(2) : "";
  return /^[1-9][0-9]{7,14}$/.test(international) ? international : null;
}

function monthsBetween(olderDate: string, newerDate: string) {
  return Math.max(0, (Date.parse(`${newerDate}T12:00:00Z`) - Date.parse(`${olderDate}T12:00:00Z`)) / (30.4375 * 86_400_000));
}

function overdueTone(oldest: string, today: string) {
  const months = monthsBetween(oldest, today);
  if (months >= 12) return { tone: "red" as const, label: "12 mois et plus" };
  if (months >= 6) return { tone: "orange" as const, label: "6 à 11 mois" };
  return { tone: "green" as const, label: "Moins de 6 mois" };
}

function periodForOverdue(row: CandidateRow) {
  if (!row.oldestUnpaidDueDate || !row.latestUnpaidDueDate) return "les cotisations en attente";
  if (row.oldestUnpaidDueDate === row.latestUnpaidDueDate) return `l’échéance du ${formatDateFr(row.oldestUnpaidDueDate)}`;
  return `les échéances du ${formatDateFr(row.oldestUnpaidDueDate)} au ${formatDateFr(row.latestUnpaidDueDate)}`;
}

function messageFor(row: CandidateRow, kind: ReminderKind, amountCents: number, periodLabel: string) {
  const greeting = row.recipientName ? `Bonjour ${row.recipientName},` : "Bonjour,";
  if (kind === "overdue") {
    return `${greeting}\n\nSelon les registres de l’association AADM, un montant de ${formatEuros(amountCents)} reste à régler pour ${periodLabel}.\n\nSi un paiement manque dans notre historique ou si une correction est nécessaire, merci de contacter le trésorier.\n\nMerci.\nLe bureau AADM`;
  }
  return `${greeting}\n\nPetit rappel de l’association AADM : votre prochaine cotisation de ${formatEuros(amountCents)} arrive à échéance le ${formatDateFr(row.nextDueDate as string)}.\n\nMerci.\nLe bureau AADM`;
}

async function createHouseholdReference(householdId: string, secret: string) {
  return `${householdId}.${await hmacSha256(`reminder:${householdId}`, secret)}`;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function householdIdFromReference(reference: string, secret: string) {
  const separator = reference.lastIndexOf(".");
  if (separator < 1) return null;
  const householdId = reference.slice(0, separator);
  const supplied = reference.slice(separator + 1);
  const expected = await hmacSha256(`reminder:${householdId}`, secret);
  return constantTimeEqual(supplied, expected) ? householdId : null;
}

async function candidateRows(context: AppContext, access: { profile: { officeId: string; centralAccess: boolean } }) {
  const today = todayInParis();
  const result = await context.env.DB.prepare(
    `SELECT h.id AS householdId, h.name AS householdName,
            COALESCE(h.phone,
              (SELECT m.phone FROM household_memberships hm JOIN members m ON m.id = hm.member_id
                WHERE hm.household_id = h.id AND hm.relationship = 'head'
                  AND hm.starts_at <= ? AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
                ORDER BY hm.starts_at DESC LIMIT 1)) AS phone,
            COALESCE(
              (SELECT m.first_name FROM household_memberships hm JOIN members m ON m.id = hm.member_id
                WHERE hm.household_id = h.id AND hm.relationship = 'head'
                  AND hm.starts_at <= ? AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
                ORDER BY hm.starts_at DESC LIMIT 1), '') AS recipientName,
            COALESCE(SUM(CASE WHEN d.due_date <= ? AND d.status NOT IN ('paid','exempt','to_verify')
              THEN MAX(d.expected_amount_cents - d.paid_amount_cents, 0) ELSE 0 END), 0) AS dueNowCents,
            MIN(CASE WHEN d.due_date <= ? AND d.status NOT IN ('paid','exempt','to_verify')
                      AND d.paid_amount_cents < d.expected_amount_cents THEN d.due_date END) AS oldestUnpaidDueDate,
            MAX(CASE WHEN d.due_date <= ? AND d.status NOT IN ('paid','exempt','to_verify')
                      AND d.paid_amount_cents < d.expected_amount_cents THEN d.due_date END) AS latestUnpaidDueDate,
            (SELECT due_date FROM contribution_dues nd
              WHERE nd.household_id = h.id AND nd.office_id = h.office_id AND nd.due_date > ?
                AND nd.status NOT IN ('paid','exempt','to_verify')
                AND nd.paid_amount_cents < nd.expected_amount_cents
              ORDER BY nd.due_date LIMIT 1) AS nextDueDate,
            (SELECT expected_amount_cents - paid_amount_cents FROM contribution_dues nd
              WHERE nd.household_id = h.id AND nd.office_id = h.office_id AND nd.due_date > ?
                AND nd.status NOT IN ('paid','exempt','to_verify')
                AND nd.paid_amount_cents < nd.expected_amount_cents
              ORDER BY nd.due_date LIMIT 1) AS nextDueAmountCents,
            (SELECT MAX(created_at) FROM reminders r WHERE r.household_id = h.id AND r.office_id = h.office_id AND r.kind = 'overdue') AS lastOverdueReminderAt,
            (SELECT MAX(created_at) FROM reminders r WHERE r.household_id = h.id AND r.office_id = h.office_id AND r.kind = 'upcoming') AS lastUpcomingReminderAt
       FROM households h LEFT JOIN contribution_dues d ON d.household_id = h.id AND d.office_id = h.office_id
      WHERE h.status = 'active' AND (? = 1 OR h.office_id = ?)
      GROUP BY h.id ORDER BY h.name COLLATE NOCASE`,
  ).bind(today, today, today, today, today, today, today, today, today,
    access.profile.centralAccess ? 1 : 0, access.profile.officeId).all<CandidateRow>();
  return result.results;
}

function remindedRecently(value: string | null) {
  if (!value) return false;
  return Date.now() - Date.parse(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z")) < 7 * 86_400_000;
}

async function buildCandidates(context: AppContext, access: { profile: { officeId: string; centralAccess: boolean } }) {
  const today = todayInParis();
  const rows = await candidateRows(context, access);
  const candidates: ReminderCandidate[] = [];
  for (const row of rows) {
    const phoneReady = normalizeWhatsappPhone(row.phone) !== null;
    const reference = await createHouseholdReference(row.householdId, context.env.QR_TOKEN_SECRET);
    if (row.dueNowCents > 0 && row.oldestUnpaidDueDate) {
      const presentation = overdueTone(row.oldestUnpaidDueDate, today);
      const periodLabel = periodForOverdue(row);
      candidates.push({
        householdReference: reference, householdName: row.householdName, recipientName: row.recipientName,
        phone: row.phone, phoneReady, kind: "overdue", amountCents: row.dueNowCents, periodLabel,
        dueDate: row.oldestUnpaidDueDate, daysUntilDue: null, statusLabel: presentation.label,
        statusTone: presentation.tone, messagePreview: messageFor(row, "overdue", row.dueNowCents, periodLabel),
        recentlyReminded: remindedRecently(row.lastOverdueReminderAt), lastReminderAt: row.lastOverdueReminderAt,
      });
    }
    if (row.nextDueDate && row.nextDueAmountCents && row.nextDueAmountCents > 0) {
      const daysUntilDue = Math.ceil((Date.parse(`${row.nextDueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
      if (daysUntilDue <= 60) {
        const periodLabel = `échéance du ${formatDateFr(row.nextDueDate)}`;
        candidates.push({
          householdReference: reference, householdName: row.householdName, recipientName: row.recipientName,
          phone: row.phone, phoneReady, kind: "upcoming", amountCents: row.nextDueAmountCents, periodLabel,
          dueDate: row.nextDueDate, daysUntilDue, statusLabel: `Dans ${daysUntilDue} jour${daysUntilDue > 1 ? "s" : ""}`,
          statusTone: "grey", messagePreview: messageFor(row, "upcoming", row.nextDueAmountCents, periodLabel),
          recentlyReminded: remindedRecently(row.lastUpcomingReminderAt), lastReminderAt: row.lastUpcomingReminderAt,
        });
      }
    }
  }
  return candidates;
}

export async function getReminderCandidates(context: AppContext) {
  const office = await requireOffice(context, ["controller", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const candidates = await buildCandidates(context, office.access);
  const response: ReminderCandidatesData = {
    overdueCount: candidates.filter((item) => item.kind === "overdue").length,
    upcomingCount: candidates.filter((item) => item.kind === "upcoming").length,
    candidates,
  };
  return context.json(response);
}

export async function prepareReminders(context: AppContext) {
  const office = await requireOffice(context, ["treasurer", "admin"]);
  if ("error" in office) return office.error;
  const parsed = prepareSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "INVALID_REMINDERS", message: "La sélection n’est pas valide." }, 400);
  const candidates = await buildCandidates(context, office.access);
  const candidateMap = new Map(candidates.map((item) => [`${item.householdReference}:${item.kind}`, item]));
  const prepared: PreparedReminder[] = [];
  const statements: D1PreparedStatement[] = [];
  for (const item of parsed.data.items) {
    const candidate = candidateMap.get(`${item.householdReference}:${item.kind}`);
    if (!candidate) return context.json({ error: "CANDIDATE_CHANGED", message: "La situation d’un foyer a changé. Rechargez la liste." }, 409);
    if (!candidate.phoneReady || !candidate.phone) return context.json({ error: "INVALID_PHONE", message: `${candidate.householdName} n’a pas de numéro international valide.` }, 409);
    if (candidate.recentlyReminded) return context.json({ error: "REMINDER_TOO_RECENT", message: `${candidate.householdName} a déjà reçu une préparation récente.` }, 409);
    const householdId = await householdIdFromReference(item.householdReference, context.env.QR_TOKEN_SECRET);
    if (!householdId) return context.json({ error: "INVALID_REFERENCE" }, 400);
    const phone = normalizeWhatsappPhone(candidate.phone) as string;
    const id = crypto.randomUUID();
    statements.push(context.env.DB.prepare(
      `INSERT INTO reminders
        (id, household_id, office_id, amount_cents, kind, period_label, message, recipient_phone, status, created_by, idempotency_key)
       VALUES (?, ?, (SELECT office_id FROM households WHERE id = ?), ?, ?, ?, ?, ?, 'prepared', ?, ?)`,
    ).bind(id, householdId, householdId, candidate.amountCents, candidate.kind, candidate.periodLabel,
      candidate.messagePreview, candidate.phone, office.access.profile.id, item.idempotencyKey));
    prepared.push({
      id, householdName: candidate.householdName, kind: candidate.kind, amountCents: candidate.amountCents,
      periodLabel: candidate.periodLabel, recipientPhone: candidate.phone, message: candidate.messagePreview,
      whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(candidate.messagePreview)}`,
    });
  }
  statements.push(context.env.DB.prepare(
    `INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, new_values)
     VALUES (?, ?, 'reminder.batch_prepared', 'reminder', ?)`,
  ).bind(crypto.randomUUID(), office.access.profile.id, JSON.stringify({ count: prepared.length })));
  try {
    await context.env.DB.batch(statements);
  } catch (error) {
    const keys = parsed.data.items.map((item) => item.idempotencyKey);
    const existing = await context.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM reminders WHERE idempotency_key IN (SELECT value FROM json_each(?))`,
    ).bind(JSON.stringify(keys)).first<{ count: number }>();
    if (existing?.count === keys.length) {
      return context.json({ error: "ALREADY_PREPARED", message: "Ces rappels sont déjà préparés. Consultez l’historique." }, 409);
    }
    console.error("reminder_prepare_failed", error instanceof Error ? error.message : "unknown");
    return context.json({ error: "PREPARE_FAILED", message: "Les rappels n’ont pas été préparés." }, 500);
  }
  return context.json({ prepared, duplicate: false }, 201);
}

export async function markReminderSent(context: AppContext) {
  const office = await requireOffice(context, ["treasurer", "admin"]);
  if ("error" in office) return office.error;
  const parsed = sentSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "CONFIRMATION_REQUIRED", message: "Confirmez l’envoi réel dans WhatsApp." }, 400);
  const reminder = await context.env.DB.prepare(
    `SELECT id, status FROM reminders WHERE id = ? AND (? = 1 OR office_id = ?)`,
  ).bind(context.req.param("id"), office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId)
    .first<{ id: string; status: "prepared" | "sent" }>();
  if (!reminder) return context.json({ error: "REMINDER_NOT_FOUND" }, 404);
  if (reminder.status === "sent") return context.json({ ok: true, duplicate: true, message: "Ce rappel est déjà marqué comme envoyé." });
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE reminders SET status = 'sent', sent_at = CURRENT_TIMESTAMP, sent_by = ?
        WHERE id = ? AND status = 'prepared'`,
    ).bind(office.access.profile.id, reminder.id),
    context.env.DB.prepare(
      `INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, new_values)
       VALUES (?, ?, 'reminder.marked_sent', 'reminder', ?, ?)`,
    ).bind(crypto.randomUUID(), office.access.profile.id, reminder.id, JSON.stringify({ confirmed: true })),
  ]);
  return context.json({ ok: true, duplicate: false, message: "Le rappel est marqué comme envoyé." });
}

export async function getReminderHistory(context: AppContext) {
  const office = await requireOffice(context, ["controller", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const result = await context.env.DB.prepare(
    `SELECT r.id, h.name AS householdName, r.kind, r.amount_cents AS amountCents,
            r.period_label AS periodLabel, r.recipient_phone AS recipientPhone,
            r.message, r.status, r.created_at AS createdAt, r.sent_at AS sentAt,
            COALESCE(creator.name, 'Responsable AADM') AS createdByName,
            sender.name AS sentByName
       FROM reminders r JOIN households h ON h.id = r.household_id
       LEFT JOIN profiles cp ON cp.id = r.created_by LEFT JOIN auth_user creator ON creator.id = cp.auth_user_id
       LEFT JOIN profiles sp ON sp.id = r.sent_by LEFT JOIN auth_user sender ON sender.id = sp.auth_user_id
      WHERE (? = 1 OR r.office_id = ?)
      ORDER BY r.created_at DESC LIMIT 100`,
  ).bind(office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId)
    .all<ReminderHistoryData["reminders"][number]>();
  const response: ReminderHistoryData = { reminders: result.results };
  return context.json(response);
}
