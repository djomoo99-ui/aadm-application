import type { Context } from "hono";
import { z } from "zod";

import type { AuthBindings } from "../auth";
import { todayInParis } from "../shared/date";
import type {
  OfficeDashboardData,
  OfficeHouseholdItem,
  OfficeHouseholdListData,
  OfficeMemberDetailData,
  OfficePaymentItem,
  OfficePaymentsData,
} from "../shared/office";
import type { StatusTone } from "../shared/member";
import {
  createMemberReference,
  requireOffice,
  scopeFromMemberReference,
} from "./payments";

type AppContext = Context<{ Bindings: AuthBindings }>;

type HouseholdBalanceRow = {
  householdId: string;
  householdName: string;
  phone: string | null;
  householdStatus: "active" | "inactive" | "to_verify";
  representativeMemberId: string;
  representativeName: string;
  representativeNumber: string;
  memberCount: number;
  dueNowCents: number;
  totalOutstandingCents: number;
  oldestUnpaidDueDate: string | null;
};

const listSchema = z.object({
  q: z.string().trim().max(50).default(""),
  status: z.enum(["all", "blue", "green", "orange", "red", "purple"]).default("all"),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

const reversalSchema = z.object({
  reason: z.string().trim().min(5).max(300),
  receiptConfirmation: z.string().trim().min(8).max(50),
});

function monthsBetween(olderDate: string, newerDate: string) {
  const older = Date.parse(`${olderDate}T12:00:00Z`);
  const newer = Date.parse(`${newerDate}T12:00:00Z`);
  return Math.max(0, (newer - older) / (30.4375 * 24 * 60 * 60 * 1000));
}

function householdStatus(
  dueNowCents: number,
  oldestUnpaidDueDate: string | null,
  status: HouseholdBalanceRow["householdStatus"],
  today: string,
): { label: string; tone: StatusTone } {
  if (status === "to_verify") return { label: "À vérifier", tone: "purple" };
  if (dueNowCents <= 0 || !oldestUnpaidDueDate) return { label: "À jour", tone: "blue" };
  const months = monthsBetween(oldestUnpaidDueDate, today);
  if (months >= 12) return { label: "12 mois et plus", tone: "red" };
  if (months >= 6) return { label: "6 à 11 mois", tone: "orange" };
  return { label: "Moins de 6 mois", tone: "green" };
}

async function householdRows(context: AppContext, query = "", scope?: { officeId: string; centralAccess: boolean }) {
  const today = todayInParis();
  const pattern = `%${query}%`;
  return context.env.DB.prepare(
    `SELECT h.id AS householdId, h.name AS householdName, h.phone,
            h.status AS householdStatus,
            COALESCE(
              (SELECT m.id FROM household_memberships hm
                JOIN members m ON m.id = hm.member_id
               WHERE hm.household_id = h.id AND m.status = 'active'
                 AND hm.starts_at <= ? AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
               ORDER BY CASE hm.relationship WHEN 'head' THEN 0 WHEN 'partner' THEN 1 ELSE 2 END,
                        hm.starts_at LIMIT 1), '') AS representativeMemberId,
            COALESCE(
              (SELECT m.first_name || ' ' || m.last_name FROM household_memberships hm
                JOIN members m ON m.id = hm.member_id
               WHERE hm.household_id = h.id AND m.status = 'active'
                 AND hm.starts_at <= ? AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
               ORDER BY CASE hm.relationship WHEN 'head' THEN 0 WHEN 'partner' THEN 1 ELSE 2 END,
                        hm.starts_at LIMIT 1), h.name) AS representativeName,
            COALESCE(
              (SELECT m.member_number FROM household_memberships hm
                JOIN members m ON m.id = hm.member_id
               WHERE hm.household_id = h.id AND m.status = 'active'
                 AND hm.starts_at <= ? AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
               ORDER BY CASE hm.relationship WHEN 'head' THEN 0 WHEN 'partner' THEN 1 ELSE 2 END,
                        hm.starts_at LIMIT 1), '—') AS representativeNumber,
            (SELECT COUNT(*) FROM household_memberships hm JOIN members m ON m.id = hm.member_id
              WHERE hm.household_id = h.id AND m.status = 'active'
                AND hm.starts_at <= ? AND (hm.ends_at IS NULL OR hm.ends_at >= ?)) AS memberCount,
            COALESCE(SUM(CASE WHEN d.due_date <= ? AND d.status NOT IN ('paid','exempt','to_verify')
              THEN MAX(d.expected_amount_cents - d.paid_amount_cents, 0) ELSE 0 END), 0) AS dueNowCents,
            COALESCE(SUM(CASE WHEN d.status NOT IN ('paid','exempt','to_verify')
              THEN MAX(d.expected_amount_cents - d.paid_amount_cents, 0) ELSE 0 END), 0) AS totalOutstandingCents,
            MIN(CASE WHEN d.due_date <= ? AND d.status NOT IN ('paid','exempt','to_verify')
                      AND d.paid_amount_cents < d.expected_amount_cents THEN d.due_date END) AS oldestUnpaidDueDate
       FROM households h
       LEFT JOIN contribution_dues d ON d.household_id = h.id AND (? = 1 OR d.office_id = ?)
      WHERE h.status IN ('active','to_verify')
        AND (? = 1 OR h.office_id = ?)
        AND (? = '' OR h.name LIKE ? COLLATE NOCASE OR COALESCE(h.phone, '') LIKE ?
          OR EXISTS (
            SELECT 1 FROM household_memberships hms JOIN members ms ON ms.id = hms.member_id
             WHERE hms.household_id = h.id
               AND (ms.first_name || ' ' || ms.last_name LIKE ? COLLATE NOCASE
                 OR ms.last_name || ' ' || ms.first_name LIKE ? COLLATE NOCASE
                 OR ms.member_number LIKE ? COLLATE NOCASE OR COALESCE(ms.phone, '') LIKE ?)
          ))
      GROUP BY h.id
      ORDER BY CASE WHEN oldestUnpaidDueDate IS NULL THEN 1 ELSE 0 END,
               oldestUnpaidDueDate ASC, h.name COLLATE NOCASE ASC`,
  )
    .bind(today, today, today, today, today, today, today, today, today, today,
      scope?.centralAccess || !scope ? 1 : 0, scope?.officeId ?? "",
      scope?.centralAccess || !scope ? 1 : 0, scope?.officeId ?? "", query, pattern, pattern, pattern, pattern, pattern, pattern)
    .all<HouseholdBalanceRow>();
}

async function paymentRows(context: AppContext, householdId?: string, limit = 100, scope?: { officeId: string; centralAccess: boolean }) {
  const where = householdId ? "WHERE p.household_id = ? AND (? = 1 OR p.office_id = ?)" : "WHERE (? = 1 OR p.office_id = ?)";
  const statement = context.env.DB.prepare(
    `SELECT p.id, p.receipt_number AS receiptNumber, h.name AS householdName,
            COALESCE(m.first_name || ' ' || m.last_name, 'Membre') AS memberName,
            COALESCE(m.member_number, '—') AS memberNumber,
            p.amount_cents AS amountCents, p.unallocated_amount_cents AS unallocatedAmountCents,
            p.payment_date AS paymentDate, p.status, p.note, p.created_at AS createdAt,
            COALESCE(recorder.name, 'Responsable AADM') AS recordedByName,
            pr.reason AS reversalReason, pr.reversed_at AS reversedAt,
            COALESCE(reverser.name, 'Responsable AADM') AS reversedByName
       FROM payments p
       JOIN households h ON h.id = p.household_id
       LEFT JOIN members m ON m.id = p.member_id
       LEFT JOIN profiles recorder_profile ON recorder_profile.id = p.recorded_by
       LEFT JOIN auth_user recorder ON recorder.id = recorder_profile.auth_user_id
       LEFT JOIN payment_reversals pr ON pr.payment_id = p.id
       LEFT JOIN profiles reverser_profile ON reverser_profile.id = pr.reversed_by
       LEFT JOIN auth_user reverser ON reverser.id = reverser_profile.auth_user_id
       ${where}
      ORDER BY p.payment_date DESC, p.created_at DESC LIMIT ?`,
  );
  const result = householdId
    ? await statement.bind(householdId, scope?.centralAccess || !scope ? 1 : 0, scope?.officeId ?? "", limit).all<{
      id: string; receiptNumber: string; householdName: string; memberName: string;
      memberNumber: string; amountCents: number; unallocatedAmountCents: number;
      paymentDate: string; status: "posted" | "reversed"; note: string | null;
      createdAt: string; recordedByName: string; reversalReason: string | null;
      reversedAt: string | null; reversedByName: string;
    }>()
    : await statement.bind(scope?.centralAccess || !scope ? 1 : 0, scope?.officeId ?? "", limit).all<{
      id: string; receiptNumber: string; householdName: string; memberName: string;
      memberNumber: string; amountCents: number; unallocatedAmountCents: number;
      paymentDate: string; status: "posted" | "reversed"; note: string | null;
      createdAt: string; recordedByName: string; reversalReason: string | null;
      reversedAt: string | null; reversedByName: string;
    }>();
  return result.results.map((row): OfficePaymentItem => ({
    id: row.id,
    receiptNumber: row.receiptNumber,
    householdName: row.householdName,
    memberName: row.memberName,
    memberNumber: row.memberNumber,
    amountCents: row.amountCents,
    unallocatedAmountCents: row.unallocatedAmountCents,
    paymentDate: row.paymentDate,
    status: row.status,
    note: row.note,
    recordedByName: row.recordedByName,
    createdAt: row.createdAt,
    reversal: row.reversalReason && row.reversedAt
      ? { reason: row.reversalReason, reversedAt: row.reversedAt, reversedByName: row.reversedByName }
      : null,
  }));
}

export async function getOfficeDashboard(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "controller", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const today = todayInParis();
  const [rows, memberCount, collected, pending, recentPayments, alerts, lastAlertScan] = await Promise.all([
    householdRows(context, "", office.access.profile),
    context.env.DB.prepare("SELECT COUNT(DISTINCT m.id) AS count FROM members m JOIN household_memberships hm ON hm.member_id = m.id JOIN households h ON h.id = hm.household_id WHERE m.status = 'active' AND (? = 1 OR h.office_id = ?)").bind(office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).first<{ count: number }>(),
    context.env.DB.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM payments WHERE status = 'posted' AND (? = 1 OR office_id = ?)").bind(office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).first<{ cents: number }>(),
    context.env.DB.prepare("SELECT COUNT(*) AS count FROM access_requests ar LEFT JOIN members m ON m.member_number = ar.member_number LEFT JOIN household_memberships hm ON hm.member_id = m.id AND hm.ends_at IS NULL LEFT JOIN households h ON h.id = hm.household_id WHERE ar.status = 'pending' AND (? = 1 OR h.office_id = ?)").bind(office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).first<{ count: number }>(),
    paymentRows(context, undefined, 5, office.access.profile),
    context.env.DB.prepare("SELECT COUNT(*) AS openAlerts, SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS criticalAlerts FROM office_alerts WHERE status <> 'resolved' AND (? = 1 OR office_id = ?)").bind(office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).first<{ openAlerts: number; criticalAlerts: number | null }>(),
    context.env.DB.prepare("SELECT created_at AS createdAt FROM alert_scan_runs ORDER BY created_at DESC, id DESC LIMIT 1").first<{ createdAt: string }>(),
  ]);
  const statusDefinitions = [
    { label: "À jour", tone: "blue" as const },
    { label: "Moins de 6 mois", tone: "green" as const },
    { label: "6 à 11 mois", tone: "orange" as const },
    { label: "12 mois et plus", tone: "red" as const },
    { label: "À vérifier", tone: "purple" as const },
  ];
  const classified = rows.results.map((row) => householdStatus(
    row.dueNowCents, row.oldestUnpaidDueDate, row.householdStatus, today,
  ));
  const response: OfficeDashboardData = {
    members: memberCount?.count ?? 0,
    households: rows.results.length,
    collectedCents: collected?.cents ?? 0,
    dueNowCents: rows.results.reduce((sum, row) => sum + row.dueNowCents, 0),
    pendingAccessRequests: pending?.count ?? 0,
    openAlerts: alerts?.openAlerts ?? 0,
    criticalAlerts: alerts?.criticalAlerts ?? 0,
    lastAlertScanAt: lastAlertScan?.createdAt ?? null,
    statuses: statusDefinitions.map((definition) => ({
      ...definition,
      count: classified.filter((item) => item.tone === definition.tone).length,
    })),
    recentPayments,
  };
  return context.json(response);
}

export async function listOfficeHouseholds(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "controller", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const parsed = listSchema.safeParse(context.req.query());
  if (!parsed.success || (parsed.data.q && !/^[\p{L}\p{N} +'’.\-]+$/u.test(parsed.data.q))) {
    return context.json({ error: "INVALID_FILTER", message: "La recherche n’est pas valide." }, 400);
  }
  const today = todayInParis();
  const rows = await householdRows(context, parsed.data.q, office.access.profile);
  const allItems = await Promise.all(rows.results.map(async (row): Promise<OfficeHouseholdItem | null> => {
    if (!row.representativeMemberId) return null;
    const presentation = householdStatus(row.dueNowCents, row.oldestUnpaidDueDate, row.householdStatus, today);
    return {
      memberReference: await createMemberReference(row.representativeMemberId, context.env.QR_TOKEN_SECRET),
      householdName: row.householdName,
      phone: row.phone,
      representativeName: row.representativeName,
      representativeNumber: row.representativeNumber,
      memberCount: row.memberCount,
      dueNowCents: row.dueNowCents,
      totalOutstandingCents: row.totalOutstandingCents,
      oldestUnpaidDueDate: row.oldestUnpaidDueDate,
      statusLabel: presentation.label,
      statusTone: presentation.tone,
    };
  }));
  const filtered = allItems.filter((item): item is OfficeHouseholdItem =>
    item !== null && (parsed.data.status === "all" || item.statusTone === parsed.data.status));
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(parsed.data.page, pageCount);
  const response: OfficeHouseholdListData = {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageCount,
  };
  return context.json(response);
}

export async function getOfficeMemberDetail(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "controller", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const reference = (context.req.query("ref") ?? "").trim();
  if (reference.length < 20 || reference.length > 300) {
    return context.json({ error: "INVALID_REFERENCE", message: "Référence membre invalide." }, 400);
  }
  const scope = await scopeFromMemberReference(context, reference, office.access);
  if (!scope) return context.json({ error: "MEMBER_NOT_FOUND", message: "Membre introuvable." }, 404);
  const today = todayInParis();
  const [household, members, contributions, payments] = await Promise.all([
    context.env.DB.prepare(
      `SELECT h.name, h.phone, h.status,
              COALESCE(SUM(CASE WHEN d.due_date <= ? AND d.status NOT IN ('paid','exempt','to_verify')
                THEN MAX(d.expected_amount_cents - d.paid_amount_cents, 0) ELSE 0 END), 0) AS dueNowCents,
              COALESCE(SUM(CASE WHEN d.status NOT IN ('paid','exempt','to_verify')
                THEN MAX(d.expected_amount_cents - d.paid_amount_cents, 0) ELSE 0 END), 0) AS totalOutstandingCents,
              MIN(CASE WHEN d.due_date <= ? AND d.status NOT IN ('paid','exempt','to_verify')
                        AND d.paid_amount_cents < d.expected_amount_cents THEN d.due_date END) AS oldestUnpaidDueDate
         FROM households h LEFT JOIN contribution_dues d ON d.household_id = h.id AND (? = 1 OR d.office_id = ?)
        WHERE h.id = ? GROUP BY h.id`,
    ).bind(today, today, office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId, scope.householdId).first<{
      name: string; phone: string | null; status: HouseholdBalanceRow["householdStatus"];
      dueNowCents: number; totalOutstandingCents: number; oldestUnpaidDueDate: string | null;
    }>(),
    context.env.DB.prepare(
      `SELECT m.id, m.first_name || ' ' || m.last_name AS fullName, m.member_number AS memberNumber,
              hm.relationship, m.birth_date AS birthDate, m.phone
         FROM household_memberships hm JOIN members m ON m.id = hm.member_id
        WHERE hm.household_id = ? AND hm.starts_at <= ?
          AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
        ORDER BY CASE hm.relationship WHEN 'head' THEN 0 WHEN 'partner' THEN 1 ELSE 2 END,
                 m.birth_date ASC`,
    ).bind(scope.householdId, today, today).all<{
      id: string; fullName: string; memberNumber: string; relationship: "head" | "partner" | "child";
      birthDate: string | null; phone: string | null;
    }>(),
    context.env.DB.prepare(
      `SELECT id, due_date AS dueDate, expected_amount_cents AS expectedAmountCents,
              paid_amount_cents AS paidAmountCents, status, source
         FROM contribution_dues WHERE household_id = ? AND due_date >= '2021-01-01'
           AND (? = 1 OR office_id = ?)
        ORDER BY due_date DESC`,
    ).bind(scope.householdId, office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).all<OfficeMemberDetailData["contributions"][number]>(),
    paymentRows(context, scope.householdId, 100, office.access.profile),
  ]);
  if (!household) return context.json({ error: "HOUSEHOLD_NOT_FOUND" }, 404);
  const presentation = householdStatus(
    household.dueNowCents, household.oldestUnpaidDueDate, household.status, today,
  );
  const response: OfficeMemberDetailData = {
    household: {
      name: household.name,
      phone: household.phone,
      dueNowCents: household.dueNowCents,
      totalOutstandingCents: household.totalOutstandingCents,
      statusLabel: presentation.label,
      statusTone: presentation.tone,
    },
    members: members.results,
    contributions: contributions.results,
    payments,
  };
  return context.json(response);
}

export async function listOfficePayments(context: AppContext) {
  const office = await requireOffice(context, ["controller", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const response: OfficePaymentsData = { payments: await paymentRows(context, undefined, 100, office.access.profile) };
  return context.json(response);
}

export async function reverseOfficePayment(context: AppContext) {
  const office = await requireOffice(context, ["treasurer", "admin"]);
  if ("error" in office) return office.error;
  const parsed = reversalSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    return context.json({ error: "INVALID_REVERSAL", message: "La raison ou la confirmation est invalide." }, 400);
  }
  const payment = await context.env.DB.prepare(
    "SELECT id, receipt_number AS receiptNumber, status, amount_cents AS amountCents FROM payments WHERE id = ? AND (? = 1 OR office_id = ?)",
  ).bind(context.req.param("id"), office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).first<{
    id: string; receiptNumber: string; status: "posted" | "reversed"; amountCents: number;
  }>();
  if (!payment) return context.json({ error: "PAYMENT_NOT_FOUND", message: "Paiement introuvable." }, 404);
  if (payment.receiptNumber !== parsed.data.receiptConfirmation) {
    return context.json({ error: "RECEIPT_MISMATCH", message: "Le numéro du reçu ne correspond pas." }, 400);
  }
  if (payment.status === "reversed") {
    return context.json({ error: "ALREADY_REVERSED", message: "Ce paiement est déjà annulé." }, 409);
  }
  const today = todayInParis();
  const reversalId = crypto.randomUUID();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO payment_reversals (id, payment_id, reason, reversed_by)
         SELECT ?, id, ?, ? FROM payments WHERE id = ? AND status = 'posted'`,
      ).bind(reversalId, parsed.data.reason, office.access.profile.id, payment.id),
      context.env.DB.prepare(
        `UPDATE contribution_dues
            SET paid_amount_cents = MAX(paid_amount_cents - COALESCE(
                  (SELECT amount_cents FROM payment_allocations
                    WHERE payment_id = ? AND contribution_due_id = contribution_dues.id), 0), 0),
                status = CASE
                  WHEN status IN ('exempt','to_verify') THEN status
                  WHEN MAX(paid_amount_cents - COALESCE(
                    (SELECT amount_cents FROM payment_allocations
                      WHERE payment_id = ? AND contribution_due_id = contribution_dues.id), 0), 0) >= expected_amount_cents THEN 'paid'
                  WHEN MAX(paid_amount_cents - COALESCE(
                    (SELECT amount_cents FROM payment_allocations
                      WHERE payment_id = ? AND contribution_due_id = contribution_dues.id), 0), 0) > 0 THEN 'partial'
                  WHEN due_date < ? THEN 'overdue'
                  ELSE 'upcoming' END,
                updated_at = CURRENT_TIMESTAMP
          WHERE EXISTS (SELECT 1 FROM payment_reversals WHERE id = ?)
            AND id IN (SELECT contribution_due_id FROM payment_allocations WHERE payment_id = ?)`,
      ).bind(payment.id, payment.id, payment.id, today, reversalId, payment.id),
      context.env.DB.prepare(
        `UPDATE payments SET status = 'reversed'
          WHERE id = ? AND EXISTS (SELECT 1 FROM payment_reversals WHERE id = ?)`,
      ).bind(payment.id, reversalId),
      context.env.DB.prepare(
        `INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, old_values, new_values)
         SELECT ?, ?, 'payment.reversed', 'payment', ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM payment_reversals WHERE id = ?)`,
      ).bind(crypto.randomUUID(), office.access.profile.id, payment.id,
        JSON.stringify({ status: "posted", amountCents: payment.amountCents }),
        JSON.stringify({ status: "reversed", reason: parsed.data.reason }), reversalId),
    ]);
  } catch (error) {
    console.error("payment_reversal_failed", error instanceof Error ? error.message : "unknown");
    const current = await context.env.DB.prepare("SELECT status FROM payments WHERE id = ?")
      .bind(payment.id).first<{ status: string }>();
    if (current?.status === "reversed") {
      return context.json({ error: "ALREADY_REVERSED", message: "Ce paiement est déjà annulé." }, 409);
    }
    return context.json({ error: "REVERSAL_FAILED", message: "L’annulation n’a pas été enregistrée." }, 500);
  }
  return context.json({ ok: true, message: "Le paiement a été annulé et les cotisations ont été recalculées." });
}
