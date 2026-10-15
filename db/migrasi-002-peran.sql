-- PSII TestHub — migrasi 002: konsolidasi matriks peran
-- Jalankan setelah migrasi-001. Dapat dijalankan ulang dengan aman.

ALTER TABLE th_users DROP CONSTRAINT IF EXISTS th_users_peran_sah;

UPDATE th_users
SET peran = CASE peran
  WHEN 'PM' THEN 'INTERNAL_PSII'
  WHEN 'QA' THEN 'INTERNAL_PSII'
  WHEN 'DEVELOPER' THEN 'INTERNAL_PSII'
  WHEN 'BUSINESS_USER' THEN 'INTERNAL_KEMENKEU'
  WHEN 'EKSTERNAL' THEN 'EKSTERNAL_KEMENKEU'
  ELSE peran
END;

ALTER TABLE th_users
  ADD CONSTRAINT th_users_peran_sah CHECK (peran IN (
    'ADMIN', 'PIMPINAN', 'INTERNAL_PSII', 'INTERNAL_KEMENKEU', 'EKSTERNAL_KEMENKEU'
  ));

ALTER TABLE th_users ALTER COLUMN peran SET DEFAULT 'INTERNAL_PSII';
