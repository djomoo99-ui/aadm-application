import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const moduleFiles = (await readdir("dist/aadm_app", { recursive: true }))
  .filter((path) => path.endsWith(".js"))
  .map((path) => `dist/aadm_app/${path}`)
  .sort((left) => left.endsWith("/index.js") ? -1 : rightOrder(left));

function rightOrder(path) {
  return path.endsWith("/index.js") ? 1 : 0;
}

const mf = new Miniflare({
  compatibilityDate: "2026-07-15",
  compatibilityFlags: ["nodejs_compat"],
  modules: moduleFiles.map((path) => ({ type: "ESModule", path })),
  d1Databases: { DB: "aadm-lot10-test" },
  bindings: {
    APP_ENV: "test",
    AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    QR_TOKEN_SECRET: "abcdef0123456789abcdef0123456789",
  },
});

const db = await mf.getD1Database("DB");
async function executeSqlFile(path, separator) {
  const source = await readFile(path, "utf8");
  const statements = source.split(separator).map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await db.prepare(statement.replace(/;\s*$/, "")).run();
}
for (const migration of (await readdir("src/db/migrations")).filter((name) => name.endsWith(".sql")).sort())
  await executeSqlFile(`src/db/migrations/${migration}`, /--> statement-breakpoint/);
await executeSqlFile("src/db/seed/demo.sql", /;\s*(?:\r?\n|$)/);

