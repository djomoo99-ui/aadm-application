INSERT OR IGNORE INTO `offices`
  (`id`, `code`, `name`, `city`, `kind`, `meeting_ordinal`, `meeting_weekday`, `status`)
VALUES
  ('office_paris', 'PARIS', 'Bureau central de Paris', 'Paris', 'central', 2, 0, 'active');
--> statement-breakpoint
INSERT OR IGNORE INTO `roles` (`id`, `code`, `name`) VALUES
  ('role_member', 'member', 'Membre'),
  ('role_data_entry', 'data_entry', 'Agent de saisie'),
  ('role_controller', 'controller', 'Contrôleur'),
  ('role_treasurer', 'treasurer', 'Trésorier'),
  ('role_admin', 'admin', 'Administrateur');
--> statement-breakpoint
INSERT OR IGNORE INTO `app_settings` (`key`, `value`) VALUES
  ('history_start_date', json('"2021-01-01"')),
  ('association_name', json('"AADM"')),
  ('currency', json('"EUR"'));
