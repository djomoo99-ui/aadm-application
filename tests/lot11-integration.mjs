import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const moduleFiles = (await readdir("dist/aadm_app", { recursive: true }))
  .filter((path) => path.endsWith(".js"))
  .map((path) => `dist/aadm_app/${path}`)
  .sort((left) => left.endsWith("/index.js") ? -1 : 1);
const mf = new Miniflare({
  compatibilityDate: "2026-07-15", compatibilityFlags: ["nodejs_compat"],
  modules: moduleFiles.map((path) => ({ type: "ESModule", path })),
  d1Databases: { DB: "aadm-lot11-test" },
  bindings: { APP_ENV: "test", AUTH_SECRET: "0123456789abcdef0123456789abcdef", QR_TOKEN_SECRET: "abcdef0123456789abcdef0123456789" },
});
const db = await mf.getD1Database("DB");
async function executeSqlFile(path, separator) {
  const statements = (await readFile(path, "utf8")).split(separator).map((value) => value.trim()).filter(Boolean);
  for (const statement of statements) await db.prepare(statement.replace(/;\s*$/, "")).run();
}
for (const migration of (await readdir("src/db/migrations")).filter((name) => name.endsWith(".sql")).sort())
  await executeSqlFile(`src/db/migrations/${migration}`, /--> statement-breakpoint/);
await executeSqlFile("src/db/seed/demo.sql", /;\s*(?:\r?\n|$)/);

function assert(condition, message) { if (!condition) throw new Error(`ÉCHEC: ${message}`); }
async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await mf.dispatchFetch(`http://aadm.test${path}`, { method, headers: {
    "CF-Connecting-IP": "127.0.0.1", ...(body ? { "Content-Type": "application/json", Origin: "http://aadm.test" } : {}), ...(cookie ? { Cookie: cookie } : {}),
  }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, payload: await response.json().catch(() => ({})), setCookie: response.headers.get("set-cookie") };
}
let accountSequence = 0;
async function createAccount(label, email, memberNumber) {
  accountSequence += 1;
  let result = await request("/api/auth/sign-up/email", { method: "POST", body: {
    name: label, email, password: "MotDePasse-2026!", phone: `+3361111000${accountSequence}`, memberNumber,
  } });
  assert(result.status === 200, `inscription ${label}: ${result.status} ${JSON.stringify(result.payload)}`);
  const user = await db.prepare("SELECT id FROM auth_user WHERE email = ?").bind(email).first();
  const profile = await db.prepare("SELECT id, updated_at AS updatedAt FROM profiles WHERE auth_user_id = ?").bind(user.id).first();
  await db.prepare("UPDATE profiles SET status = 'active' WHERE id = ?").bind(profile.id).run();
  result = await request("/api/auth/sign-in/email", { method: "POST", body: { email, password: "MotDePasse-2026!" } });
  assert(result.status === 200 && result.setCookie, `connexion ${label}`);
  return { userId: user.id, profileId: profile.id, cookie: result.setCookie.split(";")[0] };
}

const admin = await createAccount("Administrateur Test", "admin-lot11@example.test", "ADM-011");
await db.prepare("UPDATE profiles SET central_access = 1 WHERE id = ?").bind(admin.profileId).run();
const agent = await createAccount("Agent Test", "agent-lot11@example.test", "AGT-011");
const target = await createAccount("Trésorier Test", "tresorier-lot11@example.test", "TRE-011");
await db.batch([
  db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, 'role_admin')").bind(admin.profileId),
  db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, 'role_data_entry')").bind(agent.profileId),
  db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, 'role_treasurer')").bind(target.profileId),
]);

let result = await request("/api/office/responsibles", { cookie: agent.cookie });
assert(result.status === 403, "un non-administrateur ne peut pas lister les responsables");
result = await request("/api/office/responsibles", { cookie: admin.cookie });
assert(result.status === 200 && result.payload.items.length === 3, "liste réservée à l’administrateur");
let targetItem = result.payload.items.find((item) => item.profileId === target.profileId);
let adminItem = result.payload.items.find((item) => item.profileId === admin.profileId);
assert(targetItem.activeSessionCount === 1, "session active du responsable visible");

result = await request(`/api/office/responsibles/${admin.profileId}/roles`, { method: "PATCH", cookie: admin.cookie, body: {
  roles: ["controller"], expectedUpdatedAt: adminItem.updatedAt, reason: "Test de protection personnelle",
} });
assert(result.status === 403, "auto-retrait du rôle administrateur refusé");

