-- PSII TestHub — migrasi 007: banyak akun uji per proyek.
-- Menjaga ciphertext, nonce, tag, format_version, audit, dan relasi proyek
-- yang sudah ada. Baris lama hanya mendapat UUID dan label default.
-- Tinjau dan setujui SQL lengkap sebelum penerapan production.

BEGIN;

ALTER TABLE th_project_test_accounts
  ADD COLUMN id uuid;

UPDATE th_project_test_accounts
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE th_project_test_accounts
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE th_project_test_accounts
  ADD COLUMN nama_akun varchar(100) NOT NULL DEFAULT 'Akun uji 1';

ALTER TABLE th_project_test_accounts
  ALTER COLUMN nama_akun DROP DEFAULT;

ALTER TABLE th_project_test_accounts
  DROP CONSTRAINT th_project_test_accounts_pkey;

ALTER TABLE th_project_test_accounts
  ADD CONSTRAINT th_project_test_accounts_pkey PRIMARY KEY (id);

ALTER TABLE th_project_test_accounts
  DROP CONSTRAINT IF EXISTS th_project_test_accounts_format_version_check;

ALTER TABLE th_project_test_accounts
  ADD CONSTRAINT th_project_test_accounts_format_version_check
  CHECK (format_version IN (1, 2));

CREATE INDEX IF NOT EXISTS th_project_test_accounts_project_idx
  ON th_project_test_accounts (project_id, nama_akun, dibuat_pada DESC, id);

COMMIT;
