import type { Context } from "hono";

import { getAccessContext } from "../access";
import type { AuthBindings } from "../auth";
import { hmacSha256, sha256 } from "../security";
import type {
  ContributionItem,
  MemberContributionsData,
  MemberDashboardData,
  MemberProfileData,
  MemberQrData,
  StatusTone,
} from "../shared/member";
import { todayInParis } from "../shared/date";

type AppContext = Context<{ Bindings: AuthBindings }>;

type HouseholdScope = {
  access: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>;
  household: { id: string; name: string };
};

async function getHouseholdScope(context: AppContext) {
  const access = await getAccessContext(context);
  if (!access) return { error: context.json({ error: "UNAUTHENTICATED" }, 401) };
  if (access.profile.status !== "active" || !access.profile.memberId) {
    return { error: context.json({ error: "ACCOUNT_NOT_ACTIVE" }, 403) };
  }

  const today = todayInParis();
  const household = await context.env.DB.prepare(
    `SELECT h.id, h.name
       FROM household_memberships hm
       JOIN households h ON h.id = hm.household_id
      WHERE hm.member_id = ?
        AND hm.starts_at <= ?
        AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
      ORDER BY hm.starts_at DESC
      LIMIT 1`,
  )
    .bind(access.profile.memberId, today, today)
    .first<{ id: string; name: string }>();

  if (!household) {
    return {
      error: context.json(
        { error: "HOUSEHOLD_NOT_LINKED", message: "Aucun foyer actif n’est rattaché à ce compte." },
        409,
      ),
    };
  }

  return { access, household } satisfies HouseholdScope;
}

function statusFromOldestDue(oldestDueDate: string | null, hasDues: boolean, toVerify: boolean) {
  if (toVerify || !hasDues) {
    return { statusLabel: "Situation à vérifier", statusTone: "purple" as StatusTone };
  }
  if (!oldestDueDate) {
    return { statusLabel: "À jour", statusTone: "blue" as StatusTone };
  }

  const today = new Date();
  const dueDate = new Date(`${oldestDueDate}T00:00:00Z`);
  const sixMonthsLater = new Date(dueDate);
  sixMonthsLater.setUTCMonth(sixMonthsLater.getUTCMonth() + 6);
  const twelveMonthsLater = new Date(dueDate);
  twelveMonthsLater.setUTCMonth(twelveMonthsLater.getUTCMonth() + 12);

  if (today < sixMonthsLater) {
    return { statusLabel: "Retard inférieur à 6 mois", statusTone: "green" as StatusTone };
  }
  if (today < twelveMonthsLater) {
    return { statusLabel: "Retard de 6 à 11 mois", statusTone: "orange" as StatusTone };
  }
  return { statusLabel: "Retard de 12 mois ou plus", statusTone: "red" as StatusTone };
}

export async function getMemberDashboard(context: AppContext) {
  const scope = await getHouseholdScope(context);
  if ("error" in scope) return scope.error;

  const today = todayInParis();
  const year = today.slice(0, 4);

  const [member, memberCount, totals, oldest, verification, nextDue, latestPayment, dueCount] =
    await Promise.all([
      context.env.DB.prepare(
        `SELECT first_name AS firstName, last_name AS lastName, member_number AS memberNumber
           FROM members WHERE id = ?`,
      )
        .bind(scope.access.profile.memberId)
        .first<{ firstName: string; lastName: string; memberNumber: string }>(),
      context.env.DB.prepare(
        `SELECT COUNT(*) AS count
           FROM household_memberships
          WHERE household_id = ? AND starts_at <= ?
            AND (ends_at IS NULL OR ends_at >= ?)`,
      )
        .bind(scope.household.id, today, today)
        .first<{ count: number }>(),
      context.env.DB.prepare(
        `SELECT
            COALESCE(SUM(CASE WHEN due_date <= ? AND status NOT IN ('paid', 'exempt')
              THEN MAX(expected_amount_cents - paid_amount_cents, 0) ELSE 0 END), 0) AS dueNowCents,
            COALESCE(SUM(CASE WHEN substr(due_date, 1, 4) = ? THEN expected_amount_cents ELSE 0 END), 0) AS annualExpectedCents,
            COALESCE(SUM(CASE WHEN substr(due_date, 1, 4) = ? THEN paid_amount_cents ELSE 0 END), 0) AS annualPaidCents
           FROM contribution_dues WHERE household_id = ?`,
      )
        .bind(today, year, year, scope.household.id)
        .first<{ dueNowCents: number; annualExpectedCents: number; annualPaidCents: number }>(),
      context.env.DB.prepare(
        `SELECT MIN(due_date) AS dueDate
           FROM contribution_dues
          WHERE household_id = ? AND due_date <= ?
            AND status NOT IN ('paid', 'exempt', 'to_verify')
            AND paid_amount_cents < expected_amount_cents`,
      )
        .bind(scope.household.id, today)
        .first<{ dueDate: string | null }>(),
      context.env.DB.prepare(
        `SELECT COUNT(*) AS count FROM contribution_dues
          WHERE household_id = ? AND due_date <= ? AND status = 'to_verify'`,
      )
        .bind(scope.household.id, today)
        .first<{ count: number }>(),
      context.env.DB.prepare(
        `SELECT due_date AS dueDate, expected_amount_cents AS amountCents
           FROM contribution_dues
          WHERE household_id = ? AND due_date > ? AND status = 'upcoming'
          ORDER BY due_date ASC LIMIT 1`,
      )
        .bind(scope.household.id, today)
        .first<{ dueDate: string; amountCents: number }>(),
      context.env.DB.prepare(
        `SELECT amount_cents AS amountCents, payment_date AS paymentDate
           FROM payments
          WHERE household_id = ? AND status = 'posted'
          ORDER BY payment_date DESC, created_at DESC LIMIT 1`,
      )
        .bind(scope.household.id)
        .first<{ amountCents: number; paymentDate: string }>(),
      context.env.DB.prepare(`SELECT COUNT(*) AS count FROM contribution_dues WHERE household_id = ?`)
        .bind(scope.household.id)
        .first<{ count: number }>(),
    ]);

  if (!member || !totals) {
    return context.json({ error: "MEMBER_NOT_FOUND" }, 404);
  }

  const status = statusFromOldestDue(oldest?.dueDate ?? null, (dueCount?.count ?? 0) > 0, (verification?.count ?? 0) > 0);
  const data: MemberDashboardData = {
    member: {
      fullName: `${member.firstName} ${member.lastName}`,
      firstName: member.firstName,
      memberNumber: member.memberNumber,
    },
    household: { name: scope.household.name, memberCount: memberCount?.count ?? 0 },
    financial: {
      dueNowCents: totals.dueNowCents,
      annualExpectedCents: totals.annualExpectedCents,
      annualPaidCents: totals.annualPaidCents,
      ...status,
      nextDue: nextDue ?? null,
      latestPayment: latestPayment ?? null,
    },
  };
  return context.json(data);
}

