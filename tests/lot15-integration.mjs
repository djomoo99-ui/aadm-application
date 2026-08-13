import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const moduleFiles = (await readdir("dist/aadm_app", { recursive: true })).filter((path) => path.endsWith(".js"))
  .map((path) => `dist/aadm_app/${path}`).sort((left) => left.endsWith("/index.js") ? -1 : 1);
const mf = new Miniflare({ compatibilityDate: "2026-07-15", compatibilityFlags: ["nodejs_compat"], modules: moduleFiles.map((path) => ({ type: "ESModule", path })), d1Databases: { DB: "aadm-lot15-test" }, bindings: { APP_ENV: "test", AUTH_SECRET: "0123456789abcdef0123456789abcdef", QR_TOKEN_SECRET: "abcdef0123456789abcdef0123456789" } });
const db = await mf.getD1Database("DB");
async function executeSqlFile(path, separator) { for (const statement of (await readFile(path, "utf8")).split(separator).map((value) => value.trim()).filter(Boolean)) await db.prepare(statement.replace(/;\s*$/, "")).run(); }
for (const migration of (await readdir("src/db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await executeSqlFile(`src/db/migrations/${migration}`, /--> statement-breakpoint/);
await executeSqlFile("src/db/seed/demo.sql", /;\s*(?:\r?\n|$)/);
function assert(condition, message) { if (!condition) throw new Error(`ÉCHEC: ${message}`); }
async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await mf.dispatchFetch(`http://aadm.test${path}`, { method, headers: { "CF-Connecting-IP": "127.0.0.1", ...(body ? { "Content-Type": "application/json", Origin: "http://aadm.test" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, payload: await response.json().catch(() => ({})), setCookie: response.headers.get("set-cookie") };
}
async function createOfficeAccount() {
  let result = await request("/api/auth/sign-up/email", { method: "POST", body: { name: "Agent Tableau Lot 15", email: "agent-lot15@example.test", password: "MotDePasse-2026!", phone: "+33615150001", memberNumber: "AGT-015" } });
  assert(result.status === 200, "inscription agent");
  const user = await db.prepare("SELECT id FROM auth_user WHERE email = 'agent-lot15@example.test'").first();
  const profile = await db.prepare("SELECT id FROM profiles WHERE auth_user_id = ?").bind(user.id).first();
  await db.batch([db.prepare("UPDATE profiles SET status = 'active' WHERE id = ?").bind(profile.id), db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, 'role_data_entry')").bind(profile.id)]);
  result = await request("/api/auth/sign-in/email", { method: "POST", body: { email: "agent-lot15@example.test", password: "MotDePasse-2026!" } });
  assert(result.status === 200 && result.setCookie, "connexion agent");
  return result.setCookie.split(";")[0];
}

await db.prepare(`INSERT INTO households (id, name, joined_at, status) VALUES ('household_lot15_alert', 'Foyer Automatique', '2021-01-01', 'active')`).run();
const worker = await mf.getWorker();
const scheduledTime = Date.parse("2026-08-12T06:00:00.000Z");
await worker.scheduled({ scheduledTime, cron: "0 6 * * *" });
let runs = await db.prepare("SELECT id, trigger, run_key AS runKey, run_by AS runBy FROM alert_scan_runs ORDER BY created_at").all();
assert(runs.results.length === 1 && runs.results[0].trigger === "scheduled" && runs.results[0].runKey === "scheduled:2026-08-12" && runs.results[0].runBy === "system", "contrôle planifié identifié");
await worker.scheduled({ scheduledTime, cron: "0 6 * * *" });
runs = await db.prepare("SELECT id FROM alert_scan_runs").all();
assert(runs.results.length === 1, "double déclenchement du même jour ignoré");
await worker.scheduled({ scheduledTime: Date.parse("2026-08-13T06:00:00.000Z"), cron: "0 6 * * *" });
runs = await db.prepare("SELECT id FROM alert_scan_runs").all();
assert(runs.results.length === 2, "nouveau contrôle autorisé le jour suivant");
const alertCounts = await db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN severity = 'critical' AND status <> 'resolved' THEN 1 ELSE 0 END) AS critical FROM office_alerts").first();
assert(alertCounts.total >= 1, "alertes automatiques enregistrées sans doublon");
const audits = await db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'alerts.scan_completed' AND actor_profile_id IS NULL").first();
assert(audits.count === 2, "contrôles automatiques journalisés comme système");

const cookie = await createOfficeAccount();
let result = await request("/api/office/dashboard", { cookie });
assert(result.status === 200 && result.payload.openAlerts === alertCounts.total && result.payload.criticalAlerts === alertCounts.critical && result.payload.lastAlertScanAt, "compteurs d’alertes présents sur le tableau");
result = await request("/api/office/alerts?status=open", { cookie });
assert(result.status === 200 && result.payload.lastScan.trigger === "scheduled" && result.payload.lastScan.runByName === "Système", "origine automatique visible dans le centre d’alertes");
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
assert(config.triggers.crons.includes("0 6 * * *"), "planification quotidienne configurée");
console.log(JSON.stringify({ ok: true, scheduledTime: "06:00 UTC", sameDayRuns: 1, nextDayRuns: runs.results.length, automaticAudits: audits.count, dashboard: { openAlerts: result.payload.summary.open, criticalAlerts: alertCounts.critical }, cron: config.triggers.crons[0] }, null, 2));
await mf.dispose();
