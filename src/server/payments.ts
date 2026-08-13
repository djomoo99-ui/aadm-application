import type { Context } from "hono";
import { z } from "zod";

import { getAccessContext, hasAnyRole, type RoleCode } from "../access";
import type { AuthBindings } from "../auth";
import { hmacSha256, sha256 } from "../security";
import type { CashPaymentReceipt, OfficeMemberSearchResult, OfficeMemberSummary } from "../shared/payments";
import { todayInParis } from "../shared/date";

type AppContext = Context<{ Bindings: AuthBindings }>;

const qrSchema = z.object({ qrToken: z.string().trim().min(20).max(300) });
const paymentSchema = z.object({
  source: z.union([
    z.object({ qrToken: z.string().trim().min(20).max(300) }),
    z.object({ memberReference: z.string().trim().min(20).max(300) }),
  ]),
  amountCents: z.number().int().min(1).max(1_000_000),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().uuid(),
  note: z.string().trim().max(300).optional().default(""),
});

export type MemberScope = {
  memberId: string;
  firstName: string;
  lastName: string;
  memberNumber: string;
  householdId: string;
  householdName: string;
  householdOfficeId: string;
};

export async function requireOffice(context: AppContext, roles: RoleCode[]) {
  const access = await getAccessContext(context);
  if (!access) return { error: context.json({ error: "UNAUTHENTICATED" }, 401) };
  if (access.profile.status !== "active" || !hasAnyRole(access, roles)) {
    return { error: context.json({ error: "FORBIDDEN", message: "Accès non autorisé." }, 403) };
  }
  return { access };
}

