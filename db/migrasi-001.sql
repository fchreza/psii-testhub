-- PSII TestHub — migrasi 001
-- Skema Irisan 1: pengguna, proyek, modul, skenario, bukti, audit.
--
-- Awalan `th_` (TestHub) supaya tidak bentrok dengan tabel proyek lain yang
-- memakai database Neon yang sama. Schema terpisah TIDAK dipakai karena Neon
-- menolak `search_path` sebagai parameter startup di koneksi pooled — sudah
-- pernah terjadi dan menghabiskan waktu.

-- ============================================================
-- PENGGUNA
-- ============================================================
CREATE TABLE IF NOT EXISTS th_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         varchar(160) NOT NULL,
  nama          varchar(120) NOT NULL,
  jabatan       varchar(80),
  /*
   * Peran menentukan hak akses. EKSTERNAL dipisah dari BUSINESS_USER karena
   * pengguna luar Kemenkeu hanya boleh melihat proyek yang ia menjadi
   * anggotanya — sedangkan pegawai internal melihat semuanya.
   */
  peran         varchar(20) NOT NULL DEFAULT 'QA',
  sandi_hash    varchar(200),
  aktif         boolean NOT NULL DEFAULT true,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT th_users_peran_sah CHECK (peran IN
    ('ADMIN','PIMPINAN','PM','QA','DEVELOPER','BUSINESS_USER','EKSTERNAL'))
);
-- Email unik tanpa peduli besar-kecil huruf: "Budi@x.id" dan "budi@x.id"
-- adalah orang yang sama, dan mengizinkan keduanya berarti dua akun.
CREATE UNIQUE INDEX IF NOT EXISTS th_users_email_unik ON th_users (lower(email));

-- ============================================================
-- PROYEK
-- ============================================================
CREATE TABLE IF NOT EXISTS th_projects (
  id                varchar(20) PRIMARY KEY,          -- PRJ-001
  nama              varchar(200) NOT NULL,
  modul_aplikasi    varchar(160),
  unit_bisnis       varchar(160),
  pm_id             uuid REFERENCES th_users(id) ON DELETE SET NULL,

  -- Metadata dari halaman Cover berkas contoh. Semuanya berguna:
  -- Dasar Regulasi menentukan VERSI ATURAN yang diuji (PER-4/PB/2026 berbeda
  -- dari PER-3/PB/2025), dan Lingkungan menentukan hasilnya boleh dipakai
  -- untuk mengesahkan produksi atau tidak.
  ruang_lingkup     text,
  sumber_acuan      varchar(200),
  dasar_regulasi    varchar(200),
  lingkungan        varchar(10) NOT NULL DEFAULT 'DEV',
  alamat_server     varchar(300),
  tahun_anggaran    integer,
  versi_dokumen     varchar(40),
  disusun_oleh      varchar(160),
  status_dokumen    varchar(60),

  tanggal_mulai     date,
  target_selesai    date,
  tahap             varchar(20) NOT NULL DEFAULT 'PERSIAPAN',
  dibuat_pada       timestamptz NOT NULL DEFAULT now(),
  diubah_pada       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT th_projects_lingkungan_sah CHECK (lingkungan IN ('DEV','SIT','UAT','PROD')),
  /*
   * CATATAN: PRD menulis tahap ini sebagai WAITING_BAST. BAST adalah istilah
   * untuk Berita Acara Serah Terima — dokumen yang BERBEDA dari Berita Acara
   * SIT/UAT. Dipakai WAITING_SIGNOFF supaya namanya tidak menyesatkan
   * pembaca berikutnya.
   */
  CONSTRAINT th_projects_tahap_sah CHECK (tahap IN
    ('PERSIAPAN','SIT','UAT','WAITING_SIGNOFF','SELESAI'))
);

