import type { Context } from "hono";
import { z } from "zod";

import type { AuthBindings } from "../auth";
import type {
  AdminHousehold,
  AdminMember,
  AdministrationData,
  ContributionRulesData,
} from "../shared/administration";
import { requireOffice } from "./payments";

type AppContext = Context<{ Bindings: AuthBindings }>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Date invalide");
const optionalDate = z.union([isoDate, z.literal("")]).transform((value) => value || null);
const phone = z.union([
  z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  z.literal(""),
]).transform((value) => value || null);
const personName = z.string().trim().min(1).max(80).regex(/^[\p{L}][\p{L} '’.-]*$/u);
const householdName = z.string().trim().min(2).max(100);
const memberNumber = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/);
const entityId = z.string().regex(/^[A-Za-z0-9_-]{3,80}$/);

const householdCreateSchema = z.object({
  officeId: entityId.optional(),
  name: householdName,
  phone,
  joinedAt: isoDate,
  status: z.enum(["active", "inactive", "to_verify"]).default("active"),
  head: z.object({
    memberNumber,
    firstName: personName,
    lastName: personName,
    gender: z.enum(["male", "female", "unspecified"]),
    birthDate: optionalDate,
    phone,
  }),
});

const householdUpdateSchema = z.object({
  expectedUpdatedAt: z.string().min(10).max(40),
  name: householdName,
  phone,
  joinedAt: isoDate,
  leftAt: optionalDate,
  status: z.enum(["active", "inactive", "to_verify"]),
});

const memberCreateSchema = z.object({
  memberNumber,
  firstName: personName,
  lastName: personName,
  gender: z.enum(["male", "female", "unspecified"]),
  birthDate: optionalDate,
  phone,
  joinedAt: isoDate,
  relationship: z.enum(["head", "partner", "child"]),
});

const memberUpdateSchema = memberCreateSchema.extend({
  expectedUpdatedAt: z.string().min(10).max(40),
  leftAt: optionalDate,
  status: z.enum(["active", "inactive", "deceased"]),
  membershipId: entityId,
});

const activitySchema = z.object({
  status: z.enum(["working", "not_working"]),
  startsAt: isoDate,
  reason: z.string().trim().min(5).max(200),
});

function errorMessage(context: AppContext, message: string, status: 400 | 404 | 409 = 400) {
  return context.json({ error: status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "INVALID_INPUT", message }, status);
}

function previousDay(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function activeHeadExists(context: AppContext, householdId: string, excludeMemberId?: string) {
  const row = await context.env.DB.prepare(
    `SELECT hm.member_id AS memberId FROM household_memberships hm
      JOIN members m ON m.id = hm.member_id
     WHERE hm.household_id = ? AND hm.relationship = 'head'
       AND hm.ends_at IS NULL AND m.status = 'active'
       AND (? IS NULL OR hm.member_id <> ?) LIMIT 1`,
  ).bind(householdId, excludeMemberId ?? null, excludeMemberId ?? null).first();
  return Boolean(row);
}

async function auditStatement(
  context: AppContext,
  actorProfileId: string,
  action: string,
  entityType: string,
  entityId: string,
  oldValues: unknown,
  newValues: unknown,
) {
  return context.env.DB.prepare(
    `INSERT INTO audit_logs
      (id, actor_profile_id, action, entity_type, entity_id, old_values, new_values)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), actorProfileId, action, entityType, entityId,
    oldValues == null ? null : JSON.stringify(oldValues),
    newValues == null ? null : JSON.stringify(newValues),
  );
}

export async function listAdministrationHouseholds(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "admin"]);
  if ("error" in office) return office.error;
  const query = (context.req.query("q") ?? "").trim();
  if (query.length > 50 || (query && !/^[\p{L}\p{N} +'’.-]+$/u.test(query))) {
    return errorMessage(context, "La recherche n’est pas valide.");
  }
  const pattern = `%${query}%`;
  const rows = await context.env.DB.prepare(
    `SELECT h.id, h.office_id AS officeId, o.name AS officeName, h.name, h.phone, h.joined_at AS joinedAt, h.left_at AS leftAt,
            h.status, h.updated_at AS updatedAt,
            hra.id AS assignmentId, hra.rule_id AS ruleId, hra.starts_at AS assignmentStartsAt,
            cr.name AS ruleName
      FROM households h JOIN offices o ON o.id = h.office_id
       LEFT JOIN household_rule_assignments hra ON hra.id = (
         SELECT x.id FROM household_rule_assignments x WHERE x.household_id = h.id
           AND x.ends_at IS NULL ORDER BY x.starts_at DESC LIMIT 1
       )
       LEFT JOIN contribution_rules cr ON cr.id = hra.rule_id
      WHERE (? = 1 OR h.office_id = ?) AND (? = '' OR h.name LIKE ? COLLATE NOCASE OR COALESCE(h.phone, '') LIKE ?
         OR EXISTS (SELECT 1 FROM household_memberships hm JOIN members m ON m.id = hm.member_id
                    WHERE hm.household_id = h.id AND (m.member_number LIKE ? COLLATE NOCASE
                      OR m.first_name || ' ' || m.last_name LIKE ? COLLATE NOCASE)))
      ORDER BY h.name COLLATE NOCASE LIMIT 50`,
  ).bind(office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId, query, pattern, pattern, pattern, pattern).all<{
    id: string; officeId: string; officeName: string; name: string; phone: string | null; joinedAt: string; leftAt: string | null;
    status: AdminHousehold["status"]; updatedAt: string; assignmentId: string | null;
    ruleId: string | null; assignmentStartsAt: string | null; ruleName: string | null;
  }>();

  const households = await Promise.all(rows.results.map(async (row): Promise<AdminHousehold> => {
    const memberRows = await context.env.DB.prepare(
      `SELECT m.id, hm.id AS membershipId, m.member_number AS memberNumber,
              m.first_name AS firstName, m.last_name AS lastName, m.gender,
              m.birth_date AS birthDate, m.phone, m.joined_at AS joinedAt,
              m.left_at AS leftAt, m.status, hm.relationship, m.updated_at AS updatedAt,
              map.status AS activityStatus, map.starts_at AS activityStartsAt
         FROM household_memberships hm JOIN members m ON m.id = hm.member_id
         LEFT JOIN member_activity_periods map ON map.id = (
           SELECT x.id FROM member_activity_periods x WHERE x.member_id = m.id
             AND x.ends_at IS NULL ORDER BY x.starts_at DESC LIMIT 1
         )
        WHERE hm.household_id = ? AND hm.ends_at IS NULL
        ORDER BY CASE hm.relationship WHEN 'head' THEN 0 WHEN 'partner' THEN 1 ELSE 2 END,
                 m.birth_date, m.last_name, m.first_name`,
    ).bind(row.id).all<AdminMember>();
    return {
      id: row.id, officeId: row.officeId, officeName: row.officeName, name: row.name, phone: row.phone, joinedAt: row.joinedAt,
      leftAt: row.leftAt, status: row.status, updatedAt: row.updatedAt,
      members: memberRows.results,
      assignment: row.assignmentId && row.ruleId && row.ruleName && row.assignmentStartsAt
        ? { id: row.assignmentId, ruleId: row.ruleId, ruleName: row.ruleName, startsAt: row.assignmentStartsAt }
        : null,
    };
  }));
  const response: AdministrationData = { households, total: households.length };
  return context.json(response);
}

export async function createAdministrationHousehold(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "admin"]);
  if ("error" in office) return office.error;
  const parsed = householdCreateSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return errorMessage(context, "Vérifiez le foyer, le téléphone international et le premier membre.");
  const data = parsed.data;
  const targetOfficeId = office.access.profile.centralAccess && data.officeId ? data.officeId : office.access.profile.officeId;
  const targetOffice = await context.env.DB.prepare("SELECT id FROM offices WHERE id = ? AND status = 'active'").bind(targetOfficeId).first();
  if (!targetOffice) return errorMessage(context, "Le bureau choisi est introuvable.", 404);
  const householdId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO households (id, office_id, name, phone, joined_at, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(householdId, targetOfficeId, data.name, data.phone, data.joinedAt, data.status, now),
      context.env.DB.prepare(`INSERT INTO household_office_assignments (id, household_id, office_id, starts_at, reason, changed_by) VALUES (?, ?, ?, ?, 'Création du foyer', ?)`).bind(crypto.randomUUID(), householdId, targetOfficeId, data.joinedAt, office.access.profile.id),
      context.env.DB.prepare(
        `INSERT INTO members
          (id, member_number, first_name, last_name, gender, birth_date, phone, joined_at, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      ).bind(memberId, data.head.memberNumber, data.head.firstName, data.head.lastName,
        data.head.gender, data.head.birthDate, data.head.phone, data.joinedAt, now),
      context.env.DB.prepare(
        `INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at)
         VALUES (?, ?, ?, 'head', ?)`,
      ).bind(membershipId, householdId, memberId, data.joinedAt),
      await auditStatement(context, office.access.profile.id, "household.created", "household", householdId, null, data),
    ]);
  } catch {
    return errorMessage(context, "Ce numéro de membre existe déjà ou les données sont incompatibles.", 409);
  }
  return context.json({ ok: true, householdId }, 201);
}

