-- PSII TestHub — migrasi 006: kredensial akun uji per proyek.
-- Pilih dan tinjau file ini secara eksplisit; jangan terapkan ke production
-- sebelum pemilik menyetujui payload SQL lengkap.
-- Tabel tidak menyimpan username/password dalam plaintext. Payload AES-256-GCM,
-- nonce, tag, dan versi format disimpan terpisah untuk autentikasi/dekripsi.

CREATE TABLE IF NOT EXISTS th_project_test_accounts (
  project_id      varchar(20) PRIMARY KEY REFERENCES th_projects(id) ON DELETE CASCADE,
  format_version  smallint NOT NULL DEFAULT 1 CHECK (format_version = 1),
  nonce           bytea NOT NULL CHECK (octet_length(nonce) = 12),
  ciphertext      bytea NOT NULL CHECK (octet_length(ciphertext) > 0),
  auth_tag        bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
  diubah_oleh     uuid REFERENCES th_users(id) ON DELETE SET NULL,
  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  diubah_pada     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS th_project_test_accounts_diubah_idx
  ON th_project_test_accounts (diubah_pada DESC);