-- Keanggotaan proyek. Dipakai untuk membatasi pengguna eksternal.
CREATE TABLE IF NOT EXISTS th_project_members (
  project_id  varchar(20) NOT NULL REFERENCES th_projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES th_users(id) ON DELETE CASCADE,
  peran_proyek varchar(40),
  ditambahkan_pada timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

-- ============================================================
-- MODUL
-- ============================================================
-- Modul BUKAN kolom di skenario, tapi tabel tersendiri.
--
-- KENAPA: di berkas contoh, pengelompokan A-F berasal dari NAMA SHEET, bukan
-- dari kolom. Menjadikannya tabel berarti satu modul bisa punya nama panjang
-- ("A. Penyampaian Data Pejabat (DAU SG)") sekaligus kode pendek ("A"), dan
-- rekap per modul tidak perlu menebak dari teks.
CREATE TABLE IF NOT EXISTS th_modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  varchar(20) NOT NULL REFERENCES th_projects(id) ON DELETE CASCADE,
  kode        varchar(10) NOT NULL,                   -- "A"
  nama        varchar(200) NOT NULL,                  -- "Penyampaian Data Pejabat (DAU SG)"
  urutan      integer NOT NULL DEFAULT 0,
  UNIQUE (project_id, kode)
);

-- ============================================================
-- SKENARIO — 8 atribut PRD
-- ============================================================
CREATE TABLE IF NOT EXISTS th_scenarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    varchar(20) NOT NULL REFERENCES th_projects(id) ON DELETE CASCADE,
  module_id     uuid REFERENCES th_modules(id) ON DELETE SET NULL,

  /*
   * `kode` dipisah dari `id`.
   *
   * KENAPA: `kode` ("A-01") adalah penomoran yang dilihat manusia dan bisa
   * berubah saat impor ulang. Kalau ia jadi primary key, setiap penomoran
   * ulang memaksa seluruh relasi (bukti, audit) ikut diperbarui — dan satu
   * yang terlewat menghasilkan data menggantung.
   */
  kode          varchar(20) NOT NULL,
  fase          varchar(3) NOT NULL DEFAULT 'SIT',

  -- === 8 atribut PRD ===
  -- 2. Judul Skenario
  judul               varchar(200) NOT NULL,
  -- 3. Langkah Pengujian
  langkah_pengujian   text,
  -- 4. Hasil yang Diharapkan
  hasil_diharapkan    text,
  -- 5. Penguji
  penguji_id          uuid REFERENCES th_users(id) ON DELETE SET NULL,
  -- 6. Bukti -> tabel th_evidence (banyak berkas per skenario)
  -- 7. Status Uji
  status              varchar(10) NOT NULL DEFAULT 'PENDING',
  -- 8. Catatan Tindak Lanjut
  catatan_tindak_lanjut text,

  /*
   * Kolom di bawah ini SUDAH ADA tapi BELUM DIPAKAI di antarmuka.
   *
   * KENAPA DISIAPKAN: keputusan pemilik produk adalah memakai 8 kolom PRD,
   * bukan 11 kolom seperti berkas nyata. Akibatnya tidak ada tempat khusus
   * untuk "Hasil Aktual / Temuan" — padahal di berkas nyata kolom itu terpisah
   * dari Catatan Tindak Lanjut (yang satu mencatat APA YANG TERJADI, yang satu
   * APA YANG HARUS DILAKUKAN).
   *
   * Dengan kolom ini sudah ada, menampilkannya nanti cukup mengubah formulir —
   * tanpa migrasi, tanpa menyentuh data yang sudah masuk.
   */
  tujuan_pengujian    text,
  prekondisi          text,
  data_uji            text,
  hasil_aktual        text,

  -- Penanda kesiapan retest, diisi peran Developer (peran ini ada di PRD
  -- Bagian 4 tapi tidak punya kolom di skema PRD Bagian 7).
  siap_retest         boolean NOT NULL DEFAULT false,

  urutan        integer NOT NULL DEFAULT 0,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  /*
   * `diubah_pada` dipakai sebagai kunci optimistik: server menolak simpanan
   * yang membawa nilai lama. Tanpa ini, dua orang yang mengubah skenario yang
   * sama akan saling menimpa tanpa peringatan.
   */
  diubah_pada   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT th_scenarios_fase_sah CHECK (fase IN ('SIT','UAT')),
  CONSTRAINT th_scenarios_status_sah CHECK (status IN ('PENDING','PASS','FAIL','BLOCKED')),
  CONSTRAINT th_scenarios_kode_unik UNIQUE (project_id, fase, kode)
);