export async function updateAdministrationHousehold(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "admin"]);
  if ("error" in office) return office.error;
  const parsed = householdUpdateSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return errorMessage(context, "Les informations du foyer sont invalides.");
  const id = context.req.param("id") ?? "";
  const old = await context.env.DB.prepare(
    `SELECT name, phone, joined_at AS joinedAt, left_at AS leftAt, status, updated_at AS updatedAt
       FROM households WHERE id = ? AND (? = 1 OR office_id = ?)`,
  ).bind(id, office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).first();
  if (!old) return errorMessage(context, "Foyer introuvable.", 404);
  const data = parsed.data;
  if ((data.status === "active" && data.leftAt) || (data.status === "inactive" && !data.leftAt)) {
    return errorMessage(context, "Un foyer actif ne doit pas avoir de date de départ ; un foyer inactif doit en avoir une.");
  }
  const now = new Date().toISOString();
  const update = context.env.DB.prepare(
    `UPDATE households SET name = ?, phone = ?, joined_at = ?, left_at = ?, status = ?, updated_at = ?
      WHERE id = ? AND updated_at = ?`,
  ).bind(data.name, data.phone, data.joinedAt, data.leftAt, data.status, now, id, data.expectedUpdatedAt);
  const result = await update.run();
  if (result.meta.changes !== 1) return errorMessage(context, "Cette fiche a été modifiée ailleurs. Rechargez-la.", 409);
  await (await auditStatement(context, office.access.profile.id, "household.updated", "household", id, old, data)).run();
  return context.json({ ok: true, updatedAt: now });
}

