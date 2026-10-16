-- PSII TestHub — migrasi 005: ketahanan upload, penghapusan, dan login.
-- Migrasi harus dipilih eksplisit. Jangan menjalankan di production tanpa
-- persetujuan pemilik setelah meninjau SQL lengkap.

ALTER TABLE th_evidence
  ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'READY',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE th_evidence
  DROP CONSTRAINT IF EXISTS th_evidence_status_sah,
  ADD CONSTRAINT th_evidence_status_sah
    CHECK (status IN ('READY', 'DELETE_PENDING', 'DELETED'));

CREATE INDEX IF NOT EXISTS th_evidence_status_idx
  ON th_evidence (scenario_id, status, diunggah_pada DESC);

-- Intensi upload persisten membuat permintaan ulang aman, dan memberi bahan
-- rekonsiliasi bila storage berhasil tetapi transaksi metadata/audit gagal.
CREATE TABLE IF NOT EXISTS th_evidence_uploads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES th_users(id) ON DELETE RESTRICT,
  project_id      varchar(20) NOT NULL REFERENCES th_projects(id) ON DELETE CASCADE,
  scenario_id     uuid NOT NULL REFERENCES th_scenarios(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  staging_path    varchar(400) NOT NULL UNIQUE,
  final_path      varchar(400) NOT NULL UNIQUE,
  nama_asli       varchar(240) NOT NULL,
  tipe            varchar(80) NOT NULL,
  ukuran          integer NOT NULL CHECK (ukuran > 0 AND ukuran <= 10485760),
  status          varchar(20) NOT NULL DEFAULT 'UPLOADING'
                  CHECK (status IN ('UPLOADING', 'COMPLETED', 'EXPIRED', 'REJECTED')),
  evidence_id     uuid REFERENCES th_evidence(id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL,
  staging_cleaned_at timestamptz,
  last_error      text,
  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  diubah_pada     timestamptz NOT NULL DEFAULT now(),
  selesai_pada    timestamptz,
  CONSTRAINT th_evidence_upload_idempotency_unik UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS th_evidence_uploads_status_expiry_idx
  ON th_evidence_uploads (status, expires_at);

-- Hash HMAC email disimpan, bukan alamat email mentah. TTL 15 menit diterapkan
-- dalam query PostgreSQL agar batas tetap konsisten lintas instance/restart.
CREATE TABLE IF NOT EXISTS th_login_rate_limits (
  email_hash       char(64) PRIMARY KEY,
  attempts         integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until    timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS th_login_rate_limits_updated_idx
  ON th_login_rate_limits (updated_at);