-- ============================================================
-- BUKTI
-- ============================================================
-- Banyak berkas per skenario.
--
-- KENAPA TIDAK SATU KOLOM SEPERTI PRD: di berkas contoh, satu skenario sering
-- butuh beberapa tangkapan layar (layar sebelum, sesudah, dan pesan galat).
-- Dengan satu kolom, penguji menggabungkan gambar jadi satu — dan buktinya
-- jadi tidak terbaca.
CREATE TABLE IF NOT EXISTS th_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id   uuid NOT NULL REFERENCES th_scenarios(id) ON DELETE CASCADE,
  path          varchar(400) NOT NULL,
  nama_asli     varchar(240),
  tipe          varchar(80),
  ukuran        integer,
  diunggah_oleh uuid REFERENCES th_users(id) ON DELETE SET NULL,
  diunggah_pada timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT
-- ============================================================
-- NFR-1 mewajibkan setiap perubahan Status Uji, Bukti, Catatan Tindak Lanjut,
-- dan Sign-Off tercatat. Sign-Off dicatat di tabelnya sendiri (Irisan 2);
-- tabel ini untuk perubahan skenario.
CREATE TABLE IF NOT EXISTS th_audit_logs (
  id          bigserial PRIMARY KEY,
  pada        timestamptz NOT NULL DEFAULT now(),
  user_id     uuid REFERENCES th_users(id) ON DELETE SET NULL,
  project_id  varchar(20),
  scenario_id uuid,
  aksi        varchar(20) NOT NULL,      -- ubah_status | ubah_catatan | tambah_bukti | hapus_bukti
  kolom       varchar(40),
  nilai_lama  text,
  nilai_baru  text
);

-- ============================================================
-- INDEKS
-- ============================================================
-- Tanpa indeks ini, dashboard dengan ribuan skenario akan memindai seluruh
-- tabel untuk setiap hitungan.
CREATE INDEX IF NOT EXISTS th_scenarios_project_idx ON th_scenarios (project_id, fase, status);
CREATE INDEX IF NOT EXISTS th_scenarios_penguji_idx ON th_scenarios (penguji_id);
CREATE INDEX IF NOT EXISTS th_scenarios_module_idx  ON th_scenarios (module_id, urutan);
CREATE INDEX IF NOT EXISTS th_evidence_scenario_idx ON th_evidence (scenario_id);
CREATE INDEX IF NOT EXISTS th_audit_project_idx     ON th_audit_logs (project_id, pada DESC);
CREATE INDEX IF NOT EXISTS th_modules_project_idx   ON th_modules (project_id, urutan);
CREATE INDEX IF NOT EXISTS th_members_user_idx      ON th_project_members (user_id);

-- ============================================================
-- PEMBARUAN OTOMATIS `diubah_pada`
-- ============================================================
-- Trigger lebih andal daripada kode aplikasi: ia menyala pada SETIAP update,
-- termasuk yang dilakukan lewat skrip impor atau perbaikan manual. Kalau
-- mengandalkan kode aplikasi, satu jalur yang terlewat membuat kunci
-- optimistik tidak berfungsi — dan tabrakan data kembali terjadi.
CREATE OR REPLACE FUNCTION th_sentuh_diubah() RETURNS trigger AS $$
BEGIN
  NEW.diubah_pada = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS th_scenarios_sentuh ON th_scenarios;
CREATE TRIGGER th_scenarios_sentuh
  BEFORE UPDATE ON th_scenarios
  FOR EACH ROW EXECUTE FUNCTION th_sentuh_diubah();

DROP TRIGGER IF EXISTS th_projects_sentuh ON th_projects;
CREATE TRIGGER th_projects_sentuh
  BEFORE UPDATE ON th_projects
  FOR EACH ROW EXECUTE FUNCTION th_sentuh_diubah();