result = await request(`/api/office/responsibles/${target.profileId}/roles`, { method: "PATCH", cookie: admin.cookie, body: {
  roles: ["controller", "treasurer"], expectedUpdatedAt: targetItem.updatedAt, reason: "Nouvelle fonction validée",
} });
assert(result.status === 200, "attribution de plusieurs rôles");
result = await request(`/api/office/responsibles/${target.profileId}/roles`, { method: "PATCH", cookie: admin.cookie, body: {
  roles: ["treasurer"], expectedUpdatedAt: targetItem.updatedAt, reason: "Ancienne version volontaire",
} });
assert(result.status === 409, "ancienne version de fiche refusée");

result = await request("/api/office/responsibles", { cookie: admin.cookie });
targetItem = result.payload.items.find((item) => item.profileId === target.profileId);
result = await request(`/api/office/responsibles/${target.profileId}/status`, { method: "PATCH", cookie: admin.cookie, body: {
  status: "suspended", expectedUpdatedAt: targetItem.updatedAt, reason: "Téléphone signalé comme perdu",
} });
assert(result.status === 200 && result.payload.sessionsClosed, "suspension avec fermeture de session");
result = await request("/api/me", { cookie: target.cookie });
assert(result.status === 401, "ancienne session inutilisable après suspension");

result = await request("/api/office/responsibles", { cookie: admin.cookie });
targetItem = result.payload.items.find((item) => item.profileId === target.profileId);
assert(targetItem.status === "suspended" && targetItem.roles.includes("controller") && targetItem.roles.includes("treasurer"), "rôles conservés pendant la suspension");
result = await request(`/api/office/responsibles/${target.profileId}/status`, { method: "PATCH", cookie: admin.cookie, body: {
  status: "active", expectedUpdatedAt: targetItem.updatedAt, reason: "Identité vérifiée par le bureau",
} });
assert(result.status === 200, "réactivation du compte");

result = await request("/api/auth/sign-in/email", { method: "POST", body: { email: "tresorier-lot11@example.test", password: "MotDePasse-2026!" } });
assert(result.status === 200 && result.setCookie, "nouvelle connexion après réactivation");
const newTargetCookie = result.setCookie.split(";")[0];
result = await request(`/api/office/responsibles/${target.profileId}/revoke-sessions`, { method: "POST", cookie: admin.cookie, body: {
  confirmation: "FERMER LES SESSIONS", reason: "Contrôle de sécurité de routine",
} });
assert(result.status === 200 && result.payload.sessionsClosed >= 1, "fermeture administrative des sessions");
result = await request("/api/me", { cookie: newTargetCookie });
assert(result.status === 401, "session révoquée immédiatement");

const checks = await db.prepare(
  `SELECT
    (SELECT COUNT(*) FROM profiles WHERE id = ? AND status = 'active') AS activeProfile,
    (SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.profile_id = ? AND ur.revoked_at IS NULL AND r.code IN ('controller','treasurer')) AS targetRoles,
    (SELECT COUNT(*) FROM auth_session WHERE user_id = ?) AS remainingSessions,
    (SELECT COUNT(*) FROM audit_logs WHERE entity_id = ? AND action LIKE 'responsible.%') AS auditCount,
    (SELECT COUNT(*) FROM profiles p JOIN user_roles ur ON ur.profile_id = p.id JOIN roles r ON r.id = ur.role_id WHERE p.status = 'active' AND ur.revoked_at IS NULL AND r.code = 'admin') AS activeAdmins`,
).bind(target.profileId, target.profileId, target.userId, target.profileId).first();
assert(checks.activeProfile === 1 && checks.targetRoles === 2, "profil réactivé avec rôles attendus");
assert(checks.remainingSessions === 0, "aucune session résiduelle");
assert(checks.auditCount >= 4 && checks.activeAdmins === 1, "audit complet et administrateur conservé");

console.log(JSON.stringify({ ok: true, statuses: {
  unauthorizedList: 403, list: 200, selfDemotion: 403, roleUpdate: 200, staleUpdate: 409,
  suspend: 200, suspendedSession: 401, reactivate: 200, revokeSessions: 200, revokedSession: 401,
}, auditCount: checks.auditCount, activeAdmins: checks.activeAdmins, remainingSessions: checks.remainingSessions }, null, 2));
await mf.dispose();
