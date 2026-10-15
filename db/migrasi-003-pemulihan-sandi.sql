-- PSII TestHub — migrasi 003: pemulihan sandi via tautan email
-- Token mentah tidak disimpan. email_hash/ip_hash adalah HMAC, bukan data alamat asli.
-- Permintaan tanpa akun tetap dicatat untuk membatasi spam tanpa mengungkap keberadaan akun.

ALTER TABLE th_users
  ADD COLUMN IF NOT EXISTS sesi_versi integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS th_password_resets (
  id              bigserial PRIMARY KEY,
  user_id         uuid REFERENCES th_users(id) ON DELETE CASCADE,
  email_hash      varchar(64) NOT NULL,
  ip_hash         varchar(64) NOT NULL,
  token_hash      varchar(64) UNIQUE,
  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  kedaluwarsa_pada timestamptz,
  digunakan_pada  timestamptz
);

CREATE INDEX IF NOT EXISTS th_password_resets_email_idx ON th_password_resets (email_hash, dibuat_pada DESC);
CREATE INDEX IF NOT EXISTS th_password_resets_ip_idx ON th_password_resets (ip_hash, dibuat_pada DESC);
CREATE INDEX IF NOT EXISTS th_password_resets_user_idx ON th_password_resets (user_id, dibuat_pada DESC);
