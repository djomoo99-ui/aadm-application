import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const moduleFiles = (await readdir("dist/aadm_app", { recursive: true })).filter((path) => path.endsWith(".js"))
  .map((path) => `dist/aadm_app/${path}`).sort((left) => left.endsWith("/index.js") ? -1 : 1);
const mf = new Miniflare({ compatibilityDate: "2026-07-15", compatibilityFlags: ["nodejs_compat"],
  modules: moduleFiles.map((path) => ({ type: "ESModule", path })), d1Databases: { DB: "aadm-lot16-test" },
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
async function createAccount(label, email, memberNumber, centralAccess = false) {
  sequence += 1;
  let result = await request("/api/auth/sign-up/email", { method: "POST", body: { name: label, email, password: "MotDePasse-2026!", phone: `+3361616000${sequence}`, memberNumber } });
  assert(result.status === 200, `inscription ${label}`);
  const user = await db.prepare("SELECT id FROM auth_user WHERE email = ?").bind(email).first();
  const profile = await db.prepare("SELECT id FROM profiles WHERE auth_user_id = ?").bind(user.id).first();
  await db.batch([
    db.prepare("UPDATE profiles SET status = 'active', central_access = ? WHERE id = ?").bind(centralAccess ? 1 : 0, profile.id),
    db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, 'role_admin')").bind(profile.id),
  ]);
  result = await request("/api/auth/sign-in/email", { method: "POST", body: { email, password: "MotDePasse-2026!" } });
  assert(result.status === 200 && result.setCookie, `connexion ${label}`);
  return { profileId: profile.id, cookie: result.setCookie.split(";")[0] };
}

const central = await createAccount("Administration centrale", "central-lot16@example.test", "ADM-016", true);
let result = await request("/api/office/offices", { method: "POST", cookie: central.cookie, body: {
  code: "LYON", name: "Bureau de Lyon", city: "Lyon", meetingOrdinal: 3, meetingWeekday: 0,
} });
assert(result.status === 201 && result.payload.officeId, "création du sous-bureau de Lyon");
const lyonId = result.payload.officeId;

const local = await createAccount("Administratrice Lyon", "lyon-lot16@example.test", "ADM-LYON-016");
result = await request(`/api/office/responsibles/${local.profileId}/office`, { method: "PATCH", cookie: central.cookie, body: {
  officeId: lyonId, centralAccess: false, reason: "Affectation au sous-bureau de Lyon",
} });
assert(result.status === 200, "responsable rattachée à Lyon");

result = await request("/api/office/administration/households", { method: "POST", cookie: central.cookie, body: {
  officeId: "office_paris", name: "Famille Transfert Test", phone: "+33616161111", joinedAt: "2021-01-01", status: "active",
  head: { memberNumber: "PAR-016", firstName: "Amadou", lastName: "Paris", gender: "male", birthDate: "1985-01-01", phone: "+33616161111" },
} });
assert(result.status === 201, "foyer parisien créé explicitement à Paris");
const transferHouseholdId = result.payload.householdId;
const transferMember = await db.prepare("SELECT id FROM members WHERE member_number = 'PAR-016'").first();
result = await request(`/api/office/administration/members/${transferMember.id}/activity`, { method: "POST", cookie: central.cookie, body: {
  status: "working", startsAt: "2021-01-01", reason: "Activité rémunérée du foyer de test",
} });
assert(result.status === 201, "activité du membre enregistrée");

result = await request(`/api/office/households/${transferHouseholdId}/change-office`, { method: "POST", cookie: central.cookie, body: {
  officeId: lyonId, startsAt: "2025-07-01", reason: "Déménagement du foyer vers Lyon",
} });
assert(result.status === 200, "transfert du foyer vers Lyon");

result = await request("/api/office/calendar/generate", { method: "POST", cookie: central.cookie, body: {
  year: 2025, officeId: "office_paris", confirmation: "GENERER LES ECHEANCES", reason: "Calendrier annuel du bureau de Paris",
} });
assert(result.status === 201 && result.payload.createdDueCount >= 3, "rapatriement et échéances parisiennes générés avant le transfert");
result = await request("/api/office/calendar/generate", { method: "POST", cookie: central.cookie, body: {
  year: 2025, officeId: lyonId, confirmation: "GENERER LES ECHEANCES", reason: "Calendrier annuel du bureau de Lyon",
} });
assert(result.status === 201 && result.payload.createdDueCount === 2, "deux échéances lyonnaises après le transfert");

const dues = await db.prepare("SELECT office_id AS officeId, due_date AS dueDate, contribution_kind AS kind FROM contribution_dues WHERE household_id = ? AND due_date LIKE '2025-%' ORDER BY due_date, contribution_kind").bind(transferHouseholdId).all();
assert(JSON.stringify(dues.results) === JSON.stringify([
  { officeId: "office_paris", dueDate: "2025-03-09", kind: "annual_repatriation" },
  { officeId: "office_paris", dueDate: "2025-03-09", kind: "quarterly_working_man" },
  { officeId: "office_paris", dueDate: "2025-06-08", kind: "quarterly_working_man" },
  { officeId: lyonId, dueDate: "2025-09-21", kind: "quarterly_working_man" },
  { officeId: lyonId, dueDate: "2025-12-21", kind: "quarterly_working_man" },
]), "dates propres à chaque bureau et historique préservé");

result = await request("/api/office/offices", { cookie: local.cookie });
assert(result.status === 200 && result.payload.offices.length === 1 && result.payload.offices[0].id === lyonId, "le responsable local ne voit que Lyon");
result = await request("/api/office/administration/households", { cookie: local.cookie });
assert(result.status === 200 && result.payload.households.length === 1 && result.payload.households[0].id === transferHouseholdId, "les foyers de Paris sont invisibles à Lyon");
result = await request("/api/office/reminders/candidates", { cookie: local.cookie });
const overdueCandidate = result.payload.candidates?.find((item) => item.householdName === "Famille Transfert Test" && item.kind === "overdue");
const lyonOutstanding = await db.prepare("SELECT SUM(expected_amount_cents - paid_amount_cents) AS amount FROM contribution_dues WHERE household_id = ? AND office_id = ? AND due_date LIKE '2025-%'").bind(transferHouseholdId, lyonId).first();
assert(result.status === 200 && overdueCandidate?.amountCents === lyonOutstanding.amount, "les rappels lyonnais excluent les anciennes échéances parisiennes");
result = await request("/api/office/reminders/prepare", { method: "POST", cookie: local.cookie, body: { items: [{ householdReference: overdueCandidate.householdReference, kind: "overdue", idempotencyKey: crypto.randomUUID() }] } });
assert(result.status === 201 && result.payload.prepared.length === 1, "rappel préparé par le bureau de Lyon");
const reminderOffice = await db.prepare("SELECT office_id AS officeId FROM reminders WHERE id = ?").bind(result.payload.prepared[0].id).first();
assert(reminderOffice.officeId === lyonId, "rappel marqué avec le bureau de Lyon");
result = await request("/api/office/calendar?year=2025&officeId=office_paris", { cookie: local.cookie });
assert(result.status === 200 && result.payload.office.id === lyonId
  && JSON.stringify(result.payload.meetings.map((meeting) => meeting.meetingDate)) === JSON.stringify(["2025-03-16", "2025-06-15", "2025-09-21", "2025-12-21"]), "un responsable local reste forcé sur son calendrier");
result = await request("/api/office/offices", { method: "POST", cookie: local.cookie, body: { code: "TEST", name: "Bureau interdit", city: "Test", meetingOrdinal: 1, meetingWeekday: 1 } });
assert(result.status === 403, "un administrateur local ne peut pas créer un bureau");

const history = await db.prepare("SELECT office_id AS officeId, starts_at AS startsAt, ends_at AS endsAt FROM household_office_assignments WHERE household_id = ? ORDER BY starts_at").bind(transferHouseholdId).all();
assert(history.results.length === 2 && history.results[0].endsAt === "2025-06-30" && history.results[1].officeId === lyonId, "deux périodes de rattachement conservées");
console.log(JSON.stringify({ ok: true, offices: ["Paris", "Lyon"], parisDates: ["2025-03-09", "2025-06-08"], lyonDates: ["2025-09-21", "2025-12-21"], localScope: "Lyon uniquement", officeHistoryPeriods: history.results.length }, null, 2));
await mf.dispose();
