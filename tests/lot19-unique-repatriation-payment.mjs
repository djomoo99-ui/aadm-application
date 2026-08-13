import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const moduleFiles = (await readdir("dist/aadm_app", { recursive: true })).filter((path) => path.endsWith(".js"))
  .map((path) => `dist/aadm_app/${path}`).sort((left) => left.endsWith("/index.js") ? -1 : 1);
const mf = new Miniflare({ compatibilityDate: "2026-07-15", compatibilityFlags: ["nodejs_compat"],
  modules: moduleFiles.map((path) => ({ type: "ESModule", path })), d1Databases: { DB: "aadm-lot19-test" },
  bindings: { APP_ENV: "test", AUTH_SECRET: "0123456789abcdef0123456789abcdef", QR_TOKEN_SECRET: "abcdef0123456789abcdef0123456789" } });
const db = await mf.getD1Database("DB");
async function executeSqlFile(path, separator) { for (const statement of (await readFile(path, "utf8")).split(separator).map((value) => value.trim()).filter(Boolean)) await db.prepare(statement.replace(/;\s*$/, "")).run(); }
for (const migration of (await readdir("src/db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await executeSqlFile(`src/db/migrations/${migration}`, /--> statement-breakpoint/);
await executeSqlFile("src/db/seed/demo.sql", /;\s*(?:\r?\n|$)/);

function assert(condition, message) { if (!condition) throw new Error(`ÉCHEC: ${message}`); }
async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await mf.dispatchFetch(`http://aadm.test${path}`, { method, headers: { "CF-Connecting-IP": "127.0.0.1", ...(body ? { "Content-Type": "application/json", Origin: "http://aadm.test" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, payload: await response.json().catch(() => ({})), setCookie: response.headers.get("set-cookie") };
}

let result = await request("/api/auth/sign-up/email", { method: "POST", body: { name: "Trésorier lot 19", email: "tresorier-lot19@example.test", password: "MotDePasse-2026!", phone: "+33619190001", memberNumber: "TR-019" } });
assert(result.status === 200, "inscription du trésorier");
const user = await db.prepare("SELECT id FROM auth_user WHERE email = 'tresorier-lot19@example.test'").first();
const profile = await db.prepare("SELECT id FROM profiles WHERE auth_user_id = ?").bind(user.id).first();
await db.batch([
  db.prepare("UPDATE profiles SET status = 'active', central_access = 1 WHERE id = ?").bind(profile.id),
  db.prepare("INSERT INTO user_roles (profile_id, role_id) VALUES (?, 'role_treasurer')").bind(profile.id),
  db.prepare("INSERT INTO households (id, office_id, name, joined_at, status) VALUES ('h19', 'office_paris', 'Foyer paiement unique', '2021-01-01', 'active')"),
  db.prepare("INSERT INTO members (id, member_number, first_name, last_name, gender, birth_date, joined_at, status) VALUES ('m19','M19-A','Adama','Unique','male','1980-01-01','2021-01-01','active')"),
  db.prepare("INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at) VALUES ('hm19','h19','m19','head','2021-01-01')"),
  db.prepare(`INSERT INTO contribution_dues (id, household_id, office_id, member_id, rule_id, due_date, contribution_kind, expected_amount_cents, age_snapshot, working_snapshot, paid_amount_cents, status, source) VALUES
    ('due19a','h19','office_paris','m19','rule_aadm_repatriation_2021','2026-03-08','annual_repatriation',6000,46,0,0,'overdue','system'),
    ('due19q','h19','office_paris','m19','rule_aadm_working_man_2021','2026-03-08','quarterly_working_man',2000,46,1,0,'overdue','system')`),
]);
result = await request("/api/auth/sign-in/email", { method: "POST", body: { email: "tresorier-lot19@example.test", password: "MotDePasse-2026!" } });
assert(result.status === 200 && result.setCookie, "connexion du trésorier");
const cookie = result.setCookie.split(";")[0];
result = await request("/api/office/members/search?q=M19-A", { cookie });
assert(result.status === 200 && result.payload.results.length === 1, "membre retrouvé");
const source = { memberReference: result.payload.results[0].memberReference };

result = await request("/api/office/payments", { method: "POST", cookie, body: { source, amountCents: 2000, paymentDate: "2026-03-08", idempotencyKey: "00000000-0000-4000-8000-000000000019", note: "Tentative partielle" } });
assert(result.status === 409 && result.payload.error === "ANNUAL_REPATRIATION_REQUIRES_FULL_PAYMENT" && result.payload.requiredAmountCents === 6000, "paiement partiel de 20 € refusé");
let counts = await db.prepare("SELECT COUNT(*) AS payments FROM payments WHERE household_id = 'h19'").first();
assert(counts.payments === 0, "aucune écriture après le refus");

result = await request("/api/office/payments", { method: "POST", cookie, body: { source, amountCents: 6000, paymentDate: "2026-03-08", idempotencyKey: "00000000-0000-4000-8000-000000000020", note: "Rapatriement complet" } });
assert(result.status === 201 && result.payload.allocatedAmountCents === 6000, "paiement unique de 60 € accepté");
let annual = await db.prepare("SELECT paid_amount_cents AS paid, status FROM contribution_dues WHERE id = 'due19a'").first();
let quarterly = await db.prepare("SELECT paid_amount_cents AS paid, status FROM contribution_dues WHERE id = 'due19q'").first();
assert(annual.paid === 6000 && annual.status === "paid", "rapatriement intégralement payé");
assert(quarterly.paid === 0 && quarterly.status === "overdue", "trimestrielle encore due");

result = await request("/api/office/payments", { method: "POST", cookie, body: { source, amountCents: 1000, paymentDate: "2026-03-08", idempotencyKey: "00000000-0000-4000-8000-000000000021", note: "Trimestrielle partielle autorisée" } });
assert(result.status === 201 && result.payload.allocatedAmountCents === 1000, "paiement partiel trimestriel accepté");
quarterly = await db.prepare("SELECT paid_amount_cents AS paid, status FROM contribution_dues WHERE id = 'due19q'").first();
assert(quarterly.paid === 1000 && quarterly.status === "partial", "trimestrielle partielle inchangée");
console.log(JSON.stringify({ ok: true, annualPartialStatus: 409, annualRequiredEur: 60, annualFullPaymentStatus: 201, quarterlyPartialStatus: 201 }, null, 2));
await mf.dispose();