export async function getMemberContributions(context: AppContext) {
  const scope = await getHouseholdScope(context);
  if ("error" in scope) return scope.error;

  const [dues, historySetting] = await Promise.all([
    context.env.DB.prepare(
      `SELECT id, due_date AS dueDate, expected_amount_cents AS expectedAmountCents,
              paid_amount_cents AS paidAmountCents, status, source
         FROM contribution_dues
        WHERE household_id = ?
        ORDER BY due_date DESC`,
    )
      .bind(scope.household.id)
      .all<ContributionItem>(),
    context.env.DB.prepare(`SELECT json_extract(value, '$') AS value FROM app_settings WHERE key = 'history_start_date'`)
      .first<{ value: string }>(),
  ]);

  const data: MemberContributionsData = {
    historyStartYear: Number(historySetting?.value?.slice(0, 4)) || 2021,
    contributions: dues.results,
  };
  return context.json(data);
}

export async function getMemberQr(context: AppContext) {
  const scope = await getHouseholdScope(context);
  if ("error" in scope) return scope.error;

  const [member, qr] = await Promise.all([
    context.env.DB.prepare(
      `SELECT first_name AS firstName, last_name AS lastName, member_number AS memberNumber
         FROM members WHERE id = ?`,
    )
      .bind(scope.access.profile.memberId)
      .first<{ firstName: string; lastName: string; memberNumber: string }>(),
    context.env.DB.prepare(
      `SELECT id, token_hash AS tokenHash FROM member_qr_codes
        WHERE member_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(scope.access.profile.memberId)
      .first<{ id: string; tokenHash: string }>(),
  ]);

  if (!member || !qr) {
    return context.json({ error: "QR_NOT_ACTIVE", message: "Votre QR n’est pas encore actif." }, 404);
  }

  const signature = await hmacSha256(`${qr.id}:${scope.access.profile.memberId}`, context.env.QR_TOKEN_SECRET);
  const qrToken = `${qr.id}.${signature}`;
  if ((await sha256(qrToken)) !== qr.tokenHash) {
    return context.json({ error: "QR_INTEGRITY_ERROR", message: "Le QR doit être régénéré par le bureau." }, 500);
  }

  const data: MemberQrData = {
    qrToken,
    member: {
      fullName: `${member.firstName} ${member.lastName}`,
      memberNumber: member.memberNumber,
    },
    householdName: scope.household.name,
  };
  return context.json(data);
}

export async function getMemberProfile(context: AppContext) {
  const scope = await getHouseholdScope(context);
  if ("error" in scope) return scope.error;
  const today = todayInParis();

  const [member, householdMembers] = await Promise.all([
    context.env.DB.prepare(
      `SELECT first_name AS firstName, last_name AS lastName,
              member_number AS memberNumber, phone
         FROM members WHERE id = ?`,
    )
      .bind(scope.access.profile.memberId)
      .first<{ firstName: string; lastName: string; memberNumber: string; phone: string | null }>(),
    context.env.DB.prepare(
      `SELECT m.id, m.first_name AS firstName, m.last_name AS lastName,
              m.birth_date AS birthDate, hm.relationship
         FROM household_memberships hm
         JOIN members m ON m.id = hm.member_id
        WHERE hm.household_id = ? AND hm.starts_at <= ?
          AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
        ORDER BY CASE hm.relationship WHEN 'head' THEN 1 WHEN 'partner' THEN 2 ELSE 3 END,
                 m.birth_date ASC`,
    )
      .bind(scope.household.id, today, today)
      .all<{
        id: string;
        firstName: string;
        lastName: string;
        birthDate: string | null;
        relationship: "head" | "partner" | "child";
      }>(),
  ]);

  if (!member) return context.json({ error: "MEMBER_NOT_FOUND" }, 404);
  const data: MemberProfileData = {
    member: {
      fullName: `${member.firstName} ${member.lastName}`,
      memberNumber: member.memberNumber,
      phone: member.phone,
    },
    household: {
      name: scope.household.name,
      members: householdMembers.results.map((item) => ({
        id: item.id,
        fullName: `${item.firstName} ${item.lastName}`,
        relationship: item.relationship,
        birthDate: item.birthDate,
      })),
    },
  };
  return context.json(data);
}
