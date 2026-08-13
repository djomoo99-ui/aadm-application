import type { Context } from "hono";
import { z } from "zod";

import type { AuthBindings } from "../auth";
import type { OfficesData, OfficeItem } from "../shared/offices";
import { todayInParis } from "../shared/date";
import { requireOffice } from "./payments";

type AppContext = Context<{ Bindings: AuthBindings }>;
const officeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
  name: z.string().trim().min(3).max(100),
  city: z.string().trim().min(2).max(80).regex(/^[\p{L} '’.-]+$/u),
  meetingOrdinal: z.number().int().min(1).max(5),
  meetingWeekday: z.number().int().min(0).max(6),
});
const scheduleSchema = z.object({
  meetingOrdinal: z.number().int().min(1).max(5),
  meetingWeekday: z.number().int().min(0).max(6),
  status: z.enum(["active", "inactive"]),
  reason: z.string().trim().min(5).max(300),
});
const moveSchema = z.object({ officeId: z.string().min(3).max(80), startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().min(5).max(300) });
const responsibleSchema = z.object({ officeId: z.string().min(3).max(80), centralAccess: z.boolean().default(false), reason: z.string().trim().min(5).max(300) });

function invalid(context: AppContext, message: string, status: 400 | 403 | 404 | 409 = 400) {
  return context.json({ error: status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "INVALID_INPUT", message }, status);
}
function previousDay(value: string) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); }
async function centralAdmin(context: AppContext) {
  const office = await requireOffice(context, ["admin"]);
  if ("error" in office) return office;
  if (!office.access.profile.centralAccess) return { error: invalid(context, "Cette action est réservée au bureau central.", 403) };
  return office;
}

export async function listOffices(context: AppContext) {
  const office = await requireOffice(context, ["data_entry", "controller", "treasurer", "admin"]);
  if ("error" in office) return office.error;
  const rows = await context.env.DB.prepare(`SELECT o.id, o.code, o.name, o.city, o.kind, o.meeting_ordinal AS meetingOrdinal, o.meeting_weekday AS meetingWeekday, o.status, (SELECT COUNT(*) FROM households h WHERE h.office_id = o.id AND h.status <> 'inactive') AS householdCount, (SELECT COUNT(*) FROM profiles p WHERE p.office_id = o.id AND p.status = 'active' AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.profile_id = p.id AND ur.revoked_at IS NULL AND r.code <> 'member')) AS responsibleCount FROM offices o WHERE (? = 1 OR o.id = ?) ORDER BY CASE o.kind WHEN 'central' THEN 0 ELSE 1 END, o.city`).bind(office.access.profile.centralAccess ? 1 : 0, office.access.profile.officeId).all<OfficeItem>();
  const response: OfficesData = { offices: rows.results, currentOfficeId: office.access.profile.officeId, centralAccess: office.access.profile.centralAccess };
  return context.json(response);
}

export async function createOffice(context: AppContext) {
  const office = await centralAdmin(context); if ("error" in office) return office.error;
  const parsed = officeSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Vérifiez le code, la ville et la règle fixe de réunion.");
  const id = crypto.randomUUID();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(`INSERT INTO offices (id, code, name, city, kind, meeting_ordinal, meeting_weekday) VALUES (?, ?, ?, ?, 'local', ?, ?)`).bind(id, parsed.data.code, parsed.data.name, parsed.data.city, parsed.data.meetingOrdinal, parsed.data.meetingWeekday),
      context.env.DB.prepare(`INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, new_values) VALUES (?, ?, 'office.created', 'office', ?, ?)`).bind(crypto.randomUUID(), office.access.profile.id, id, JSON.stringify(parsed.data)),
    ]);
  } catch { return invalid(context, "Ce code de bureau existe déjà.", 409); }
  return context.json({ ok: true, officeId: id }, 201);
}

