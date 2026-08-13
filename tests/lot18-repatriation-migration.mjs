import { readdir, readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const moduleFiles = (await readdir("dist/aadm_app", { recursive: true })).filter((path) => path.endsWith(".js"))
  .map((path) => `dist/aadm_app/${path}`).sort((left) => left.endsWith("/index.js") ? -1 : 1);
const mf = new Miniflare({ compatibilityDate: "2026-07-15", compatibilityFlags: ["nodejs_compat"],
  modules: moduleFiles.map((path) => ({ type: "ESModule", path })), d1Databases: { DB: "aadm-lot18-test" },
  bindings: { APP_ENV: "test", AUTH_SECRET: "0123456789abcdef0123456789abcdef", QR_TOKEN_SECRET: "abcdef0123456789abcdef0123456789" } });
const db = await mf.getD1Database("DB");
async function executeSqlFile(path, separator) {
  for (const statement of (await readFile(path, "utf8")).split(separator).map((value) => value.trim()).filter(Boolean))
    await db.prepare(statement.replace(/;\s*$/, "")).run();
}
const migrations = (await readdir("src/db/migrations")).filter((name) => name.endsWith(".sql")).sort();
for (const migration of migrations.filter((name) => name < "0012_")) await executeSqlFile(`src/db/migrations/${migration}`, /--> statement-breakpoint/);
await executeSqlFile("src/db/seed/demo.sql", /;\s*(?:\r?\n|$)/);

await db.batch([
  db.prepare("UPDATE contribution_dues SET expected_amount_cents = 2000, paid_amount_cents = 2000, status = 'paid' WHERE id = 'due_demo_2026_repatriation'"),
  db.prepare(`INSERT INTO members (id, member_number, first_name, last_name, gender, birth_date, joined_at, status) VALUES
    ('m18f','M18-F','Fatou','Test','female','1990-01-01','2021-01-01','active'),
    ('m18c','M18-C','Enfant','Test','female','2015-01-01','2021-01-01','active')`),
  db.prepare(`INSERT INTO household_memberships (id, household_id, member_id, relationship, starts_at) VALUES
    ('hm18f','household_demo_sidibe','m18f','partner','2021-01-01'),
    ('hm18c','household_demo_sidibe','m18c','child','2021-01-01')`),
  db.prepare(`INSERT INTO contribution_dues
    (id, household_id, office_id, member_id, rule_id, due_date, contribution_kind, expected_amount_cents, age_snapshot, paid_amount_cents, status, source)
    VALUES
    ('due18f','household_demo_sidibe','office_paris','m18f','rule_aadm_repatriation_2021','2024-03-10','annual_repatriation',2000,34,2000,'paid','system'),
    ('due18c','household_demo_sidibe','office_paris','m18c','rule_aadm_repatriation_2021','2024-03-10','annual_repatriation',2000,9,0,'overdue','system')`),
]);
await executeSqlFile("src/db/migrations/0012_correct_repatriation_dues.sql", /--> statement-breakpoint/);

function assert(condition, message) { if (!condition) throw new Error(`ÉCHEC: ${message}`); }
const dues = await db.prepare("SELECT id, expected_amount_cents AS expected, paid_amount_cents AS paid, status FROM contribution_dues WHERE id IN ('due_demo_2026_repatriation','due18f','due18c','due_demo_2026_03') ORDER BY id").all();
const byId = new Map(dues.results.map((due) => [due.id, due]));
assert(byId.get("due_demo_2026_repatriation").expected === 6000 && byId.get("due_demo_2026_repatriation").paid === 2000 && byId.get("due_demo_2026_repatriation").status === "partial", "homme adulte corrigé à 60 €, paiement de 20 € conservé");
assert(byId.get("due18f").expected === 2000 && byId.get("due18f").status === "paid", "femme adulte maintenue à 20 €");
assert(byId.get("due18c").expected === 1000, "enfant corrigé à 10 €");
assert(byId.get("due_demo_2026_03").expected === 2000, "cotisation trimestrielle inchangée à 20 €");
console.log(JSON.stringify({ ok: true, adultManAnnualEur: 60, adultWomanAnnualEur: 20, childAnnualEur: 10, existingPaymentPreservedEur: 20, resultingStatus: "partial", quarterlyEur: 20 }, null, 2));
await mf.dispose();