export async function createAdministrationMember(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "admin"]);
  if ("error" in office) return office.error;
  const parsed = memberCreateSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return errorMessage(context, "Les informations du membre sont invalides.");
  const householdId = context.req.param("id") ?? "";
  const household = await context.env.DB.prepare("SELECT id FROM households WHERE id = ? AND (? = 1 OR office_id = ?)").bind(householdId, office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).first();
  if (!household) return errorMessage(context, "Foyer introuvable.", 404);
  if (parsed.data.relationship === "head" && await activeHeadExists(context, householdId)) {
    return errorMessage(context, "Ce foyer possède déjà un responsable actif.", 409);
  }
  const memberId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO members
          (id, member_number, first_name, last_name, gender, birth_date, phone, joined_at, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      ).bind(memberId, parsed.data.memberNumber, parsed.data.firstName, parsed.data.lastName,
        parsed.data.gender, parsed.data.birthDate, parsed.data.phone, parsed.data.joinedAt, now),
      context.env.DB.prepare(
        `INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(membershipId, householdId, memberId, parsed.data.relationship, parsed.data.joinedAt),
      await auditStatement(context, office.access.profile.id, "member.created", "member", memberId, null,
        { ...parsed.data, householdId }),
    ]);
  } catch {
    return errorMessage(context, "Ce numéro de membre existe déjà ou les données sont incompatibles.", 409);
  }
  return context.json({ ok: true, memberId }, 201);
}

export async function updateAdministrationMember(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "admin"]);
  if ("error" in office) return office.error;
  const parsed = memberUpdateSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return errorMessage(context, "Les informations du membre sont invalides.");
  const memberId = context.req.param("id") ?? "";
  const old = await context.env.DB.prepare(
    `SELECT m.member_number AS memberNumber, m.first_name AS firstName, m.last_name AS lastName,
            m.gender, m.birth_date AS birthDate, m.phone, m.joined_at AS joinedAt,
            m.left_at AS leftAt, m.status, m.updated_at AS updatedAt,
            hm.household_id AS householdId, hm.relationship, hm.id AS membershipId
       FROM members m JOIN household_memberships hm ON hm.member_id = m.id
       JOIN households h ON h.id = hm.household_id
      WHERE m.id = ? AND hm.id = ? AND hm.ends_at IS NULL AND (? = 1 OR h.office_id = ?)`,
  ).bind(memberId, parsed.data.membershipId, office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).first<{ householdId: string }>();
  if (!old) return errorMessage(context, "Membre introuvable.", 404);
  const data = parsed.data;
  if ((data.status === "active" && data.leftAt) || (data.status !== "active" && !data.leftAt)) {
    return errorMessage(context, "Un membre actif ne doit pas avoir de date de départ ; un membre inactif doit en avoir une.");
  }
  if (data.relationship === "head" && await activeHeadExists(context, old.householdId, memberId)) {
    return errorMessage(context, "Ce foyer possède déjà un autre responsable actif.", 409);
  }
  if (data.status !== "active" && !office.access.roles.includes("admin")) {
    const protectedAccount = await context.env.DB.prepare(
      `SELECT 1 FROM profiles p JOIN user_roles ur ON ur.profile_id = p.id
        JOIN roles r ON r.id = ur.role_id
       WHERE p.member_id = ? AND ur.revoked_at IS NULL
         AND r.code IN ('data_entry', 'controller', 'treasurer', 'admin') LIMIT 1`,
    ).bind(memberId).first();
    if (protectedAccount) {
      return context.json({ error: "FORBIDDEN", message: "Seul un administrateur peut désactiver un responsable du bureau." }, 403);
    }
  }
  const now = new Date().toISOString();
  const memberUpdate = context.env.DB.prepare(
    `UPDATE members SET member_number = ?, first_name = ?, last_name = ?, gender = ?,
            birth_date = ?, phone = ?, joined_at = ?, left_at = ?, status = ?, updated_at = ?
      WHERE id = ? AND updated_at = ?`,
  ).bind(data.memberNumber, data.firstName, data.lastName, data.gender, data.birthDate,
    data.phone, data.joinedAt, data.leftAt, data.status, now, memberId, data.expectedUpdatedAt);
  try {
    const result = await memberUpdate.run();
    if (result.meta.changes !== 1) return errorMessage(context, "Cette fiche a été modifiée ailleurs. Rechargez-la.", 409);
  } catch {
    return errorMessage(context, "Ce numéro de membre existe déjà.", 409);
  }
  const statements = [
    context.env.DB.prepare(
      `UPDATE household_memberships SET relationship = ?, ends_at = ? WHERE id = ? AND member_id = ?`,
    ).bind(data.relationship, data.status === "active" ? null : data.leftAt, data.membershipId, memberId),
    await auditStatement(context, office.access.profile.id, "member.updated", "member", memberId, old, data),
  ];
  if (data.status !== "active") {
    statements.push(context.env.DB.prepare(
      `UPDATE profiles SET status = 'suspended', updated_at = CURRENT_TIMESTAMP WHERE member_id = ?`,
    ).bind(memberId));
  }
  await context.env.DB.batch(statements);
  return context.json({ ok: true, updatedAt: now });
}

export async function updateMemberActivity(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "admin"]);
  if ("error" in office) return office.error;
  const parsed = activitySchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return errorMessage(context, "Vérifiez le statut d’activité, la date et le motif.");
  const memberId = context.req.param("id") ?? "";
  const member = await context.env.DB.prepare(
    `SELECT m.id, m.gender, m.birth_date AS birthDate, m.joined_at AS joinedAt,
            h.id AS householdId
       FROM members m JOIN household_memberships hm ON hm.member_id = m.id AND hm.ends_at IS NULL
       JOIN households h ON h.id = hm.household_id
      WHERE m.id = ? AND m.status = 'active' AND (? = 1 OR h.office_id = ?)`,
  ).bind(memberId, office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId)
    .first<{ id: string; gender: string; birthDate: string | null; joinedAt: string; householdId: string }>();
  if (!member) return errorMessage(context, "Membre actif introuvable.", 404);
  if (member.gender !== "male") return errorMessage(context, "Le statut d’activité trimestrielle concerne uniquement les hommes.");
  if (!member.birthDate) return errorMessage(context, "Renseignez la date de naissance avant le statut d’activité.");
  if (parsed.data.startsAt < member.joinedAt) return errorMessage(context, "Le statut ne peut pas commencer avant l’adhésion.");
  const birth18 = new Date(`${member.birthDate}T12:00:00Z`);
  birth18.setUTCFullYear(birth18.getUTCFullYear() + 18);
  if (parsed.data.startsAt < birth18.toISOString().slice(0, 10)) {
    return errorMessage(context, "La cotisation d’activité commence uniquement à partir de 18 ans.");
  }
  const current = await context.env.DB.prepare(
    `SELECT id, status, starts_at AS startsAt FROM member_activity_periods
      WHERE member_id = ? AND ends_at IS NULL ORDER BY starts_at DESC LIMIT 1`,
  ).bind(memberId).first<{ id: string; status: "working" | "not_working"; startsAt: string }>();
  if (current && current.startsAt >= parsed.data.startsAt) {
    return errorMessage(context, "La nouvelle situation doit commencer après la situation actuelle.", 409);
  }
  const paid = await context.env.DB.prepare(
    `SELECT id FROM contribution_dues WHERE member_id = ?
      AND contribution_kind = 'quarterly_working_man' AND due_date >= ? AND paid_amount_cents > 0 LIMIT 1`,
  ).bind(memberId, parsed.data.startsAt).first();
  if (paid) return errorMessage(context, "Une cotisation déjà payée existe après cette date. Faites d’abord vérifier le dossier.", 409);
  const statements: D1PreparedStatement[] = [];
  if (current) statements.push(context.env.DB.prepare(
    `UPDATE member_activity_periods SET ends_at = ? WHERE id = ? AND ends_at IS NULL`,
  ).bind(previousDay(parsed.data.startsAt), current.id));
  const activityId = crypto.randomUUID();
  statements.push(
    context.env.DB.prepare(
      `INSERT INTO member_activity_periods (id, member_id, status, starts_at, reason, changed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(activityId, memberId, parsed.data.status, parsed.data.startsAt, parsed.data.reason, office.access.profile.id),
    context.env.DB.prepare(
      `UPDATE contribution_dues SET status = 'exempt', updated_at = CURRENT_TIMESTAMP
        WHERE member_id = ? AND contribution_kind = 'quarterly_working_man'
          AND due_date >= ? AND paid_amount_cents = 0 AND ? = 'not_working'`,
    ).bind(memberId, parsed.data.startsAt, parsed.data.status),
    await auditStatement(context, office.access.profile.id, "member.activity_changed", "member", memberId,
      current ?? null, { activityId, ...parsed.data }),
  );
  await context.env.DB.batch(statements);
  return context.json({ ok: true, activityId }, 201);
}