export async function updateOffice(context: AppContext) {
  const office = await centralAdmin(context); if ("error" in office) return office.error;
  const parsed = scheduleSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Vérifiez la règle de réunion et la raison.");
  const target = await context.env.DB.prepare(`SELECT id, kind, meeting_ordinal AS meetingOrdinal, meeting_weekday AS meetingWeekday, status FROM offices WHERE id = ?`).bind(context.req.param("id")).first<{ id: string; kind: string; meetingOrdinal: number; meetingWeekday: number; status: string }>();
  if (!target) return invalid(context, "Bureau introuvable.", 404);
  if (target.kind === "central" && parsed.data.status === "inactive") return invalid(context, "Le bureau central ne peut pas être désactivé.", 409);
  await context.env.DB.batch([
    context.env.DB.prepare(`UPDATE offices SET meeting_ordinal = ?, meeting_weekday = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(parsed.data.meetingOrdinal, parsed.data.meetingWeekday, parsed.data.status, target.id),
    context.env.DB.prepare(`INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, 'office.updated', 'office', ?, ?, ?)`).bind(crypto.randomUUID(), office.access.profile.id, target.id, JSON.stringify(target), JSON.stringify(parsed.data)),
  ]);
  return context.json({ ok: true });
}

export async function moveHouseholdOffice(context: AppContext) {
  const office = await centralAdmin(context); if ("error" in office) return office.error;
  const parsed = moveSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Choisissez le bureau, la date du changement et une raison.");
  const household = await context.env.DB.prepare(`SELECT h.id, h.office_id AS officeId, h.joined_at AS joinedAt,
    (SELECT starts_at FROM household_office_assignments hoa WHERE hoa.household_id = h.id AND hoa.ends_at IS NULL ORDER BY starts_at DESC LIMIT 1) AS currentOfficeStartsAt
    FROM households h WHERE h.id = ?`).bind(context.req.param("id")).first<{ id: string; officeId: string; joinedAt: string; currentOfficeStartsAt: string | null }>();
  const target = await context.env.DB.prepare(`SELECT id FROM offices WHERE id = ? AND status = 'active'`).bind(parsed.data.officeId).first();
  if (!household || !target) return invalid(context, "Le foyer ou le bureau est introuvable.", 404);
  if (household.officeId === parsed.data.officeId) return invalid(context, "Ce foyer est déjà rattaché à ce bureau.", 409);
  if (parsed.data.startsAt < household.joinedAt) return invalid(context, "La date de transfert ne peut pas précéder l’arrivée du foyer.");
  if (household.currentOfficeStartsAt && parsed.data.startsAt <= household.currentOfficeStartsAt) return invalid(context, "La date doit être postérieure au rattachement actuel.", 409);
  if (parsed.data.startsAt > todayInParis()) return invalid(context, "Un transfert futur devra être enregistré le jour de sa prise d’effet.");
  const paidFutureDue = await context.env.DB.prepare(`SELECT id FROM contribution_dues WHERE household_id = ? AND office_id = ? AND due_date >= ? AND paid_amount_cents > 0 LIMIT 1`).bind(household.id, household.officeId, parsed.data.startsAt).first();
  if (paidFutureDue) return invalid(context, "Une échéance postérieure au transfert a déjà été payée, même partiellement. Corrigez-la avec le trésorier avant le transfert.", 409);
  const superseded = await context.env.DB.prepare(`SELECT COUNT(*) AS count FROM contribution_dues WHERE household_id = ? AND office_id = ? AND due_date >= ? AND paid_amount_cents = 0 AND status <> 'exempt'`).bind(household.id, household.officeId, parsed.data.startsAt).first<{ count: number }>();
  await context.env.DB.batch([
    context.env.DB.prepare(`UPDATE contribution_dues SET status = 'exempt', updated_at = CURRENT_TIMESTAMP WHERE household_id = ? AND office_id = ? AND due_date >= ? AND paid_amount_cents = 0 AND status <> 'exempt'`).bind(household.id, household.officeId, parsed.data.startsAt),
    context.env.DB.prepare(`UPDATE household_office_assignments SET ends_at = ? WHERE household_id = ? AND ends_at IS NULL`).bind(previousDay(parsed.data.startsAt), household.id),
    context.env.DB.prepare(`INSERT INTO household_office_assignments (id, household_id, office_id, starts_at, reason, changed_by) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), household.id, parsed.data.officeId, parsed.data.startsAt, parsed.data.reason, office.access.profile.id),
    context.env.DB.prepare(`UPDATE households SET office_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(parsed.data.officeId, household.id),
    context.env.DB.prepare(`INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, 'household.office_changed', 'household', ?, ?, ?)`).bind(crypto.randomUUID(), office.access.profile.id, household.id, JSON.stringify({ officeId: household.officeId }), JSON.stringify({ ...parsed.data, supersededDueCount: superseded?.count ?? 0 })),
  ]);
  return context.json({ ok: true });
}

export async function assignResponsibleOffice(context: AppContext) {
  const office = await centralAdmin(context); if ("error" in office) return office.error;
  const parsed = responsibleSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return invalid(context, "Choisissez le bureau et indiquez une raison.");
  const targetOffice = await context.env.DB.prepare(`SELECT id, kind FROM offices WHERE id = ? AND status = 'active'`).bind(parsed.data.officeId).first<{ id: string; kind: string }>();
  const profile = await context.env.DB.prepare(`SELECT id, office_id AS officeId, central_access AS centralAccess FROM profiles WHERE id = ?`).bind(context.req.param("id")).first<{ id: string; officeId: string; centralAccess: number }>();
  if (!targetOffice || !profile) return invalid(context, "Le responsable ou le bureau est introuvable.", 404);
  if (profile.id === office.access.profile.id) return invalid(context, "Vous ne pouvez pas modifier votre propre rattachement central.", 409);
  if (parsed.data.centralAccess && targetOffice.kind !== "central") return invalid(context, "L’accès central doit être rattaché au bureau central.", 409);
  await context.env.DB.batch([
    context.env.DB.prepare(`UPDATE profiles SET office_id = ?, central_access = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(parsed.data.officeId, parsed.data.centralAccess ? 1 : 0, profile.id),
    context.env.DB.prepare(`INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, old_values, new_values) VALUES (?, ?, 'responsible.office_assigned', 'profile', ?, ?, ?)`).bind(crypto.randomUUID(), office.access.profile.id, profile.id, JSON.stringify(profile), JSON.stringify(parsed.data)),
  ]);
  return context.json({ ok: true });
}
