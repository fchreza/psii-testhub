-- LOKAL SAJA: memerlukan persetujuan eksplisit sebelum diterapkan ke produksi.
-- Tidak membaca/mengubah hasil pengujian atau akun uji yang sudah ada.
-- PDF disimpan privat sebagai bytea (bukan bucket publik/signed URL).
BEGIN;
CREATE TABLE IF NOT EXISTS th_final_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id varchar(20) NOT NULL REFERENCES th_projects(id) ON DELETE RESTRICT,
  versi integer NOT NULL CHECK (versi > 0),
  dibuat_pada timestamptz NOT NULL,
  dibuat_oleh uuid NOT NULL,
  nama_penyusun text NOT NULL,
  sidik_sumber varchar(64) NOT NULL CHECK (sidik_sumber ~ '^[0-9a-f]{64}$'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  pdf bytea NOT NULL CHECK (octet_length(pdf) > 0),
  CONSTRAINT th_final_reports_project_version_key UNIQUE(project_id, versi)
);
CREATE OR REPLACE FUNCTION th_lindungi_laporan_final() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Snapshot laporan final bersifat immutable; buat versi baru.';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS th_final_reports_immutable ON th_final_reports;
CREATE TRIGGER th_final_reports_immutable
  BEFORE UPDATE OR DELETE ON th_final_reports
  FOR EACH ROW EXECUTE FUNCTION th_lindungi_laporan_final();
COMMENT ON TABLE th_final_reports IS 'Snapshot UAT immutable. Akses hanya melalui API terautentikasi Admin/Internal PSII/Pimpinan.';
COMMIT;
