import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const moduleFiles = (await readdir("dist/aadm_app", { recursive: true })).filter((path) => path.endsWith(".js"))
  .map((path) => `dist/aadm_app/${path}`).sort((left) => left.endsWith("/index.js") ? -1 : 1);
const mf = new Miniflare({ compatibilityDate: "2026-07-15", compatibilityFlags: ["nodejs_compat"],
  modules: moduleFiles.map((path) => ({ type: "ESModule", path })), d1Databases: { DB: "aadm-lot17-test" },
  bindings: { APP_ENV: "test", AUTH_SECRET: "0123456789abcdef0123456789abcdef", QR_TOKEN_SECRET: "abcdef0123456789abcdef0123456789" } });
const db = await mf.getD1Database("DB");
async function executeSqlFile(path, separator) { for (const statement of (await readFile(path, "utf8")).split(separator).map((value) => value.trim()).filter(Boolean)) await db.prepare(statement.replace(/;\s*$/, "")).run(); }
for (const migration of (await readdir("src/db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await executeSqlFile(`src/db/migrations/${migration}`, /--> statement-breakpoint/);
await executeSqlFile("src/db/seed/demo.sql", /;\s*(?:\r?\n|$)/);
await db.prepare("UPDATE members SET left_at = '2023-12-31', status = 'inactive' WHERE id = 'member_demo_adama'").run();
function assert(condition, message) { if (!condition) throw new Error(`ÉCHEC: ${message}`); }
async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await mf.dispatchFetch(`http://aadm.test${path}`, { method, headers: { "CF-Connecting-IP": "127.0.0.1",
    ...(body ? { "Content-Type": "application/json", Origin: "http://aadm.test" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, payload: await response.json().catch(() => ({})), setCookie: response.headers.get("set-cookie") };
}
let result = await request("/api/auth/sign-up/email", { method: "POST", body: { name: "Administration lot 17", email: "admin-lot17@example.test", password: "MotDePasse-2026!", phone: "+33617170001", memberNumber: "ADM-017" } });
assert(result.status === 200, "inscription administrateur");
const user = await db.prepare("SELECT id FROM auth_user WHERE email = 'admin-lot17@example.test'").first();
const profile = await db.prepare("SELECT id FROM profiles WHERE auth_user_id = ?").bind(user.id).first();
await db.batch([db.prepare("UPDATE profiles SET status = 'active', central_access = 1 WHERE id = ?").bind(profile.id), db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, 'role_admin')").bind(profile.id)]);
result = await request("/api/auth/sign-in/email", { method: "POST", body: { email: "admin-lot17@example.test", password: "MotDePasse-2026!" } });
assert(result.status === 200 && result.setCookie, "connexion administrateur"); const cookie = result.setCookie.split(";")[0];

await db.batch([
  db.prepare("INSERT INTO households (id, office_id, name, joined_at, status) VALUES ('h17', 'office_paris', 'Foyer règles 17', '2021-01-01', 'active')"),
  db.prepare("INSERT INTO household_office_assignments (id, household_id, office_id, starts_at, reason) VALUES ('hoa17', 'h17', 'office_paris', '2021-01-01', 'Test')"),
  db.prepare(`INSERT INTO members (id, member_number, first_name, last_name, gender, birth_date, joined_at, status) VALUES
    ('m17a','M17-A','Alpha','Actif','male','1980-01-01','2021-01-01','active'),
    ('m17b','M17-B','Beta','Actif','male','1985-01-01','2021-01-01','active'),
    ('m17f','M17-F','Fatou','Seule','female','1990-01-01','2021-01-01','active'),
    ('m17c','M17-C','Enfant','Test','female','2015-01-01','2021-01-01','active'),
    ('m17n','M17-N','Nadir','Sans activité','male','1982-01-01','2021-01-01','active')`),
  db.prepare(`INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at) VALUES
    ('hm17a','h17','m17a','head','2021-01-01'),('hm17b','h17','m17b','partner','2021-01-01'),
    ('hm17f','h17','m17f','partner','2021-01-01'),('hm17c','h17','m17c','child','2021-01-01'),('hm17n','h17','m17n','partner','2021-01-01')`),
  db.prepare(`INSERT INTO member_activity_periods (id, member_id, status, starts_at, reason) VALUES
    ('map17a','m17a','working','2021-01-01','Test activité rémunérée'),
    ('map17b','m17b','working','2021-01-01','Test activité rémunérée'),
    ('map17n','m17n','not_working','2021-01-01','Test sans activité')`),
]);
result = await request("/api/office/calendar/generate", { method: "POST", cookie, body: { year: 2024, confirmation: "GENERER LES ECHEANCES", reason: "Vérification complète du nouveau barème" } });
assert(result.status === 201 && result.payload.createdDueCount === 13, "13 échéances individuelles créées");
const dues = await db.prepare(`SELECT member_id AS memberId, contribution_kind AS kind, COUNT(*) AS count, SUM(expected_amount_cents) AS amount
  FROM contribution_dues WHERE household_id = 'h17' AND due_date LIKE '2024-%' GROUP BY member_id, contribution_kind ORDER BY member_id, contribution_kind`).all();
const byKey = new Map(dues.results.map((row) => [`${row.memberId}:${row.kind}`, row]));
assert(byKey.get("m17a:annual_repatriation")?.amount === 6000 && byKey.get("m17a:quarterly_working_man")?.amount === 8000, "premier homme actif : 60 € annuel + 80 € trimestriels");
assert(byKey.get("m17b:annual_repatriation")?.amount === 6000 && byKey.get("m17b:quarterly_working_man")?.amount === 8000, "deuxième homme actif : 60 € annuel + 80 € trimestriels");
assert(byKey.get("m17f:annual_repatriation")?.amount === 2000 && !byKey.has("m17f:quarterly_working_man"), "femme : rapatriement uniquement");
assert(byKey.get("m17c:annual_repatriation")?.amount === 1000, "enfant : 10 € de rapatriement");
assert(byKey.get("m17n:annual_repatriation")?.amount === 6000 && !byKey.has("m17n:quarterly_working_man"), "homme sans activité : rapatriement uniquement");
const march = await db.prepare("SELECT SUM(expected_amount_cents) AS amount FROM contribution_dues WHERE household_id = 'h17' AND due_date = '2024-03-10'").first();
const june = await db.prepare("SELECT SUM(expected_amount_cents) AS amount FROM contribution_dues WHERE household_id = 'h17' AND due_date = '2024-06-09'").first();
assert(march.amount === 25000 && june.amount === 4000, "foyer : 250 € à la première réunion puis 40 € par trimestre");
result = await request("/api/office/calendar/generate", { method: "POST", cookie, body: { year: 2024, confirmation: "GENERER LES ECHEANCES", reason: "Contrôle de non-duplication du barème" } });
assert(result.status === 201 && result.payload.createdDueCount === 0 && result.payload.skippedDueCount === 13, "génération idempotente");
result = await request("/api/office/administration/contribution-rules", { method: "POST", cookie, body: { name: "Ancien tarif", category: "couple", baseAmountCents: 3000, childAmountCents: 1000, childMaxAge: 18, effectiveFrom: "2024-01-01", dueMonths: [3,6,9,12] } });
assert(result.status === 409, "création d’une ancienne catégorie bloquée");
await db.batch([
  db.prepare("INSERT INTO members (id, member_number, first_name, last_name, gender, birth_date, joined_at, status) VALUES ('m17u','M17-U','Umar','Inconnu','male','1988-01-01','2025-01-01','active')"),
  db.prepare("INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at) VALUES ('hm17u','h17','m17u','partner','2025-01-01')"),
]);
result = await request("/api/office/calendar/generate", { method: "POST", cookie, body: { year: 2025, confirmation: "GENERER LES ECHEANCES", reason: "Contrôle du statut d’activité obligatoire" } });
assert(result.status === 409 && result.payload.message.includes("Statut d’activité manquant"), "génération bloquée si le statut d’activité d’un homme adulte est inconnu");
const workbook = {
  fileName: "historique-lot17.xlsx",
  members: [{ rowNumber: 2, householdCode: "F17-IMPORT", householdName: "Femme seule import", memberNumber: "M17-I", firstName: "Aïcha", lastName: "Import", gender: "female", relationship: "head", birthDate: "1992-02-01", phone: "+33617179999", joinedAt: "2021-01-01" }],
  activities: [],
  contributions: [{ rowNumber: 2, memberNumber: "M17-I", contributionKind: "annual_repatriation", dueDate: "2023-03-12", expectedAmountCents: 2000, paidAmountCents: 2000, source: "notebook", note: "Historique vérifié" }],
};
result = await request("/api/office/imports/analyze", { method: "POST", cookie, body: workbook });
assert(result.status === 200 && result.payload.canConfirm && result.payload.summary.newActivities === 0 && result.payload.summary.newContributions === 1, "nouvel import Excel analysé par membre");
result = await request("/api/office/imports/confirm", { method: "POST", cookie, body: { ...workbook, analysisToken: result.payload.analysisToken } });
assert(result.status === 201 && result.payload.summary.newMembers === 1, "import Excel confirmé avec le nouveau modèle");
const imported = await db.prepare("SELECT cd.contribution_kind AS kind, cd.expected_amount_cents AS amount FROM contribution_dues cd JOIN members m ON m.id = cd.member_id WHERE m.member_number = 'M17-I'").first();
assert(imported.kind === "annual_repatriation" && imported.amount === 2000, "cotisation annuelle importée pour la femme seule");
console.log(JSON.stringify({ ok: true, dues: 13, firstMeetingHouseholdTotalEur: 250, laterQuarterHouseholdTotalEur: 40, twoWorkingMenQuarterlyEur: 40, adultManAnnualEur: 60, adultWomanAnnualEur: 20, childAnnualEur: 10, missingActivityBlocked: true, excelImport: true, idempotent: true }, null, 2));
await mf.dispose();
