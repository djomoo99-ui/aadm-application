import { spawnSync } from "node:child_process";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  console.error("Utilisation : npm run admin:promote:remote -- votre@email.fr");
  process.exit(1);
}

const escapedEmail = email.replaceAll("'", "''");
const profileQuery = `(SELECT p.id FROM profiles p JOIN auth_user u ON u.id = p.auth_user_id WHERE u.email = '${escapedEmail}')`;
const userQuery = `(SELECT id FROM auth_user WHERE email = '${escapedEmail}')`;
const sql = [
  `UPDATE profiles SET status = 'active', office_id = 'office_paris', central_access = true, approved_by = ${profileQuery}, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE auth_user_id = ${userQuery}`,
  `INSERT INTO user_roles (profile_id, role_id, assigned_by) SELECT p.id, 'role_admin', p.id FROM profiles p JOIN auth_user u ON u.id = p.auth_user_id WHERE u.email = '${escapedEmail}' ON CONFLICT(profile_id, role_id) DO UPDATE SET revoked_at = NULL, assigned_by = excluded.assigned_by, assigned_at = CURRENT_TIMESTAMP`,
  `UPDATE access_requests SET status = 'approved', reviewed_by = ${profileQuery}, reviewed_at = CURRENT_TIMESTAMP, review_note = 'Activation initiale sécurisée' WHERE auth_user_id = ${userQuery} AND status = 'pending'`,
].join("; ");

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(executable, ["wrangler", "d1", "execute", "aadm-db", "--remote", "--command", sql], { stdio: "inherit", shell: false });
if (result.error) {
  console.error(`Impossible de lancer Wrangler : ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
