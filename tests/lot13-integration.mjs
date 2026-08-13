import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const moduleFiles = (await readdir("dist/aadm_app", { recursive: true })).filter((path) => path.endsWith(".js"))
  .map((path) => `dist/aadm_app/${path}`).sort((left) => left.endsWith("/index.js") ? -1 : 1);
const mf = new Miniflare({ compatibilityDate: "2026-07-15", compatibilityFlags: ["nodejs_compat"],
  modules: moduleFiles.map((path) => ({ type: "ESModule", path })), d1Databases: { DB: "aadm-lot13-test" },
  bindings: { APP_ENV: "test", AUTH_SECRET: "0123456789abcdef0123456789abcdef", QR_TOKEN_SECRET: "abcdef0123456789abcdef0123456789" } });
const db = await mf.getD1Database("DB");
async function executeSqlFile(path, separator) { for (const statement of (await readFile(path, "utf8")).split(separator).map((value) => value.trim()).filter(Boolean)) await db.prepare(statement.replace(/;\s*$/, "")).run(); }
for (const migration of (await readdir("src/db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await executeSqlFile(`src/db/migrations/${migration}`, /--> statement-breakpoint/);
await executeSqlFile("src/db/seed/demo.sql", /;\s*(?:\r?\n|$)/);
function assert(condition, message) { if (!condition) throw new Error(`ÉCHEC: ${message}`); }
async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await mf.dispatchFetch(`http://aadm.test${path}`, { method, headers: { "CF-Connecting-IP": "127.0.0.1",
    ...(body ? { "Content-Type": "application/json", Origin: "http://aadm.test" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, payload: await response.json().catch(() => ({})), setCookie: response.headers.get("set-cookie") };
}
let sequence = 0;
async function createAccount(label, email, memberNumber, roleId) {
  sequence += 1; let result = await request("/api/auth/sign-up/email", { method: "POST", body: { name: label, email,
    password: "MotDePasse-2026!", phone: `+3363333000${sequence}`, memberNumber } }); assert(result.status === 200, `inscription ${label}`);
  const user = await db.prepare("SELECT id FROM auth_user WHERE email = ?").bind(email).first();
  const profile = await db.prepare("SELECT id FROM profiles WHERE auth_user_id = ?").bind(user.id).first();
  await db.batch([db.prepare("UPDATE profiles SET status = 'active' WHERE id = ?").bind(profile.id), db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, ?)").bind(profile.id, roleId)]);
  result = await request("/api/auth/sign-in/email", { method: "POST", body: { email, password: "MotDePasse-2026!" } }); assert(result.status === 200 && result.setCookie, `connexion ${label}`);
  return { profileId: profile.id, cookie: result.setCookie.split(";")[0] };
}
const admin = await createAccount("Administrateur Calendrier", "admin-lot13@example.test", "ADM-013", "role_admin");
const controller = await createAccount("Contrôleur Calendrier", "controller-lot13@example.test", "CTL-013", "role_controller");
await db.batch([
  db.prepare(`INSERT INTO members (id, member_number, first_name, last_name, gender, birth_date, joined_at, status) VALUES ('child_always', 'ENF-013A', 'Aminata', 'Sidibé', 'female', '2015-01-01', '2021-01-01', 'active')`),
  db.prepare(`INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at) VALUES ('membership_child_always', 'household_demo_sidibe', 'child_always', 'child', '2021-01-01')`),
  db.prepare(`INSERT INTO members (id, member_number, first_name, last_name, gender, birth_date, joined_at, status) VALUES ('child_turns_18', 'ENF-013B', 'Moussa', 'Sidibé', 'male', '2009-04-01', '2021-01-01', 'active')`),
  db.prepare(`INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at) VALUES ('membership_child_turns_18', 'household_demo_sidibe', 'child_turns_18', 'child', '2021-01-01')`),
  db.prepare(`INSERT INTO member_activity_periods (id, member_id, status, starts_at, reason) VALUES ('activity_child_turns_18', 'child_turns_18', 'not_working', '2027-04-01', 'Situation connue à partir de 18 ans')`),
]);

let result = await request("/api/office/calendar?year=2027", { cookie: controller.cookie });
assert(result.status === 200 && result.payload.meetings.length === 0 && result.payload.rules.length >= 1, "calendrier et règles visibles au contrôleur");
result = await request("/api/office/calendar/generate", { method: "POST", cookie: controller.cookie, body: { year: 2027, confirmation: "GENERER LES ECHEANCES", reason: "Test interdit" } });
assert(result.status === 403, "génération interdite au contrôleur");
result = await request("/api/office/calendar/generate", { method: "POST", cookie: admin.cookie, body: { year: 2027, confirmation: "NON", reason: "Test confirmation" } });
assert(result.status === 400, "confirmation incorrecte refusée");
result = await request("/api/office/calendar/generate", { method: "POST", cookie: admin.cookie, body: { year: 2027, confirmation: "GENERER LES ECHEANCES", reason: "Préparation annuelle validée" } });
assert(result.status === 201 && result.payload.createdDueCount === 7 && result.payload.createdMeetingCount === 4, "réunions et échéances individuelles créées");
assert(JSON.stringify(result.payload.meetingDates) === JSON.stringify(["2027-03-14", "2027-06-13", "2027-09-12", "2027-12-12"]), "deuxièmes dimanches exacts");

const dues = await db.prepare("SELECT member_id AS memberId, due_date AS dueDate, contribution_kind AS kind, expected_amount_cents AS amount FROM contribution_dues WHERE household_id = 'household_demo_sidibe' AND due_date LIKE '2027-%' ORDER BY due_date, member_id, contribution_kind").all();
const marchTotal = dues.results.filter((due) => due.dueDate === '2027-03-14').reduce((sum, due) => sum + due.amount, 0);
assert(marchTotal === 10000 && dues.results.filter((due) => due.dueDate !== '2027-03-14').every((due) => due.amount === 2000), "rapatriement individuel puis cotisation trimestrielle");
await db.prepare("UPDATE contribution_dues SET expected_amount_cents = 9999 WHERE household_id = 'household_demo_sidibe' AND member_id = 'member_demo_adama' AND due_date = '2027-03-14' AND contribution_kind = 'annual_repatriation'").run();
result = await request("/api/office/calendar/generate", { method: "POST", cookie: admin.cookie, body: { year: 2027, confirmation: "GENERER LES ECHEANCES", reason: "Contrôle sans doublon" } });
assert(result.status === 201 && result.payload.createdDueCount === 0 && result.payload.skippedDueCount === 7 && result.payload.createdMeetingCount === 0, "seconde génération idempotente");
const preserved = await db.prepare("SELECT expected_amount_cents AS amount FROM contribution_dues WHERE household_id = 'household_demo_sidibe' AND member_id = 'member_demo_adama' AND due_date = '2027-03-14' AND contribution_kind = 'annual_repatriation'").first();
assert(preserved.amount === 9999, "montant historique existant jamais écrasé");

await db.batch([
  db.prepare(`INSERT INTO members (id, member_number, first_name, last_name, gender, birth_date, joined_at, status) VALUES ('adult_missing_activity', 'ADU-013', 'Statut', 'Inconnu', 'male', '1990-01-01', '2028-01-01', 'active')`),
  db.prepare(`INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at) VALUES ('membership_adult_missing_activity', 'household_demo_sidibe', 'adult_missing_activity', 'partner', '2028-01-01')`),
]);
result = await request("/api/office/calendar/generate", { method: "POST", cookie: admin.cookie, body: { year: 2028, confirmation: "GENERER LES ECHEANCES", reason: "Détection de chevauchement" } });
assert(result.status === 409, "statut d’activité manquant bloqué avant écriture");
const year2028 = await db.prepare("SELECT (SELECT COUNT(*) FROM contribution_dues WHERE due_date LIKE '2028-%') AS dues, (SELECT COUNT(*) FROM association_meetings WHERE year = 2028) AS meetings").first();
assert(year2028.dues === 0 && year2028.meetings === 0, "aucune écriture partielle lors du conflit");

result = await request("/api/office/calendar?year=2027", { cookie: admin.cookie });
assert(result.status === 200 && result.payload.meetings.length === 4 && result.payload.dueCount === 7 && result.payload.lastGeneration.skippedDueCount === 7, "calendrier annuel et dernière génération cohérents");
const checks = await db.prepare(`SELECT
  (SELECT COUNT(*) FROM due_generation_runs WHERE year = 2027) AS runs,
  (SELECT COUNT(*) FROM audit_logs WHERE action = 'calendar.dues_generated') AS audits,
  (SELECT COUNT(*) FROM contribution_dues WHERE due_date LIKE '2026-%') AS originalDues`).first();
assert(checks.runs === 2 && checks.audits === 2 && checks.originalDues === 5, "générations auditées et historique 2026 conservé");
console.log(JSON.stringify({ ok: true, statuses: { view: 200, forbiddenGeneration: 403, badConfirmation: 400, generation: 201, rerun: 201, overlap: 409 },
  meetingDates: ["2027-03-14", "2027-06-13", "2027-09-12", "2027-12-12"], dueCount: dues.results.length, runs: checks.runs, audits: checks.audits, originalDues: checks.originalDues }, null, 2));
await mf.dispose();
