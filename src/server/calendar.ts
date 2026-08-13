import type { Context } from "hono";
import { z } from "zod";

import type { AuthBindings } from "../auth";
import { todayInParis } from "../shared/date";
import type { CalendarData, GenerationResult, HistoricalRuleItem, MeetingItem } from "../shared/calendar";
import { requireOffice } from "./payments";

type AppContext = Context<{ Bindings: AuthBindings }>;
const yearSchema = z.coerce.number().int().min(2021).max(2100);
const generationSchema = z.object({
  year: yearSchema,
  officeId: z.string().min(3).max(80).optional(),
  confirmation: z.literal("GENERER LES ECHEANCES"),
  reason: z.string().trim().min(5).max(300),
});
const dueMonths = [3, 6, 9, 12] as const;

function invalid(context: AppContext, message: string, status: 400 | 409 = 400) {
  return context.json({ error: status === 409 ? "CONFLICT" : "INVALID_INPUT", message }, status);
}

export function nthWeekday(year: number, monthNumber: number, ordinal: number, weekday: number) {
  const first = new Date(Date.UTC(year, monthNumber - 1, 1, 12));
  const firstMatch = 1 + ((weekday - first.getUTCDay() + 7) % 7);
  const day = firstMatch + (ordinal - 1) * 7;
  const candidate = new Date(Date.UTC(year, monthNumber - 1, day, 12));
  if (candidate.getUTCMonth() !== monthNumber - 1) throw new Error("Cette règle ne produit aucune date dans ce mois.");
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export const secondSunday = (year: number, monthNumber: number) => nthWeekday(year, monthNumber, 2, 0);

async function selectedOffice(context: AppContext, requestedId: string | undefined, centralAccess: boolean, currentOfficeId: string) {
  const officeId = centralAccess && requestedId ? requestedId : currentOfficeId;
  return context.env.DB.prepare(
    `SELECT id, name, city, meeting_ordinal AS meetingOrdinal, meeting_weekday AS meetingWeekday
       FROM offices WHERE id = ? AND status = 'active'`,
  ).bind(officeId).first<{ id: string; name: string; city: string; meetingOrdinal: number; meetingWeekday: number }>();
}

function ageAtDate(birthDate: string, date: string) {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [year, month, day] = date.split("-").map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age;
}

async function listRules(context: AppContext): Promise<HistoricalRuleItem[]> {
  const rows = await context.env.DB.prepare(
    `SELECT cr.id, cr.name, cr.category, cr.base_amount_cents AS baseAmountCents,
            cr.female_amount_cents AS femaleAmountCents,
            cr.child_amount_cents AS childAmountCents, cr.child_max_age AS childMaxAge,
            cr.effective_from AS effectiveFrom, cr.effective_to AS effectiveTo,
            GROUP_CONCAT(DISTINCT rdm.month_number) AS dueMonths,
            COUNT(DISTINCT hra.id) AS assignmentCount
       FROM contribution_rules cr LEFT JOIN rule_due_months rdm ON rdm.rule_id = cr.id
       LEFT JOIN household_rule_assignments hra ON hra.rule_id = cr.id
      GROUP BY cr.id ORDER BY cr.effective_from DESC, cr.name`,
  ).all<{
    id: string; name: string; category: HistoricalRuleItem["category"]; baseAmountCents: number; femaleAmountCents: number;
    childAmountCents: number; childMaxAge: number; effectiveFrom: string; effectiveTo: string | null;
    dueMonths: string | null; assignmentCount: number;
  }>();
  return rows.results.map((row) => ({ ...row,
    dueMonths: (row.dueMonths ?? "").split(",").filter(Boolean).map(Number).sort((a, b) => a - b),
  }));
}

export async function getCalendar(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "controller", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const parsedYear = yearSchema.safeParse(context.req.query("year") ?? new Date().getUTCFullYear());
  if (!parsedYear.success) return invalid(context, "L’année doit être comprise entre 2021 et 2100.");
  const year = parsedYear.data;
  const chosenOffice = await selectedOffice(context, context.req.query("officeId"), office.access.profile.centralAccess, office.access.profile.officeId);
  if (!chosenOffice) return invalid(context, "Le bureau demandé est introuvable.");
  const [meetings, rules, totals, lastGeneration, availableOffices] = await Promise.all([
    context.env.DB.prepare(
      `SELECT am.id, am.meeting_date AS meetingDate, am.month_number AS monthNumber,
              am.label, am.status,
              COALESCE(SUM(CASE WHEN cd.status <> 'exempt' THEN 1 ELSE 0 END), 0) AS dueCount,
              COALESCE(SUM(CASE WHEN cd.status <> 'exempt' THEN cd.expected_amount_cents ELSE 0 END), 0) AS expectedAmountCents
         FROM association_meetings am LEFT JOIN contribution_dues cd
           ON cd.due_date = am.meeting_date AND cd.office_id = am.office_id
        WHERE am.year = ? AND am.office_id = ? GROUP BY am.id ORDER BY am.meeting_date`,
    ).bind(year, chosenOffice.id).all<MeetingItem>(),
    listRules(context),
    context.env.DB.prepare(
      `SELECT COUNT(*) AS dueCount, COALESCE(SUM(expected_amount_cents), 0) AS expectedAmountCents,
              COUNT(DISTINCT household_id) AS householdCount
         FROM contribution_dues WHERE due_date BETWEEN ? AND ? AND office_id = ? AND status <> 'exempt'`,
    ).bind(`${year}-01-01`, `${year}-12-31`, chosenOffice.id).first<{ dueCount: number; expectedAmountCents: number; householdCount: number }>(),
    context.env.DB.prepare(
      `SELECT dgr.created_at AS createdAt, dgr.created_due_count AS createdDueCount,
              dgr.skipped_due_count AS skippedDueCount, dgr.created_meeting_count AS createdMeetingCount,
              COALESCE(u.name, 'Administrateur') AS createdByName
         FROM due_generation_runs dgr LEFT JOIN profiles p ON p.id = dgr.created_by
         LEFT JOIN auth_user u ON u.id = p.auth_user_id
        WHERE dgr.year = ? AND dgr.office_id = ? ORDER BY dgr.created_at DESC LIMIT 1`,
    ).bind(year, chosenOffice.id).first<NonNullable<CalendarData["lastGeneration"]>>(),
    context.env.DB.prepare(
      `SELECT id, name FROM offices WHERE status = 'active' AND (? = 1 OR id = ?) ORDER BY city`,
    ).bind(office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).all<{ id: string; name: string }>(),
  ]);
  return context.json({
    year, office: chosenOffice, availableOffices: availableOffices.results, meetings: meetings.results, rules,
    dueCount: totals?.dueCount ?? 0, expectedAmountCents: totals?.expectedAmountCents ?? 0,
    householdCount: totals?.householdCount ?? 0, lastGeneration: lastGeneration ?? null,
  } satisfies CalendarData, 200, { "Cache-Control": "no-store" });
}

type MemberCandidate = {
  householdId: string; householdName: string; memberId: string; firstName: string; lastName: string;
  gender: "male" | "female" | "unspecified"; birthDate: string | null;
  memberJoinedAt: string; memberLeftAt: string | null; membershipStartsAt: string; membershipEndsAt: string | null;
  officeStartsAt: string; officeEndsAt: string | null;
  activityStatus: "working" | "not_working" | null; activityStartsAt: string | null; activityEndsAt: string | null;
};

function activeAt(startsAt: string, endsAt: string | null, date: string) {
  return startsAt <= date && (!endsAt || endsAt >= date);
}

function isWorkingAt(candidate: MemberCandidate, date: string) {
  return candidate.activityStatus === "working" && candidate.activityStartsAt != null
    && activeAt(candidate.activityStartsAt, candidate.activityEndsAt, date);
}

async function runBatches(context: AppContext, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 100) {
    await context.env.DB.batch(statements.slice(index, index + 100));
  }
}