function assert(condition, message) {
  if (!condition) throw new Error(`ÉCHEC: ${message}`);
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await mf.dispatchFetch(`http://aadm.test${path}`, {
    method,
    headers: {
      "CF-Connecting-IP": "127.0.0.1",
      ...(body ? { "Content-Type": "application/json", Origin: "http://aadm.test" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload, setCookie: response.headers.get("set-cookie") };
}

const email = "agent-saisie@example.test";
let result = await request("/api/auth/sign-up/email", { method: "POST", body: {
  name: "Agent Saisie", email, password: "MotDePasse-2026!", phone: "+33611112222", memberNumber: "00482",
} });
assert(result.status === 200, `inscription attendue 200, obtenue ${result.status}`);

const user = await db.prepare("SELECT id FROM auth_user WHERE email = ?").bind(email).first();
const profile = await db.prepare("SELECT id FROM profiles WHERE auth_user_id = ?").bind(user.id).first();
await db.batch([
  db.prepare("UPDATE profiles SET status = 'active', member_id = 'member_demo_adama' WHERE id = ?").bind(profile.id),
  db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, 'role_data_entry')").bind(profile.id),
]);

result = await request("/api/auth/sign-in/email", { method: "POST", body: { email, password: "MotDePasse-2026!" } });
assert(result.status === 200 && result.setCookie, "connexion de l’agent de saisie");
const cookie = result.setCookie.split(";")[0];

result = await request("/api/office/administration/households", { cookie });
assert(result.status === 200 && result.payload.households.length === 1, "lecture autorisée pour l’agent de saisie");

const householdBody = {
  name: "Famille Test", phone: "+33622223333", joinedAt: "2026-08-01", status: "active",
  head: { memberNumber: "TEST-001", firstName: "Awa", lastName: "Test", gender: "female", birthDate: "1992-05-10", phone: "+33622223333" },
};
result = await request("/api/office/administration/households", { method: "POST", cookie, body: householdBody });
assert(result.status === 201, `création du foyer attendue 201, obtenue ${result.status}`);
const householdId = result.payload.householdId;

result = await request("/api/office/administration/households", { method: "POST", cookie, body: householdBody });
assert(result.status === 409, "numéro AADM en double refusé");

result = await request(`/api/office/administration/households/${householdId}/members`, { method: "POST", cookie, body: {
  memberNumber: "TEST-002", firstName: "Moussa", lastName: "Test", gender: "male", birthDate: "2015-04-02",
  phone: "", joinedAt: "2026-08-01", relationship: "child",
} });
assert(result.status === 201, "ajout d’un enfant");
const childId = result.payload.memberId;

result = await request("/api/office/administration/contribution-rules", { method: "POST", cookie, body: {
  name: "Tarif test", category: "couple", baseAmountCents: 4000, childAmountCents: 1000,
  childMaxAge: 18, effectiveFrom: "2027-01-01", dueMonths: [3, 6, 9, 12],
} });
assert(result.status === 403, "création d’un tarif refusée à l’agent de saisie");

await db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, 'role_admin')").bind(profile.id).run();
await db.prepare("UPDATE profiles SET central_access = 1 WHERE id = ?").bind(profile.id).run();
result = await request("/api/office/administration/contribution-rules", { method: "POST", cookie, body: {
  name: "Tarif couple depuis 2027", category: "couple", baseAmountCents: 4000, childAmountCents: 1000,
  childMaxAge: 18, effectiveFrom: "2027-01-01", dueMonths: [3, 6, 9, 12],
} });
assert(result.status === 409, "ancienne catégorie tarifaire bloquée pour l’administrateur");

result = await request(`/api/office/administration/households/${householdId}/rule-assignment`, { method: "POST", cookie, body: {
  ruleId: "rule_aadm_couple", startsAt: "2027-01-01", reason: "Décision du bureau",
} });
assert(result.status === 409, "affectation d’une catégorie au foyer bloquée");

result = await request("/api/office/administration/households?q=Famille Test", { cookie });
const household = result.payload.households[0];
const child = household.members.find((member) => member.id === childId);
assert(!household.assignment, "aucune catégorie tarifaire affectée au nouveau foyer");

const householdUpdate = {
  expectedUpdatedAt: household.updatedAt, name: "Famille Test Modifiée", phone: "+33622223333",
  joinedAt: household.joinedAt, leftAt: "", status: "active",
};
result = await request(`/api/office/administration/households/${householdId}`, { method: "PATCH", cookie, body: householdUpdate });
assert(result.status === 200, "mise à jour optimiste du foyer");
result = await request(`/api/office/administration/households/${householdId}`, { method: "PATCH", cookie, body: householdUpdate });
assert(result.status === 409, "ancienne version du foyer refusée");

result = await request(`/api/office/administration/members/${childId}`, { method: "PATCH", cookie, body: {
  expectedUpdatedAt: child.updatedAt, membershipId: child.membershipId, memberNumber: child.memberNumber,
  firstName: child.firstName, lastName: child.lastName, gender: child.gender, birthDate: child.birthDate ?? "",
  phone: "", joinedAt: child.joinedAt, leftAt: "2026-08-12", status: "inactive", relationship: "child",
} });
assert(result.status === 200, "désactivation d’un membre sans suppression");

  const counts = await db.prepare(
  `SELECT
    (SELECT COUNT(*) FROM households WHERE id = ?) AS householdCount,
    (SELECT COUNT(*) FROM households WHERE name = 'Famille Test') AS duplicateHouseholdCount,
    (SELECT COUNT(*) FROM members WHERE id = ? AND status = 'inactive') AS inactiveChildCount,
    (SELECT COUNT(*) FROM audit_logs WHERE entity_id IN (?, ?)) AS auditCount,
    (SELECT COUNT(*) FROM contribution_dues WHERE household_id = 'household_demo_sidibe') AS originalDueCount`,
).bind(householdId, childId, householdId, childId).first();
assert(counts.householdCount === 1 && counts.duplicateHouseholdCount === 0 && counts.inactiveChildCount === 1,
  "aucun foyer orphelin et fiches conservées après désactivation");
assert(counts.auditCount >= 4, "actions sensibles journalisées");
assert(counts.originalDueCount === 5, "historique de cotisation existant inchangé");

console.log(JSON.stringify({
  ok: true,
  statuses: { list: 200, createHousehold: 201, duplicate: 409, addChild: 201, tariffForbidden: 403,
    createTariff: 409, assignTariff: 409, staleUpdate: 409, deactivateChild: 200 },
  auditCount: counts.auditCount,
  originalDueCount: counts.originalDueCount,
}, null, 2));

await mf.dispose();
