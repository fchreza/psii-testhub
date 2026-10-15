-- PSII TestHub — migrasi 004
-- Tambahkan identitas aplikasi/modul dan jenis pengujian pada proyek.
-- File ini disiapkan untuk review; jangan jalankan di production tanpa persetujuan.

ALTER TABLE th_projects
  ADD COLUMN IF NOT EXISTS aplikasi varchar(160),
  ADD COLUMN IF NOT EXISTS modul varchar(160),
  ADD COLUMN IF NOT EXISTS jenis_pengujian varchar(10);

-- Pertahankan nilai lama yang sebelumnya digabung sebagai "Modul / Aplikasi".
-- Kolom lama tidak dihapus; kolom modul baru dibiarkan kosong agar tidak
-- mengarang pemisahan data yang dahulu tidak dicatat terpisah.
UPDATE th_projects
SET aplikasi = COALESCE(aplikasi, modul_aplikasi),
    jenis_pengujian = COALESCE(jenis_pengujian, CASE
      WHEN EXISTS (
        SELECT 1 FROM th_scenarios s
        WHERE s.project_id = th_projects.id AND s.fase = 'SIT'
      ) AND EXISTS (
        SELECT 1 FROM th_scenarios s
        WHERE s.project_id = th_projects.id AND s.fase = 'UAT'
      ) THEN 'SIT_UAT'
      WHEN EXISTS (
        SELECT 1 FROM th_scenarios s
        WHERE s.project_id = th_projects.id AND s.fase = 'UAT'
      ) OR tahap = 'UAT' THEN 'UAT'
      ELSE 'SIT'
    END)
WHERE aplikasi IS NULL OR jenis_pengujian IS NULL;

ALTER TABLE th_projects
  ALTER COLUMN jenis_pengujian SET DEFAULT 'SIT',
  ALTER COLUMN jenis_pengujian SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'th_projects_jenis_pengujian_sah'
      AND conrelid = 'th_projects'::regclass
  ) THEN
    ALTER TABLE th_projects
      ADD CONSTRAINT th_projects_jenis_pengujian_sah
      CHECK (jenis_pengujian IN ('SIT', 'UAT', 'SIT_UAT'));
  END IF;
END $$;

-- Riwayat per skenario sebelumnya hanya berindeks project_id, sehingga panel
-- detail dapat lambat ketika log proyek sudah banyak.
CREATE INDEX IF NOT EXISTS th_audit_scenario_idx
  ON th_audit_logs (scenario_id, pada DESC);