export async function generateYearDues(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office.error;
  const parsed = generationSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Recopiez GENERER LES ECHEANCES, choisissez l’année et indiquez une raison.");
  const { year, reason } = parsed.data;
  const chosenOffice = await selectedOffice(context, parsed.data.officeId, office.access.profile.centralAccess, office.access.profile.officeId);
  if (!chosenOffice) return invalid(context, "Le bureau demandé est introuvable.");

  let meetingDates: string[];
  try { meetingDates = dueMonths.map((month) => nthWeekday(year, month, chosenOffice.meetingOrdinal, chosenOffice.meetingWeekday)); }
  catch { return invalid(context, `La règle fixe de ${chosenOffice.name} ne produit pas de date pour tous les trimestres.`, 409); }
  const firstMeetingDate = meetingDates[0];

  const rules = await context.env.DB.prepare(
    `SELECT id, category, base_amount_cents AS baseAmountCents, female_amount_cents AS femaleAmountCents,
            child_amount_cents AS childAmountCents,
            child_max_age AS childMaxAge FROM contribution_rules
      WHERE id IN ('rule_aadm_repatriation_2021', 'rule_aadm_working_man_2021')`,
  ).all<{ id: string; category: string; baseAmountCents: number; femaleAmountCents: number; childAmountCents: number; childMaxAge: number }>();
  const repatriation = rules.results.find((rule) => rule.category === "annual_repatriation");
  const workingMan = rules.results.find((rule) => rule.category === "quarterly_working_man");
  if (!repatriation || !workingMan) return invalid(context, "Les deux règles officielles AADM sont absentes.", 409);

  const candidates = await context.env.DB.prepare(
    `SELECT h.id AS householdId, h.name AS householdName, m.id AS memberId,
            m.first_name AS firstName, m.last_name AS lastName, m.gender, m.birth_date AS birthDate,
            m.joined_at AS memberJoinedAt, m.left_at AS memberLeftAt,
            hm.starts_at AS membershipStartsAt, hm.ends_at AS membershipEndsAt,
            hoa.starts_at AS officeStartsAt, hoa.ends_at AS officeEndsAt,
            map.status AS activityStatus, map.starts_at AS activityStartsAt, map.ends_at AS activityEndsAt
       FROM households h JOIN household_memberships hm ON hm.household_id = h.id
       JOIN members m ON m.id = hm.member_id
       JOIN household_office_assignments hoa ON hoa.household_id = h.id
       LEFT JOIN member_activity_periods map ON map.member_id = m.id
      WHERE hoa.office_id = ? AND hoa.starts_at <= ? AND (hoa.ends_at IS NULL OR hoa.ends_at >= ?)
        AND hm.starts_at <= ? AND (hm.ends_at IS NULL OR hm.ends_at >= ?)
        AND m.joined_at <= ? AND (m.left_at IS NULL OR m.left_at >= ?)
      ORDER BY h.id, m.id, map.starts_at`,
  ).bind(chosenOffice.id, `${year}-12-31`, `${year}-01-01`, `${year}-12-31`, `${year}-01-01`, `${year}-12-31`, `${year}-01-01`)
    .all<MemberCandidate>();

  const missingBirthDates = new Set<string>();
  for (const candidate of candidates.results) {
    if (!candidate.birthDate && activeAt(candidate.membershipStartsAt, candidate.membershipEndsAt, firstMeetingDate)
      && activeAt(candidate.officeStartsAt, candidate.officeEndsAt, firstMeetingDate)
      && activeAt(candidate.memberJoinedAt, candidate.memberLeftAt, firstMeetingDate)) {
      missingBirthDates.add(`${candidate.firstName} ${candidate.lastName}`);
    }
  }
  if (missingBirthDates.size) {
    return invalid(context, `Date de naissance manquante pour : ${[...missingBirthDates].slice(0, 5).join(", ")}. Corrigez les fiches avant de générer.`, 409);
  }
  const missingGenders = new Set<string>();
  for (const candidate of candidates.results) {
    if (candidate.birthDate && candidate.gender === "unspecified" && ageAtDate(candidate.birthDate, firstMeetingDate) >= 18
      && activeAt(candidate.membershipStartsAt, candidate.membershipEndsAt, firstMeetingDate)
      && activeAt(candidate.officeStartsAt, candidate.officeEndsAt, firstMeetingDate)
      && activeAt(candidate.memberJoinedAt, candidate.memberLeftAt, firstMeetingDate)) {
      missingGenders.add(`${candidate.firstName} ${candidate.lastName}`);
    }
  }
  if (missingGenders.size) {
    return invalid(context, `Sexe manquant pour : ${[...missingGenders].slice(0, 5).join(", ")}. Le tarif adulte est différent pour un homme et une femme.`, 409);
  }
  const missingActivityStatuses = new Set<string>();
  const candidateRowsByMember = new Map<string, MemberCandidate[]>();
  for (const candidate of candidates.results) candidateRowsByMember.set(candidate.memberId, [...(candidateRowsByMember.get(candidate.memberId) ?? []), candidate]);
  for (const rows of candidateRowsByMember.values()) {
    const member = rows[0];
    if (!member.birthDate || member.gender !== "male") continue;
    for (const dueDate of meetingDates) {
      if (ageAtDate(member.birthDate, dueDate) < 18 || !activeAt(member.membershipStartsAt, member.membershipEndsAt, dueDate)
        || !activeAt(member.officeStartsAt, member.officeEndsAt, dueDate) || !activeAt(member.memberJoinedAt, member.memberLeftAt, dueDate)) continue;
      if (!rows.some((row) => row.activityStatus && row.activityStartsAt && activeAt(row.activityStartsAt, row.activityEndsAt, dueDate))) {
        missingActivityStatuses.add(`${member.firstName} ${member.lastName}`); break;
      }
    }
  }
  if (missingActivityStatuses.size) {
    return invalid(context, `Statut d’activité manquant pour : ${[...missingActivityStatuses].slice(0, 5).join(", ")}. Indiquez travaille ou ne travaille pas avant de générer.`, 409);
  }

  const existingRows = await context.env.DB.prepare(
    `SELECT member_id AS memberId, due_date AS dueDate, contribution_kind AS contributionKind
       FROM contribution_dues WHERE due_date BETWEEN ? AND ? AND office_id = ? AND member_id IS NOT NULL`,
  ).bind(`${year}-01-01`, `${year}-12-31`, chosenOffice.id)
    .all<{ memberId: string; dueDate: string; contributionKind: string }>();
  const existing = new Set(existingRows.results.map((row) => `${row.memberId}:${row.dueDate}:${row.contributionKind}`));
  const createdKeys = new Set<string>();
  const today = todayInParis();
  const dueStatements: D1PreparedStatement[] = [];
  let skippedDueCount = 0;
  const addDue = (candidate: MemberCandidate, dueDate: string, kind: "annual_repatriation" | "quarterly_working_man", ruleId: string, amount: number, age: number, working: boolean) => {
    const key = `${candidate.memberId}:${dueDate}:${kind}`;
    if (createdKeys.has(key)) return;
    createdKeys.add(key);
    if (existing.has(key)) { skippedDueCount += 1; return; }
    dueStatements.push(context.env.DB.prepare(
      `INSERT OR IGNORE INTO contribution_dues
        (id, household_id, office_id, member_id, rule_id, due_date, contribution_kind,
         expected_amount_cents, child_count_snapshot, age_snapshot, working_snapshot,
         paid_amount_cents, status, source, verified_at, verified_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, 'system', CURRENT_TIMESTAMP, ?)`,
    ).bind(crypto.randomUUID(), candidate.householdId, chosenOffice.id, candidate.memberId, ruleId, dueDate, kind,
      amount, age, working ? 1 : 0, dueDate < today ? "overdue" : "upcoming", office.access.profile.id));
  };

  const memberById = new Map<string, MemberCandidate>();
  for (const candidate of candidates.results) if (!memberById.has(candidate.memberId)) memberById.set(candidate.memberId, candidate);
  for (const candidate of memberById.values()) {
    if (!candidate.birthDate || !activeAt(candidate.membershipStartsAt, candidate.membershipEndsAt, firstMeetingDate)
      || !activeAt(candidate.officeStartsAt, candidate.officeEndsAt, firstMeetingDate)
      || !activeAt(candidate.memberJoinedAt, candidate.memberLeftAt, firstMeetingDate)) continue;
    const age = ageAtDate(candidate.birthDate, firstMeetingDate);
    const amount = age < repatriation.childMaxAge ? repatriation.childAmountCents
      : candidate.gender === "female" ? repatriation.femaleAmountCents : repatriation.baseAmountCents;
    addDue(candidate, firstMeetingDate, "annual_repatriation", repatriation.id, amount, age, false);
  }
  for (const candidate of candidates.results) {
    if (!candidate.birthDate || candidate.gender !== "male") continue;
    for (const dueDate of meetingDates) {
      if (!activeAt(candidate.membershipStartsAt, candidate.membershipEndsAt, dueDate)
        || !activeAt(candidate.officeStartsAt, candidate.officeEndsAt, dueDate)
        || !activeAt(candidate.memberJoinedAt, candidate.memberLeftAt, dueDate)) continue;
      const age = ageAtDate(candidate.birthDate, dueDate);
      if (age >= 18 && isWorkingAt(candidate, dueDate)) {
        addDue(candidate, dueDate, "quarterly_working_man", workingMan.id, workingMan.baseAmountCents, age, true);
      }
    }
  }

  const existingMeetings = await context.env.DB.prepare(
    "SELECT meeting_date AS meetingDate FROM association_meetings WHERE year = ? AND office_id = ?",
  ).bind(year, chosenOffice.id).all<{ meetingDate: string }>();
  const existingMeetingDates = new Set(existingMeetings.results.map((row) => row.meetingDate));
  const meetingStatements = meetingDates.filter((date) => !existingMeetingDates.has(date)).map((meetingDate) => {
    const month = Number(meetingDate.slice(5, 7));
    return context.env.DB.prepare(
      `INSERT OR IGNORE INTO association_meetings
        (id, office_id, meeting_date, year, month_number, label, status, source, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', 'system', ?)`,
    ).bind(crypto.randomUUID(), chosenOffice.id, meetingDate, year, month, `Réunion trimestrielle — ${chosenOffice.name}`, office.access.profile.id);
  });
  await runBatches(context, meetingStatements);
  await runBatches(context, dueStatements);
  const runId = crypto.randomUUID();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO due_generation_runs
        (id, office_id, year, created_due_count, skipped_due_count, created_meeting_count, created_by, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(runId, chosenOffice.id, year, dueStatements.length, skippedDueCount, meetingStatements.length, office.access.profile.id, reason),
    context.env.DB.prepare(
      `INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, new_values)
       VALUES (?, ?, 'calendar.dues_generated', 'due_generation_run', ?, ?)`,
    ).bind(crypto.randomUUID(), office.access.profile.id, runId, JSON.stringify({ year, officeId: chosenOffice.id,
      createdDueCount: dueStatements.length, skippedDueCount, createdMeetingCount: meetingStatements.length, reason,
      policy: "annual_repatriation_and_quarterly_working_men" })),
  ]);
  return context.json({ ok: true, year, officeId: chosenOffice.id, createdDueCount: dueStatements.length,
    skippedDueCount, createdMeetingCount: meetingStatements.length, meetingDates } satisfies GenerationResult, 201);
}
