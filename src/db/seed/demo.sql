PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO offices (id, code, name, city, kind, meeting_ordinal, meeting_weekday, status)
VALUES ('office_paris', 'PARIS', 'Bureau central de Paris', 'Paris', 'central', 2, 0, 'active');

INSERT OR IGNORE INTO roles (id, code, name) VALUES
  ('role_member', 'member', 'Membre'),
  ('role_data_entry', 'data_entry', 'Agent de saisie'),
  ('role_controller', 'controller', 'Contrôleur'),
  ('role_treasurer', 'treasurer', 'Trésorier'),
  ('role_admin', 'admin', 'Administrateur');

INSERT OR IGNORE INTO households (id, name, phone, joined_at, status)
VALUES ('household_demo_sidibe', 'Famille Sidibé', '+33600000048', '2021-01-01', 'active');

INSERT OR IGNORE INTO household_office_assignments (id, household_id, office_id, starts_at, reason)
VALUES ('office_assignment_demo_sidibe', 'household_demo_sidibe', 'office_paris', '2021-01-01', 'Rattachement initial de démonstration');

INSERT OR IGNORE INTO members (
  id, member_number, first_name, last_name, gender, birth_date, phone, joined_at, status
) VALUES (
  'member_demo_adama', '00482', 'Adama', 'Sidibé', 'male', '1990-01-01', '+33600000048', '2021-01-01', 'active'
);

INSERT OR IGNORE INTO household_memberships (
  id, household_id, member_id, relationship, starts_at
) VALUES (
  'membership_demo_adama', 'household_demo_sidibe', 'member_demo_adama', 'head', '2021-01-01'
);

INSERT OR IGNORE INTO member_activity_periods (
  id, member_id, status, starts_at, reason
) VALUES (
  'activity_demo_adama', 'member_demo_adama', 'working', '2021-01-01', 'Donnée fictive de démonstration'
);

INSERT OR IGNORE INTO contribution_dues (
  id, household_id, office_id, member_id, rule_id, due_date, contribution_kind,
  expected_amount_cents, child_count_snapshot, age_snapshot, working_snapshot,
  paid_amount_cents, status, source, verified_at
) VALUES
  ('due_demo_2026_repatriation', 'household_demo_sidibe', 'office_paris', 'member_demo_adama', 'rule_aadm_repatriation_2021', '2026-03-08', 'annual_repatriation', 6000, 0, 36, 0, 6000, 'paid', 'system', CURRENT_TIMESTAMP),
  ('due_demo_2026_03', 'household_demo_sidibe', 'office_paris', 'member_demo_adama', 'rule_aadm_working_man_2021', '2026-03-08', 'quarterly_working_man', 2000, 0, 36, 1, 2000, 'paid', 'system', CURRENT_TIMESTAMP),
  ('due_demo_2026_06', 'household_demo_sidibe', 'office_paris', 'member_demo_adama', 'rule_aadm_working_man_2021', '2026-06-14', 'quarterly_working_man', 2000, 0, 36, 1, 1000, 'partial', 'system', CURRENT_TIMESTAMP),
  ('due_demo_2026_09', 'household_demo_sidibe', 'office_paris', 'member_demo_adama', 'rule_aadm_working_man_2021', '2026-09-13', 'quarterly_working_man', 2000, 0, 36, 1, 0, 'upcoming', 'system', CURRENT_TIMESTAMP),
  ('due_demo_2026_12', 'household_demo_sidibe', 'office_paris', 'member_demo_adama', 'rule_aadm_working_man_2021', '2026-12-13', 'quarterly_working_man', 2000, 0, 36, 1, 0, 'upcoming', 'system', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('history_start_date', json('"2021-01-01"')),
  ('association_name', json('"AADM"')),
  ('currency', json('"EUR"'));
