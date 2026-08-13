import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Miniflare } from "miniflare";

const moduleFiles = (await readdir("dist/aadm_app", { recursive: true })).filter((path) => path.endsWith(".js"))
  .map((path) => `dist/aadm_app/${path}`).sort((left) => left.endsWith("/index.js") ? -1 : 1);
const mf = new Miniflare({ compatibilityDate: "2026-07-15", compatibilityFlags: ["nodejs_compat"],
  modules: moduleFiles.map((path) => ({ type: "ESModule", path })), d1Databases: { DB: "aadm-lot12-test" },
  bindings: { APP_ENV: "test", AUTH_SECRET: "0123456789abcdef0123456789abcdef", QR_TOKEN_SECRET: "abcdef0123456789abcdef0123456789" } });
const db = await mf.getD1Database("DB");
async function executeSqlFile(path, separator) { for (const statement of (await readFile(path, "utf8")).split(separator).map((value) => value.trim()).filter(Boolean)) await db.prepare(statement.replace(/;\s*$/, "")).run(); }
for (const migration of (await readdir("src/db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await executeSqlFile(`src/db/migrations/${migration}`, /--> statement-breakpoint/);
await executeSqlFile("src/db/seed/demo.sql", /;\s*(?:\r?\n|$)/);
function assert(condition, message) { if (!condition) throw new Error(`ÉCHEC: ${message}`); }
async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await mf.dispatchFetch(`http://aadm.test${path}`, { method, headers: { "CF-Connecting-IP": "127.0.0.1",
    ...(body ? { "Content-Type": "application/json", Origin: "http://aadm.test" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, response, text: await response.text(), setCookie: response.headers.get("set-cookie") };
}
let sequence = 0;
async function createAccount(label, email, memberNumber, roleId) {
  sequence += 1; let result = await request("/api/auth/sign-up/email", { method: "POST", body: { name: label, email,
    password: "MotDePasse-2026!", phone: `+3362222000${sequence}`, memberNumber } }); assert(result.status === 200, `inscription ${label}`);
  const user = await db.prepare("SELECT id FROM auth_user WHERE email = ?").bind(email).first();
  const profile = await db.prepare("SELECT id FROM profiles WHERE auth_user_id = ?").bind(user.id).first();
  await db.batch([db.prepare("UPDATE profiles SET status = 'active' WHERE id = ?").bind(profile.id), db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, ?)").bind(profile.id, roleId)]);
  result = await request("/api/auth/sign-in/email", { method: "POST", body: { email, password: "MotDePasse-2026!" } }); assert(result.status === 200 && result.setCookie, `connexion ${label}`);
  return { profileId: profile.id, cookie: result.setCookie.split(";")[0] };
}
const admin = await createAccount("Administrateur Export", "admin-lot12@example.test", "ADM-012", "role_admin");
await db.prepare("UPDATE profiles SET central_access = 1 WHERE id = ?").bind(admin.profileId).run();
const controller = await createAccount("Contrôleur Export", "controller-lot12@example.test", "CTL-012", "role_controller");
await db.prepare(`INSERT INTO audit_logs (id, actor_profile_id, action, entity_type, entity_id, new_values) VALUES ('audit_lot12', ?, 'household.updated', 'household', 'household_demo_sidibe', '{"name":"Famille Sidibé"}')`).bind(admin.profileId).run();

let result = await request("/api/office/audit-logs", { cookie: controller.cookie });
assert(result.status === 403, "journal interdit au contrôleur");
result = await request("/api/office/exports/summary", { cookie: controller.cookie });
assert(result.status === 403, "exports interdits au contrôleur");
result = await request("/api/office/audit-logs?q=household&from=2020-01-01&to=2030-12-31&page=1", { cookie: admin.cookie });
const audit = JSON.parse(result.text);
assert(result.status === 200 && audit.total >= 1 && audit.items[0].actorName === "Administrateur Export", "journal filtré et auteur résolu");
assert(result.response.headers.get("cache-control") === "no-store", "journal non mis en cache");

result = await request("/api/office/exports/csv", { method: "POST", cookie: admin.cookie, body: { type: "members", confirmation: "NON", reason: "Test refus" } });
assert(result.status === 400, "confirmation CSV incorrecte refusée");
result = await request("/api/office/exports/csv", { method: "POST", cookie: admin.cookie, body: { type: "members", confirmation: "EXPORTER", reason: "Archive annuelle du bureau" } });
assert(result.status === 200 && result.text.startsWith('"Numero_AADM";') && result.text.includes("00482") && result.text.includes("Famille Sidibé"), "CSV membres complet et séparateur Excel français");
assert(result.response.headers.get("content-type").startsWith("text/csv") && result.response.headers.get("content-disposition").includes(".csv"), "en-têtes CSV de téléchargement");

result = await request("/api/office/backups", { method: "POST", cookie: admin.cookie, body: { confirmation: "CREER UNE SAUVEGARDE", reason: "Sauvegarde mensuelle vérifiée" } });
assert(result.status === 200 && result.response.headers.get("content-disposition").includes(".json"), "sauvegarde JSON téléchargeable");
const backup = JSON.parse(result.text);
const forbiddenTables = ["auth_user", "auth_account", "auth_session", "auth_verification", "auth_rate_limit", "profiles", "user_roles", "member_qr_codes"];
assert(forbiddenTables.every((table) => !(table in backup.data)), "authentification, sessions et QR exclus");
assert(backup.data.members.length === 1 && backup.data.member_activity_periods.length === 1 && backup.data.contribution_dues.length === 5, "données métier et activité attendues présentes");
assert(backup.manifest.format === "aadm-business-backup" && backup.manifest.schemaVersion === 1, "manifest versionné");
const calculatedHash = createHash("sha256").update(JSON.stringify(backup.data)).digest("hex");
assert(calculatedHash === backup.manifest.dataSha256, "empreinte SHA-256 exacte");

result = await request("/api/office/exports/summary", { cookie: admin.cookie });
const summary = JSON.parse(result.text);
assert(summary.lastBackupAt && summary.lastBackupBy === "Administrateur Export", "dernière sauvegarde visible");
const counts = await db.prepare(`SELECT
  (SELECT COUNT(*) FROM audit_logs WHERE action = 'export.csv_created') AS csvAudits,
  (SELECT COUNT(*) FROM audit_logs WHERE action = 'backup.created') AS backupAudits,
  (SELECT COUNT(*) FROM auth_account) AS authAccounts,
  (SELECT COUNT(*) FROM auth_session) AS authSessions`).first();
assert(counts.csvAudits === 1 && counts.backupAudits === 1, "téléchargements journalisés");
assert(counts.authAccounts === 2 && counts.authSessions === 2, "exports sans altération des comptes et sessions");
console.log(JSON.stringify({ ok: true, statuses: { unauthorizedAudit: 403, unauthorizedExport: 403, audit: 200, badConfirmation: 400, csv: 200, backup: 200 },
  excludedAuthenticationTables: forbiddenTables.length, dataSha256: backup.manifest.dataSha256, csvAudits: counts.csvAudits, backupAudits: counts.backupAudits }, null, 2));
await mf.dispose();