function normalizeQrToken(value: string) {
  return value.trim().replace(/^AADM:/i, "");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function scopeFromMemberId(context: AppContext, memberId: string, access?: { profile: { officeId: string; centralAccess: boolean } }) {
  const today = todayInParis();
  return context.env.DB.prepare(
    `SELECT m.id AS memberId, m.first_name AS firstName, m.last_name AS lastName,
            m.member_number AS memberNumber, h.id AS householdId, h.name AS householdName, h.office_id AS householdOfficeId
       FROM members m
       JOIN household_memberships hm ON hm.member_id = m.id
       JOIN households h ON h.id = hm.household_id
      WHERE m.id = ? AND m.status = 'active' AND h.status = 'active'
        AND (? = 1 OR h.office_id = ?)
        AND hm.starts_at <= ? AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
      ORDER BY hm.starts_at DESC LIMIT 1`,
  )
    .bind(memberId, access?.profile.centralAccess || !access ? 1 : 0, access?.profile.officeId ?? "", today, today)
    .first<MemberScope>();
}

async function scopeFromQr(context: AppContext, rawToken: string, access?: { profile: { officeId: string; centralAccess: boolean } }) {
  const qrToken = normalizeQrToken(rawToken);
  if (!/^[0-9a-f-]{36}\.[0-9a-f]{64}$/i.test(qrToken)) return null;
  const tokenHash = await sha256(qrToken);
  const qr = await context.env.DB.prepare(
    `SELECT member_id AS memberId FROM member_qr_codes
      WHERE token_hash = ? AND status = 'active'`,
  )
    .bind(tokenHash)
    .first<{ memberId: string }>();
  return qr ? scopeFromMemberId(context, qr.memberId, access) : null;
}

export async function createMemberReference(memberId: string, secret: string) {
  return `${memberId}.${await hmacSha256(`member:${memberId}`, secret)}`;
}

export async function scopeFromMemberReference(context: AppContext, reference: string, access?: { profile: { officeId: string; centralAccess: boolean } }) {
  const separator = reference.lastIndexOf(".");
  if (separator <= 0) return null;
  const memberId = reference.slice(0, separator);
  const suppliedSignature = reference.slice(separator + 1);
  const expectedSignature = await hmacSha256(`member:${memberId}`, context.env.QR_TOKEN_SECRET);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;
  return scopeFromMemberId(context, memberId, access);
}

async function getBalances(context: AppContext, householdId: string, officeId: string) {
  const today = todayInParis();
  return context.env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN due_date <= ? AND status NOT IN ('paid','exempt','to_verify')
         THEN MAX(expected_amount_cents - paid_amount_cents, 0) ELSE 0 END), 0) AS dueNowCents,
       COALESCE(SUM(CASE WHEN status NOT IN ('paid','exempt','to_verify')
         THEN MAX(expected_amount_cents - paid_amount_cents, 0) ELSE 0 END), 0) AS totalOutstandingCents
     FROM contribution_dues WHERE household_id = ? AND office_id = ?`,
  )
    .bind(today, householdId, officeId)
    .first<{ dueNowCents: number; totalOutstandingCents: number }>();
}

async function memberSummary(context: AppContext, scope: MemberScope, source: OfficeMemberSummary["source"]) {
  const balances = await getBalances(context, scope.householdId, scope.householdOfficeId);
  const data: OfficeMemberSummary = {
    member: { fullName: `${scope.firstName} ${scope.lastName}`, memberNumber: scope.memberNumber },
    household: {
      name: scope.householdName,
      dueNowCents: balances?.dueNowCents ?? 0,
      totalOutstandingCents: balances?.totalOutstandingCents ?? 0,
    },
    source,
  };
  return data;
}

export async function scanMemberQr(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const parsed = qrSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "INVALID_QR", message: "QR non valide." }, 400);

  const scope = await scopeFromQr(context, parsed.data.qrToken, office.access);
  if (!scope) return context.json({ error: "QR_NOT_FOUND", message: "QR inconnu, révoqué ou expiré." }, 404);
  return context.json(await memberSummary(context, scope, { qrToken: parsed.data.qrToken }));
}

export async function searchOfficeMembers(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const query = (context.req.query("q") ?? "").trim();
  if (query.length < 2 || query.length > 50 || !/^[\p{L}\p{N} +'’.\-]+$/u.test(query)) {
    return context.json({ results: [] as OfficeMemberSearchResult[] });
  }

  const today = todayInParis();
  const pattern = `%${query}%`;
  const rows = await context.env.DB.prepare(
    `SELECT m.id AS memberId, m.first_name AS firstName, m.last_name AS lastName,
            m.member_number AS memberNumber, h.id AS householdId, h.name AS householdName,
            COALESCE(SUM(CASE WHEN d.due_date <= ? AND d.status NOT IN ('paid','exempt','to_verify')
              THEN MAX(d.expected_amount_cents - d.paid_amount_cents, 0) ELSE 0 END), 0) AS dueNowCents,
            COALESCE(SUM(CASE WHEN d.status NOT IN ('paid','exempt','to_verify')
              THEN MAX(d.expected_amount_cents - d.paid_amount_cents, 0) ELSE 0 END), 0) AS totalOutstandingCents
       FROM members m
       JOIN household_memberships hm ON hm.member_id = m.id
       JOIN households h ON h.id = hm.household_id
       LEFT JOIN contribution_dues d ON d.household_id = h.id AND d.office_id = h.office_id
      WHERE m.status = 'active' AND h.status = 'active'
        AND (? = 1 OR h.office_id = ?)
        AND hm.starts_at <= ? AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
        AND (m.first_name || ' ' || m.last_name LIKE ? COLLATE NOCASE
          OR m.last_name || ' ' || m.first_name LIKE ? COLLATE NOCASE
          OR m.member_number LIKE ? COLLATE NOCASE OR COALESCE(m.phone, '') LIKE ?)
      GROUP BY m.id, h.id
      ORDER BY m.last_name, m.first_name LIMIT 10`,
  )
    .bind(today, office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId, today, today, pattern, pattern, pattern, pattern)
    .all<{
      memberId: string;
      firstName: string;
      lastName: string;
      memberNumber: string;
      householdId: string;
      householdName: string;
      dueNowCents: number;
      totalOutstandingCents: number;
    }>();

  const results: OfficeMemberSearchResult[] = await Promise.all(
    rows.results.map(async (row) => ({
      memberReference: await createMemberReference(row.memberId, context.env.QR_TOKEN_SECRET),
      fullName: `${row.firstName} ${row.lastName}`,
      memberNumber: row.memberNumber,
      householdName: row.householdName,
      dueNowCents: row.dueNowCents,
      totalOutstandingCents: row.totalOutstandingCents,
    })),
  );
  return context.json({ results });
}

async function existingReceipt(context: AppContext, idempotencyKey: string, profileId: string) {
  const payment = await context.env.DB.prepare(
    `SELECT p.id, p.receipt_number AS receiptNumber, p.amount_cents AS amountCents,
            p.unallocated_amount_cents AS unallocatedAmountCents, p.payment_date AS paymentDate,
            m.first_name AS firstName, m.last_name AS lastName, m.member_number AS memberNumber,
            h.name AS householdName
       FROM payments p
       LEFT JOIN members m ON m.id = p.member_id
       JOIN households h ON h.id = p.household_id
      WHERE p.idempotency_key = ? AND p.recorded_by = ?`,
  )
    .bind(idempotencyKey, profileId)
    .first<{
      id: string;
      receiptNumber: string;
      amountCents: number;
      unallocatedAmountCents: number;
      paymentDate: string;
      firstName: string | null;
      lastName: string | null;
      memberNumber: string | null;
      householdName: string;
    }>();
  if (!payment) return null;
  const allocations = await context.env.DB.prepare(
    `SELECT d.due_date AS dueDate, pa.amount_cents AS amountCents
       FROM payment_allocations pa JOIN contribution_dues d ON d.id = pa.contribution_due_id
      WHERE pa.payment_id = ? ORDER BY d.due_date`,
  )
    .bind(payment.id)
    .all<{ dueDate: string; amountCents: number }>();
  const receipt: CashPaymentReceipt = {
    duplicate: true,
    receiptNumber: payment.receiptNumber,
    amountCents: payment.amountCents,
    allocatedAmountCents: payment.amountCents - payment.unallocatedAmountCents,
    unallocatedAmountCents: payment.unallocatedAmountCents,
    paymentDate: payment.paymentDate,
    member: {
      fullName: `${payment.firstName ?? "Membre"} ${payment.lastName ?? ""}`.trim(),
      memberNumber: payment.memberNumber ?? "—",
    },
    householdName: payment.householdName,
    allocations: allocations.results,
  };
  return receipt;
}

export async function recordCashPayment(context: AppContext) {
  const office = await requireOffice(context, ["treasurer", "admin"]);
  if ("error" in office) return office.error;
  const parsed = paymentSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) {
    return context.json({ error: "INVALID_PAYMENT", message: "Les informations du paiement sont invalides." }, 400);
  }
  const today = todayInParis();
  if (parsed.data.paymentDate < "2021-01-01" || parsed.data.paymentDate > today) {
    return context.json({ error: "INVALID_DATE", message: "La date du paiement n’est pas autorisée." }, 400);
  }

  const duplicate = await existingReceipt(context, parsed.data.idempotencyKey, office.access.profile.id);
  if (duplicate) return context.json(duplicate);

  const scope = "qrToken" in parsed.data.source
    ? await scopeFromQr(context, parsed.data.source.qrToken, office.access)
    : await scopeFromMemberReference(context, parsed.data.source.memberReference, office.access);
  if (!scope) return context.json({ error: "MEMBER_NOT_FOUND", message: "Membre introuvable ou référence expirée." }, 404);

  const paymentOfficeId = office.access.profile.centralAccess
    ? (await context.env.DB.prepare("SELECT office_id AS officeId FROM households WHERE id = ?").bind(scope.householdId).first<{ officeId: string }>())?.officeId ?? office.access.profile.officeId
    : office.access.profile.officeId;

  const dues = await context.env.DB.prepare(
    `SELECT id, due_date AS dueDate, contribution_kind AS contributionKind,
            expected_amount_cents AS expectedAmountCents, paid_amount_cents AS paidAmountCents
       FROM contribution_dues
      WHERE household_id = ? AND office_id = ? AND status NOT IN ('paid','exempt','to_verify')
        AND paid_amount_cents < expected_amount_cents
      ORDER BY due_date ASC,
        CASE contribution_kind WHEN 'annual_repatriation' THEN 0 WHEN 'quarterly_working_man' THEN 1 ELSE 2 END,
        id ASC`,
  )
    .bind(scope.householdId, paymentOfficeId)
    .all<{ id: string; dueDate: string; contributionKind: string; expectedAmountCents: number; paidAmountCents: number }>();

  let amountStillAvailable = parsed.data.amountCents;
  for (const due of dues.results) {
    if (amountStillAvailable <= 0) break;
    const dueRemaining = Math.max(due.expectedAmountCents - due.paidAmountCents, 0);
    const proposedAllocation = Math.min(dueRemaining, amountStillAvailable);
    if (due.contributionKind === "annual_repatriation" && proposedAllocation > 0 && proposedAllocation < dueRemaining) {
      return context.json({
        error: "ANNUAL_REPATRIATION_REQUIRES_FULL_PAYMENT",
        message: `La cotisation annuelle de rapatriement doit être réglée en un seul paiement. Montant nécessaire : ${(dueRemaining / 100).toFixed(2).replace(".", ",")} €.` ,
        requiredAmountCents: dueRemaining,
      }, 409);
    }
    amountStillAvailable -= proposedAllocation;
  }

  const paymentId = crypto.randomUUID();
  const receiptNumber = `AADM-${today.slice(0, 4)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare(
      `INSERT INTO payments
        (id, receipt_number, household_id, office_id, member_id, amount_cents, unallocated_amount_cents,
         payment_date, method, status, recorded_by, idempotency_key, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cash', 'posted', ?, ?, ?)`,
    ).bind(paymentId, receiptNumber, scope.householdId, paymentOfficeId, scope.memberId, parsed.data.amountCents,
      parsed.data.amountCents, parsed.data.paymentDate, office.access.profile.id,
      parsed.data.idempotencyKey, parsed.data.note || null),
  ];

  for (const due of dues.results) {
    const allocationId = crypto.randomUUID();
    statements.push(
      context.env.DB.prepare(
        `INSERT INTO payment_allocations (id, payment_id, contribution_due_id, amount_cents)
         SELECT ?, ?, ?, MIN(
           MAX((SELECT expected_amount_cents - paid_amount_cents FROM contribution_dues WHERE id = ?), 0),
           MAX(? - COALESCE((SELECT SUM(amount_cents) FROM payment_allocations WHERE payment_id = ?), 0), 0)
         )
         WHERE (SELECT expected_amount_cents - paid_amount_cents FROM contribution_dues WHERE id = ?) > 0
           AND ? > COALESCE((SELECT SUM(amount_cents) FROM payment_allocations WHERE payment_id = ?), 0)`,
      ).bind(allocationId, paymentId, due.id, due.id, parsed.data.amountCents, paymentId,
        due.id, parsed.data.amountCents, paymentId),
      context.env.DB.prepare(
        `UPDATE contribution_dues
            SET paid_amount_cents = paid_amount_cents + COALESCE(
                  (SELECT amount_cents FROM payment_allocations WHERE id = ?), 0),
                status = CASE
                  WHEN paid_amount_cents + COALESCE((SELECT amount_cents FROM payment_allocations WHERE id = ?), 0) >= expected_amount_cents THEN 'paid'
                  WHEN paid_amount_cents + COALESCE((SELECT amount_cents FROM payment_allocations WHERE id = ?), 0) > 0 THEN 'partial'
                  WHEN due_date < ? THEN 'overdue'
                  ELSE status END,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND EXISTS (SELECT 1 FROM payment_allocations WHERE id = ?)`,
      ).bind(allocationId, allocationId, allocationId, today, due.id, allocationId),
    );
  }

  statements.push(
    context.env.DB.prepare(
      `UPDATE payments SET unallocated_amount_cents = amount_cents - COALESCE(
        (SELECT SUM(amount_cents) FROM payment_allocations WHERE payment_id = ?), 0)
       WHERE id = ?`,
    ).bind(paymentId, paymentId),
    context.env.DB.prepare(
      `INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, new_values)
       VALUES (?, ?, 'payment.cash_recorded', 'payment', ?, ?)`,
    ).bind(crypto.randomUUID(), office.access.profile.id, paymentId,
      JSON.stringify({ receiptNumber, amountCents: parsed.data.amountCents, method: "cash" })),
  );

  try {
    await context.env.DB.batch(statements);
  } catch (error) {
    const concurrentDuplicate = await existingReceipt(context, parsed.data.idempotencyKey, office.access.profile.id);
    if (concurrentDuplicate) return context.json(concurrentDuplicate);
    console.error("cash_payment_failed", error instanceof Error ? error.message : "unknown");
    return context.json({ error: "PAYMENT_FAILED", message: "Le paiement n’a pas été enregistré." }, 500);
  }

  const receipt = await existingReceipt(context, parsed.data.idempotencyKey, office.access.profile.id);
  if (!receipt) return context.json({ error: "RECEIPT_NOT_FOUND" }, 500);
  return context.json({ ...receipt, duplicate: false }, 201);
}
