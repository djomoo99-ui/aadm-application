import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const moduleFiles = (await readdir("dist/aadm_app", { recursive: true })).filter((path) => path.endsWith(".js"))
  .map((path) => `dist/aadm_app/${path}`).sort((left) => left.endsWith("/index.js") ? -1 : 1);
const mf = new Miniflare({ compatibilityDate: "2026-07-15", compatibilityFlags: ["nodejs_compat"], modules: moduleFiles.map((path) => ({ type: "ESModule", path })), d1Databases: { DB: "aadm-lot14-test" }, bindings: { APP_ENV: "test", AUTH_SECRET: "0123456789abcdef0123456789abcdef", QR_TOKEN_SECRET: "abcdef0123456789abcdef0123456789" } });
const db = await mf.getD1Database("DB");
async function executeSqlFile(path, separator) { for (const statement of (await readFile(path, "utf8")).split(separator).map((value) => value.trim()).filter(Boolean)) await db.prepare(statement.replace(/;\s*$/, "")).run(); }
for (const migration of (await readdir("src/db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await executeSqlFile(`src/db/migrations/${migration}`, /--> statement-breakpoint/);
await executeSqlFile("src/db/seed/demo.sql", /;\s*(?:\r?\n|$)/);
function assert(condition, message) { if (!condition) throw new Error(`ÉCHEC: ${message}`); }
async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await mf.dispatchFetch(`http://aadm.test${path}`, { method, headers: { "CF-Connecting-IP": "127.0.0.1", ...(body ? { "Content-Type": "application/json", Origin: "http://aadm.test" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, payload: await response.json().catch(() => ({})), setCookie: response.headers.get("set-cookie") };
}
let sequence = 0;
async function createAccount(label, email, memberNumber, roleId) {
  sequence += 1; let result = await request("/api/auth/sign-up/email", { method: "POST", body: { name: label, email, password: "MotDePasse-2026!", phone: `+3361414000${sequence}`, memberNumber } }); assert(result.status === 200, `inscription ${label}`);
  const user = await db.prepare("SELECT id FROM auth_user WHERE email = ?").bind(email).first();
  const profile = await db.prepare("SELECT id FROM profiles WHERE auth_user_id = ?").bind(user.id).first();
  await db.batch([db.prepare("UPDATE profiles SET status = 'active' WHERE id = ?").bind(profile.id), db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, ?)").bind(profile.id, roleId)]);
  result = await request("/api/auth/sign-in/email", { method: "POST", body: { email, password: "MotDePasse-2026!" } }); assert(result.status === 200 && result.setCookie, `connexion ${label}`);
  return { profileId: profile.id, cookie: result.setCookie.split(";")[0] };
}
const admin = await createAccount("Administrateur Alertes", "admin-lot14@example.test", "ADM-014", "role_admin");
await db.prepare("UPDATE profiles SET central_access = 1 WHERE id = ?").bind(admin.profileId).run();
const controller = await createAccount("Contrôleur Alertes", "controller-lot14@example.test", "CTL-014", "role_controller");
await db.prepare("UPDATE profiles SET central_access = 1 WHERE id = ?").bind(controller.profileId).run();
const member = await createAccount("Membre Alertes", "member-lot14@example.test", "MEM-014", "role_member");
const upcomingDate = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
await db.batch([
  db.prepare(`INSERT INTO households (id, name, joined_at, status) VALUES ('household_alert_missing', 'Foyer Sans Contact', '2021-01-01', 'active')`),
  db.prepare(`INSERT INTO members (id, member_number, first_name, last_name, gender, joined_at, status) VALUES ('member_alert_birth', 'ALERT-BIRTH', 'Date', 'Manquante', 'female', '2021-01-01', 'active')`),
  db.prepare(`INSERT INTO members (id, member_number, first_name, last_name, gender, birth_date, joined_at, status) VALUES ('member_alert_activity', 'ALERT-ACTIVITY', 'Activité', 'Manquante', 'male', '1980-01-01', '2021-01-01', 'active')`),
  db.prepare(`INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at) VALUES ('membership_alert_birth', 'household_alert_missing', 'member_alert_birth', 'head', '2021-01-01')`),
  db.prepare(`INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at) VALUES ('membership_alert_activity', 'household_alert_missing', 'member_alert_activity', 'partner', '2021-01-01')`),
  db.prepare(`INSERT INTO households (id, name, phone, joined_at, status) VALUES ('household_alert_verify', 'Foyer À Confirmer', '+33600001414', '2021-01-01', 'to_verify')`),
  db.prepare(`UPDATE contribution_dues SET status = 'to_verify' WHERE id = 'due_demo_2026_06'`),
  db.prepare(`INSERT INTO payments (id, receipt_number, household_id, amount_cents, unallocated_amount_cents, payment_date, status, recorded_by, idempotency_key) VALUES ('payment_alert_imbalance', 'AADM-ALERT-014', 'household_demo_sidibe', 1000, 0, '2026-08-01', 'posted', ?, '00000000-0000-4000-8000-000000000014')`).bind(admin.profileId),
  db.prepare(`INSERT INTO association_meetings (id, meeting_date, year, month_number, label, status) VALUES ('meeting_alert_upcoming', ?, ?, ?, 'Réunion de contrôle', 'scheduled')`).bind(upcomingDate, Number(upcomingDate.slice(0, 4)), Number(upcomingDate.slice(5, 7))),
]);

let result = await request("/api/office/alerts/scan", { method: "POST", cookie: member.cookie, body: { reason: "Contrôle non autorisé" } });
assert(result.status === 403, "contrôle interdit au simple membre");
result = await request("/api/office/alerts/scan", { method: "POST", cookie: controller.cookie, body: { reason: "Non" } });
assert(result.status === 400, "raison trop courte refusée");
result = await request("/api/office/alerts/scan", { method: "POST", cookie: controller.cookie, body: { reason: "Contrôle complet du lot 14" } });
assert(result.status === 201 && result.payload.detectedCount >= 8 && result.payload.openedCount === result.payload.detectedCount, "détection initiale et création des alertes");
const initialCount = (await db.prepare("SELECT COUNT(*) AS count FROM office_alerts").first()).count;
const types = (await db.prepare("SELECT DISTINCT type FROM office_alerts").all()).results.map((row) => row.type);
for (const type of ["pending_access", "household_to_verify", "due_to_verify", "missing_birth_date", "missing_activity_status", "missing_phone", "payment_imbalance", "upcoming_meeting"]) assert(types.includes(type), `type ${type} détecté`);
result = await request("/api/office/alerts?status=open", { cookie: admin.cookie });
assert(result.status === 200 && result.payload.summary.critical >= 2 && result.payload.items.length === initialCount, "liste, résumé et alertes critiques visibles");
result = await request("/api/office/alerts/scan", { method: "POST", cookie: admin.cookie, body: { reason: "Second contrôle sans doublon" } });
assert(result.status === 201 && result.payload.openedCount === 0, "second contrôle sans nouvelle alerte");
const stableCount = (await db.prepare("SELECT COUNT(*) AS count FROM office_alerts").first()).count;
assert(stableCount === initialCount, "empreintes uniques sans doublon");

const paymentAlert = await db.prepare("SELECT id FROM office_alerts WHERE type = 'payment_imbalance'").first();
result = await request(`/api/office/alerts/${paymentAlert.id}`, { method: "PATCH", cookie: controller.cookie, body: { status: "resolved", note: "Reçu vérifié manuellement" } });
assert(result.status === 200, "alerte classée résolue par le contrôleur");
result = await request("/api/office/alerts/scan", { method: "POST", cookie: admin.cookie, body: { reason: "Vérification de la résolution manuelle" } });
assert(result.status === 201 && result.payload.reopenedCount >= 1, "anomalie persistante rouverte automatiquement");
const reopened = await db.prepare("SELECT status FROM office_alerts WHERE id = ?").bind(paymentAlert.id).first();
assert(reopened.status === "open", "alerte de paiement réellement rouverte");
await db.prepare("UPDATE payments SET unallocated_amount_cents = 1000 WHERE id = 'payment_alert_imbalance'").run();
result = await request("/api/office/alerts/scan", { method: "POST", cookie: controller.cookie, body: { reason: "Contrôle après correction comptable" } });
assert(result.status === 201 && result.payload.autoResolvedCount >= 1, "correction réelle résolue automatiquement");
const resolved = await db.prepare("SELECT status, resolution_note AS note FROM office_alerts WHERE id = ?").bind(paymentAlert.id).first();
assert(resolved.status === "resolved" && resolved.note.includes("automatiquement"), "trace de résolution automatique conservée");
result = await request("/api/office/alerts?status=resolved&severity=critical", { cookie: controller.cookie });
assert(result.status === 200 && result.payload.items.some((item) => item.id === paymentAlert.id), "filtres d’état et de gravité fonctionnels");
const checks = await db.prepare(`SELECT (SELECT COUNT(*) FROM alert_scan_runs) AS runs, (SELECT COUNT(*) FROM audit_logs WHERE action = 'alerts.scan_completed') AS scanAudits, (SELECT COUNT(*) FROM audit_logs WHERE action = 'alerts.status_updated') AS statusAudits`).first();
assert(checks.runs === 4 && checks.scanAudits === 4 && checks.statusAudits === 1, "contrôles et traitement journalisés");
console.log(JSON.stringify({ ok: true, statuses: { memberScan: 403, shortReason: 400, firstScan: 201, list: 200, update: 200 }, detectedTypes: types.sort(), initialCount, stableCount, reopened: true, autoResolved: true, runs: checks.runs, scanAudits: checks.scanAudits, statusAudits: checks.statusAudits }, null, 2));
await mf.dispose();