export async function listContributionRules(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "admin"]);
  if ("error" in office) return office.error;
  const rows = await context.env.DB.prepare(
    `SELECT cr.id, cr.name, cr.category, cr.base_amount_cents AS baseAmountCents,
            cr.female_amount_cents AS femaleAmountCents,
            cr.child_amount_cents AS childAmountCents, cr.child_max_age AS childMaxAge,
            cr.effective_from AS effectiveFrom, cr.effective_to AS effectiveTo,
            GROUP_CONCAT(rdm.month_number, ',') AS dueMonths
       FROM contribution_rules cr LEFT JOIN rule_due_months rdm ON rdm.rule_id = cr.id
      GROUP BY cr.id ORDER BY cr.effective_from DESC, cr.category, cr.name`,
  ).all<{
    id: string; name: string; category: ContributionRulesData["rules"][number]["category"];
    baseAmountCents: number; femaleAmountCents: number; childAmountCents: number; childMaxAge: number;
    effectiveFrom: string; effectiveTo: string | null; dueMonths: string | null;
  }>();
  const response: ContributionRulesData = {
    rules: rows.results.map((row) => ({
      ...row,
      dueMonths: (row.dueMonths ?? "").split(",").filter(Boolean).map(Number).sort((a, b) => a - b),
    })),
  };
  return context.json(response);
}

export async function createContributionRule(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  if (!office.access.profile.centralAccess) return context.json({ error: "FORBIDDEN", message: "Seul le bureau central peut consulter cette opération historique." }, 403);
  return errorMessage(context, "Le barème officiel AADM est fixe depuis le 1er janvier 2021 et ne peut pas être remplacé par une catégorie de foyer.", 409);
}

export async function assignContributionRule(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  return errorMessage(context, "Les cotisations sont désormais calculées par personne ; aucune catégorie ne doit être affectée au foyer.", 409);
}
