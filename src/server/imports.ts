import type { Context } from "hono";
import { z } from "zod";

import type { AuthBindings } from "../auth";
import { hmacSha256, sha256 } from "../security";
import { todayInParis } from "../shared/date";
import type { ImportActivityRow, ImportAnalysis, ImportContributionRow, ImportIssue, ImportMemberRow, ImportWorkbookData } from "../shared/imports";
import { nthWeekday } from "./calendar";
import { requireOffice } from "./payments";

type AppContext = Context<{ Bindings: AuthBindings }>;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const memberSchema = z.object({
  rowNumber: z.number().int().min(2), householdCode: z.string().trim().toUpperCase().min(2).max(30).regex(/^[A-Z0-9_-]+$/),
  householdName: z.string().trim().min(2).max(100), memberNumber: z.string().trim().toUpperCase().min(1).max(30).regex(/^[A-Z0-9_-]+$/),
  firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80),
  gender: z.enum(["male", "female", "unspecified"]), relationship: z.enum(["head", "partner", "child"]),
  birthDate: dateSchema.optional(), phone: z.string().trim().max(25).regex(/^\+?[0-9 ]{8,25}$/).optional(), joinedAt: dateSchema,
});
const activitySchema = z.object({ rowNumber: z.number().int().min(2), memberNumber: z.string().trim().toUpperCase().min(1).max(30),
  status: z.enum(["working", "not_working"]), startsAt: dateSchema, endsAt: dateSchema.optional(), note: z.string().trim().max(300).optional() });
const contributionSchema = z.object({ rowNumber: z.number().int().min(2), memberNumber: z.string().trim().toUpperCase().min(1).max(30),
  contributionKind: z.enum(["annual_repatriation", "quarterly_working_man"]), dueDate: dateSchema,
  expectedAmountCents: z.number().int().min(1).max(1_000_000), paidAmountCents: z.number().int().min(0).max(1_000_000),
  source: z.enum(["excel", "notebook"]), note: z.string().trim().max(300).optional() });
const workbookSchema = z.object({ fileName: z.string().trim().min(5).max(120).regex(/\.xlsx$/i), members: z.array(memberSchema).max(1_000),
  activities: z.array(activitySchema).max(5_000), contributions: z.array(contributionSchema).max(5_000) }).superRefine((value, context) => {
  const total = value.members.length + value.activities.length + value.contributions.length;
  if (!total) context.addIssue({ code: "custom", message: "Le fichier ne contient aucune ligne." });
  if (total > 5_000) context.addIssue({ code: "custom", message: "Un import est limité à 5 000 lignes." });
});
const confirmationSchema = workbookSchema.safeExtend({ analysisToken: z.string().min(70).max(200) });

type ExistingHousehold = { id: string; importCode: string; name: string; phone: string | null };
type ExistingMember = { id: string; memberNumber: string; gender: ImportMemberRow["gender"]; birthDate: string | null; joinedAt: string; householdId: string | null };
type PlannedHousehold = { id: string; importCode: string; name: string; phone: string | null; joinedAt: string };
type PlannedMember = ImportMemberRow & { id: string; householdId: string };
type MemberInfo = { id: string; gender: ImportMemberRow["gender"]; birthDate: string | null; joinedAt: string; householdId: string };
type PlannedActivity = ImportActivityRow & { id: string; memberId: string };
type PlannedDue = ImportContributionRow & { id: string; memberId: string; householdId: string; ruleId: string; status: string; ageSnapshot: number; workingSnapshot: number };
type ImportPlan = { analysis: ImportAnalysis; householdCodeUpdates: Array<{ id: string; importCode: string }>; households: PlannedHousehold[];
  members: PlannedMember[]; activities: PlannedActivity[]; dues: PlannedDue[] };

function isValidDate(value: string) { const date = new Date(`${value}T12:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
function ageAtDate(birthDate: string, date: string) { const [by, bm, bd] = birthDate.split("-").map(Number); const [y, m, d] = date.split("-").map(Number); return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0); }
function eighteenthBirthday(birthDate: string) { const date = new Date(`${birthDate}T12:00:00Z`); date.setUTCFullYear(date.getUTCFullYear() + 18); return date.toISOString().slice(0, 10); }
function activeAt(startsAt: string, endsAt: string | undefined | null, date: string) { return startsAt <= date && (!endsAt || endsAt >= date); }
function overlaps(left: { startsAt: string; endsAt?: string | null }, right: { startsAt: string; endsAt?: string | null }) { return left.startsAt <= (right.endsAt ?? "9999-12-31") && right.startsAt <= (left.endsAt ?? "9999-12-31"); }
function constantTimeEqual(left: string, right: string) { if (left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }

async function buildPlan(context: AppContext, data: ImportWorkbookData, officeId: string): Promise<ImportPlan> {
  const errors: ImportIssue[] = []; const warnings: ImportIssue[] = []; const today = todayInParis();
  const groups = new Map<string, ImportMemberRow[]>(); const inputMemberNumbers = new Set<string>();
  for (const member of data.members) {
    if (!isValidDate(member.joinedAt) || member.joinedAt < "2004-01-01" || member.joinedAt > today) errors.push({ sheet: "Foyers_Membres", rowNumber: member.rowNumber, message: "La date d’adhésion doit être comprise entre 2004 et aujourd’hui." });
    if (!member.birthDate || !isValidDate(member.birthDate) || member.birthDate > today) errors.push({ sheet: "Foyers_Membres", rowNumber: member.rowNumber, message: "La date de naissance est obligatoire et doit être valide." });
    if (inputMemberNumbers.has(member.memberNumber)) errors.push({ sheet: "Foyers_Membres", rowNumber: member.rowNumber, message: `Le numéro ${member.memberNumber} apparaît plusieurs fois.` });
    inputMemberNumbers.add(member.memberNumber); groups.set(member.householdCode, [...(groups.get(member.householdCode) ?? []), member]);
  }
  for (const [code, rows] of groups) {
    if (new Set(rows.map((row) => row.householdName)).size > 1) errors.push({ sheet: "Foyers_Membres", rowNumber: rows[0].rowNumber, message: `Le foyer ${code} possède plusieurs noms.` });
    if (rows.filter((row) => row.relationship === "head").length !== 1) errors.push({ sheet: "Foyers_Membres", rowNumber: rows[0].rowNumber, message: `Le foyer ${code} doit avoir exactement un responsable.` });
  }
  const referencedNumbers = [...new Set([...inputMemberNumbers, ...data.activities.map((row) => row.memberNumber), ...data.contributions.map((row) => row.memberNumber)])];
  const [householdsResult, membersResult, office] = await Promise.all([
    groups.size ? context.env.DB.prepare("SELECT id, import_code AS importCode, name, phone FROM households WHERE import_code IN (SELECT value FROM json_each(?))").bind(JSON.stringify([...groups.keys()])).all<ExistingHousehold>() : Promise.resolve({ results: [] as ExistingHousehold[] }),
    referencedNumbers.length ? context.env.DB.prepare(`SELECT m.id, m.member_number AS memberNumber, m.gender, m.birth_date AS birthDate, m.joined_at AS joinedAt, hm.household_id AS householdId
      FROM members m LEFT JOIN household_memberships hm ON hm.member_id = m.id AND hm.ends_at IS NULL WHERE m.member_number IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(referencedNumbers)).all<ExistingMember>() : Promise.resolve({ results: [] as ExistingMember[] }),
    context.env.DB.prepare("SELECT meeting_ordinal AS meetingOrdinal, meeting_weekday AS meetingWeekday FROM offices WHERE id = ?").bind(officeId).first<{ meetingOrdinal: number; meetingWeekday: number }>(),
  ]);
  if (!office) errors.push({ sheet: "Fichier", message: "Le calendrier du bureau est introuvable." });
  const householdByCode = new Map(householdsResult.results.map((row) => [row.importCode, row]));
  const existingMemberByNumber = new Map(membersResult.results.map((row) => [row.memberNumber, row]));
  const householdCodeUpdates: Array<{ id: string; importCode: string }> = []; const plannedHouseholds: PlannedHousehold[] = [];
  for (const [code, rows] of groups) {
    const linked = new Set(rows.map((row) => existingMemberByNumber.get(row.memberNumber)?.householdId).filter(Boolean) as string[]); let household = householdByCode.get(code);
    if (household && [...linked].some((id) => id !== household?.id)) { errors.push({ sheet: "Foyers_Membres", rowNumber: rows[0].rowNumber, message: `Le code ${code} est déjà utilisé par un autre foyer.` }); continue; }
    if (linked.size > 1) { errors.push({ sheet: "Foyers_Membres", rowNumber: rows[0].rowNumber, message: `Les membres du foyer ${code} sont déjà rattachés à plusieurs foyers.` }); continue; }
    if (!household && linked.size === 1) { const id = [...linked][0]; householdCodeUpdates.push({ id, importCode: code }); household = { id, importCode: code, name: rows[0].householdName, phone: null }; householdByCode.set(code, household); }
    else if (!household) { const head = rows.find((row) => row.relationship === "head") ?? rows[0]; const planned = { id: crypto.randomUUID(), importCode: code, name: head.householdName, phone: head.phone ?? null, joinedAt: rows.map((row) => row.joinedAt).sort()[0] }; plannedHouseholds.push(planned); householdByCode.set(code, planned); }
  }
  const plannedMembers: PlannedMember[] = []; const infoByNumber = new Map<string, MemberInfo>();
  for (const existing of membersResult.results) if (existing.householdId) infoByNumber.set(existing.memberNumber, { id: existing.id, gender: existing.gender, birthDate: existing.birthDate, joinedAt: existing.joinedAt, householdId: existing.householdId });
  for (const member of data.members) {
    const household = householdByCode.get(member.householdCode); if (!household) continue; const existing = existingMemberByNumber.get(member.memberNumber);
    if (existing) { warnings.push({ sheet: "Foyers_Membres", rowNumber: member.rowNumber, message: `${member.memberNumber} existe déjà : ses informations personnelles ne seront pas écrasées.` }); if (existing.householdId && existing.householdId !== household.id) errors.push({ sheet: "Foyers_Membres", rowNumber: member.rowNumber, message: `${member.memberNumber} appartient déjà à un autre foyer.` }); continue; }
    const planned = { ...member, id: crypto.randomUUID(), householdId: household.id }; plannedMembers.push(planned); infoByNumber.set(member.memberNumber, { id: planned.id, gender: member.gender, birthDate: member.birthDate ?? null, joinedAt: member.joinedAt, householdId: household.id });
  }
  const memberIds = [...infoByNumber.values()].map((row) => row.id);
  const existingActivities = memberIds.length ? await context.env.DB.prepare("SELECT member_id AS memberId, status, starts_at AS startsAt, ends_at AS endsAt FROM member_activity_periods WHERE member_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(memberIds)).all<{ memberId: string; status: string; startsAt: string; endsAt: string | null }>() : { results: [] };
  const activityByMember = new Map<string, Array<{ startsAt: string; endsAt?: string | null; status: "working" | "not_working" }>>();
  for (const row of existingActivities.results) activityByMember.set(row.memberId, [...(activityByMember.get(row.memberId) ?? []), { ...row, status: row.status as "working" | "not_working" }]);
  const plannedActivities: PlannedActivity[] = [];
  for (const activity of data.activities) {
    const member = infoByNumber.get(activity.memberNumber); if (!member) { errors.push({ sheet: "Activites", rowNumber: activity.rowNumber, message: `Le membre ${activity.memberNumber} est inconnu.` }); continue; }
    if (member.gender !== "male") errors.push({ sheet: "Activites", rowNumber: activity.rowNumber, message: "Une période d’activité ne peut être importée que pour un homme." });
    if (!member.birthDate) errors.push({ sheet: "Activites", rowNumber: activity.rowNumber, message: "La date de naissance du membre est obligatoire." });
    if (!isValidDate(activity.startsAt) || activity.startsAt < "2021-01-01" || activity.startsAt > today || (activity.endsAt && (!isValidDate(activity.endsAt) || activity.endsAt < activity.startsAt))) errors.push({ sheet: "Activites", rowNumber: activity.rowNumber, message: "La période doit être valide et commencer entre 2021 et aujourd’hui." });
    if (activity.startsAt < member.joinedAt || (member.birthDate && activity.startsAt < eighteenthBirthday(member.birthDate))) errors.push({ sheet: "Activites", rowNumber: activity.rowNumber, message: "L’activité ne peut pas commencer avant l’adhésion ni avant 18 ans." });
    const periods = activityByMember.get(member.id) ?? [];
    if (periods.some((period) => overlaps(period, activity))) errors.push({ sheet: "Activites", rowNumber: activity.rowNumber, message: "Cette période chevauche une période existante ou une autre ligne." });
    else { periods.push(activity); activityByMember.set(member.id, periods); plannedActivities.push({ ...activity, id: crypto.randomUUID(), memberId: member.id }); }
  }
  const existingDues = memberIds.length && data.contributions.length ? await context.env.DB.prepare(`SELECT member_id AS memberId, due_date AS dueDate, contribution_kind AS contributionKind, expected_amount_cents AS expectedAmountCents, paid_amount_cents AS paidAmountCents FROM contribution_dues WHERE member_id IN (SELECT value FROM json_each(?)) AND due_date IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(memberIds), JSON.stringify(data.contributions.map((row) => row.dueDate))).all<{ memberId: string; dueDate: string; contributionKind: string; expectedAmountCents: number; paidAmountCents: number }>() : { results: [] };
  const existingDueByKey = new Map(existingDues.results.map((row) => [`${row.memberId}:${row.dueDate}:${row.contributionKind}`, row])); const dueKeys = new Set<string>(); const plannedDues: PlannedDue[] = [];
  for (const due of data.contributions) {
    const member = infoByNumber.get(due.memberNumber); if (!member) { errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: `Le membre ${due.memberNumber} est inconnu.` }); continue; }
    if (!isValidDate(due.dueDate) || due.dueDate < "2021-01-01" || due.dueDate > today) { errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: "La date doit être comprise entre 2021 et aujourd’hui." }); continue; }
    const year = Number(due.dueDate.slice(0, 4)); const meetingDates = office ? [3, 6, 9, 12].map((month) => nthWeekday(year, month, office.meetingOrdinal, office.meetingWeekday)) : [];
    const age = member.birthDate ? ageAtDate(member.birthDate, due.dueDate) : -1;
    const expected = due.contributionKind === "annual_repatriation" ? (age < 18 ? 1_000 : member.gender === "female" ? 2_000 : 6_000) : 2_000;
    if (due.contributionKind === "annual_repatriation" && age >= 18 && member.gender === "unspecified") errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: "Le sexe doit être renseigné pour appliquer le tarif adulte de rapatriement." });
    if (due.contributionKind === "annual_repatriation" && due.dueDate !== meetingDates[0]) errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: "La caisse de rapatriement est exigible à la première réunion de l’année du bureau." });
    if (due.contributionKind === "quarterly_working_man" && !meetingDates.includes(due.dueDate)) errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: "La date ne correspond pas à une réunion trimestrielle de ce bureau." });
    const working = (activityByMember.get(member.id) ?? []).some((period) => period.status === "working" && activeAt(period.startsAt, period.endsAt, due.dueDate));
    if (due.contributionKind === "quarterly_working_man" && (member.gender !== "male" || age < 18 || !working)) errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: "La cotisation trimestrielle exige un homme adulte avec une activité rémunérée à cette date." });
    if (due.expectedAmountCents !== expected) errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: `Le montant attendu doit être de ${expected / 100} € selon le barème officiel.` });
    if (due.paidAmountCents > due.expectedAmountCents) errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: "Le montant payé ne peut pas dépasser le montant attendu." });
    if (due.contributionKind === "annual_repatriation" && due.paidAmountCents > 0 && due.paidAmountCents < due.expectedAmountCents) errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: "La cotisation annuelle de rapatriement doit être payée intégralement en une seule fois." });
    const key = `${member.id}:${due.dueDate}:${due.contributionKind}`; if (dueKeys.has(key)) { errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: "Cette cotisation apparaît plusieurs fois pour ce membre." }); continue; } dueKeys.add(key);
    const existing = existingDueByKey.get(key); if (existing) { if (existing.expectedAmountCents === due.expectedAmountCents && existing.paidAmountCents === due.paidAmountCents) warnings.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: "Cette cotisation existe déjà avec les mêmes montants : elle sera ignorée." }); else errors.push({ sheet: "Cotisations", rowNumber: due.rowNumber, message: "Cette cotisation existe déjà avec des montants différents." }); continue; }
    plannedDues.push({ ...due, id: crypto.randomUUID(), memberId: member.id, householdId: member.householdId, ruleId: due.contributionKind === "annual_repatriation" ? "rule_aadm_repatriation_2021" : "rule_aadm_working_man_2021", status: due.paidAmountCents >= due.expectedAmountCents ? "paid" : due.paidAmountCents > 0 ? "partial" : "overdue", ageSnapshot: age, workingSnapshot: working ? 1 : 0 });
  }
  const summary = { inputMembers: data.members.length, inputActivities: data.activities.length, inputContributions: data.contributions.length, newHouseholds: plannedHouseholds.length, newMembers: plannedMembers.length, newActivities: plannedActivities.length, newContributions: plannedDues.length, skippedRows: warnings.length };
  return { analysis: { canConfirm: errors.length === 0 && (plannedHouseholds.length + plannedMembers.length + plannedActivities.length + plannedDues.length + householdCodeUpdates.length > 0), analysisToken: null, summary, errors: errors.slice(0, 100), warnings: warnings.slice(0, 100) }, householdCodeUpdates, households: plannedHouseholds, members: plannedMembers, activities: plannedActivities, dues: plannedDues };
}

async function createAnalysisToken(data: ImportWorkbookData, secret: string) { const expiresAt = Date.now() + 30 * 60 * 1_000; const digest = await sha256(JSON.stringify(data)); return `${expiresAt}.${await hmacSha256(`${expiresAt}:${digest}`, secret)}`; }
async function verifyAnalysisToken(data: ImportWorkbookData, token: string, secret: string) { const separator = token.indexOf("."); if (separator < 1) return false; const expiresAt = Number(token.slice(0, separator)); const supplied = token.slice(separator + 1); if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false; const digest = await sha256(JSON.stringify(data)); return constantTimeEqual(supplied, await hmacSha256(`${expiresAt}:${digest}`, secret)); }

export async function analyzeWorkbookImport(context: AppContext) {
  const office = await requireOffice(context, ["admin"]); if ("error" in office) return office.error; if (!office.access.profile.centralAccess) return context.json({ error: "FORBIDDEN", message: "Les imports historiques sont réservés au bureau central." }, 403);
  const parsed = workbookSchema.safeParse(await context.req.json().catch(() => null)); if (!parsed.success) return context.json({ error: "INVALID_IMPORT", message: parsed.error.issues[0]?.message ?? "Le fichier n’est pas valide." }, 400);
  const plan = await buildPlan(context, parsed.data, office.access.profile.officeId); if (plan.analysis.canConfirm) plan.analysis.analysisToken = await createAnalysisToken(parsed.data, context.env.QR_TOKEN_SECRET); return context.json(plan.analysis);
}

export async function confirmWorkbookImport(context: AppContext) {
  const office = await requireOffice(context, ["admin"]); if ("error" in office) return office.error; if (!office.access.profile.centralAccess) return context.json({ error: "FORBIDDEN", message: "Les imports historiques sont réservés au bureau central." }, 403);
  const parsed = confirmationSchema.safeParse(await context.req.json().catch(() => null)); if (!parsed.success) return context.json({ error: "INVALID_IMPORT", message: "Les données de confirmation sont invalides." }, 400);
  const { analysisToken, ...data } = parsed.data; if (!await verifyAnalysisToken(data, analysisToken, context.env.QR_TOKEN_SECRET)) return context.json({ error: "ANALYSIS_EXPIRED", message: "L’analyse a expiré ou le fichier a changé. Analysez-le à nouveau." }, 409);
  const plan = await buildPlan(context, data, office.access.profile.officeId); if (!plan.analysis.canConfirm || plan.analysis.errors.length) return context.json({ error: "IMPORT_CHANGED", message: "Les données ont changé depuis l’analyse. Aucun élément n’a été importé.", analysis: plan.analysis }, 409);
  const importId = crypto.randomUUID(); const memberJson = JSON.stringify(plan.members); const householdJson = JSON.stringify(plan.households); const updateJson = JSON.stringify(plan.householdCodeUpdates); const activityJson = JSON.stringify(plan.activities); const dueJson = JSON.stringify(plan.dues);
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare("WITH mappings AS (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.importCode') AS importCode FROM json_each(?)) UPDATE households SET import_code = (SELECT importCode FROM mappings WHERE mappings.id = households.id), updated_at = CURRENT_TIMESTAMP WHERE import_code IS NULL AND id IN (SELECT id FROM mappings)").bind(updateJson),
    context.env.DB.prepare("INSERT INTO households (id, office_id, import_code, name, phone, joined_at, status) SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.importCode'), json_extract(value, '$.name'), json_extract(value, '$.phone'), json_extract(value, '$.joinedAt'), 'active' FROM json_each(?)").bind(office.access.profile.officeId, householdJson),
    context.env.DB.prepare("INSERT INTO household_office_assignments (id, household_id, office_id, starts_at, reason, changed_by) SELECT lower(hex(randomblob(16))), json_extract(value, '$.id'), ?, json_extract(value, '$.joinedAt'), 'Import historique AADM', ? FROM json_each(?)").bind(office.access.profile.officeId, office.access.profile.id, householdJson),
    context.env.DB.prepare("INSERT INTO members (id, member_number, first_name, last_name, gender, birth_date, phone, joined_at, status) SELECT json_extract(value, '$.id'), json_extract(value, '$.memberNumber'), json_extract(value, '$.firstName'), json_extract(value, '$.lastName'), json_extract(value, '$.gender'), json_extract(value, '$.birthDate'), json_extract(value, '$.phone'), json_extract(value, '$.joinedAt'), 'active' FROM json_each(?)").bind(memberJson),
    context.env.DB.prepare("INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at) SELECT lower(hex(randomblob(16))), json_extract(value, '$.householdId'), json_extract(value, '$.id'), json_extract(value, '$.relationship'), json_extract(value, '$.joinedAt') FROM json_each(?)").bind(memberJson),
    context.env.DB.prepare("INSERT INTO member_activity_periods (id, member_id, status, starts_at, ends_at, reason, changed_by) SELECT json_extract(value, '$.id'), json_extract(value, '$.memberId'), json_extract(value, '$.status'), json_extract(value, '$.startsAt'), json_extract(value, '$.endsAt'), COALESCE(json_extract(value, '$.note'), 'Import historique AADM'), ? FROM json_each(?)").bind(office.access.profile.id, activityJson),
    context.env.DB.prepare("INSERT INTO contribution_dues (id, household_id, office_id, member_id, rule_id, due_date, contribution_kind, expected_amount_cents, child_count_snapshot, age_snapshot, working_snapshot, paid_amount_cents, status, source, verified_at, verified_by) SELECT json_extract(value, '$.id'), json_extract(value, '$.householdId'), ?, json_extract(value, '$.memberId'), json_extract(value, '$.ruleId'), json_extract(value, '$.dueDate'), json_extract(value, '$.contributionKind'), json_extract(value, '$.expectedAmountCents'), 0, json_extract(value, '$.ageSnapshot'), json_extract(value, '$.workingSnapshot'), json_extract(value, '$.paidAmountCents'), json_extract(value, '$.status'), json_extract(value, '$.source'), CURRENT_TIMESTAMP, ? FROM json_each(?)").bind(office.access.profile.officeId, office.access.profile.id, dueJson),
    context.env.DB.prepare("INSERT INTO imports (id, file_name, status, total_rows, accepted_rows, rejected_rows, created_by) VALUES (?, ?, 'confirmed', ?, ?, 0, ?)").bind(importId, data.fileName, data.members.length + data.activities.length + data.contributions.length, plan.members.length + plan.activities.length + plan.dues.length, office.access.profile.id),
    context.env.DB.prepare("INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, new_values) VALUES (?, ?, 'import.confirmed', 'import', ?, ?)").bind(crypto.randomUUID(), office.access.profile.id, importId, JSON.stringify(plan.analysis.summary)),
  ];
  try { await context.env.DB.batch(statements); } catch (error) { console.error("workbook_import_failed", error instanceof Error ? error.message : "unknown"); return context.json({ error: "IMPORT_FAILED", message: "L’import a été annulé sans modifier la base. Analysez de nouveau le fichier." }, 409); }
  return context.json({ ok: true, importId, message: "L’historique a été importé avec succès.", summary: plan.analysis.summary }, 201);
}
