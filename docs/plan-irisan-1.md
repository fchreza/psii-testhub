# Implementation Plan — PSII TestHub, Irisan 1

**Tanggal:** 15 Oktober 2026
**Basis:** `docs/analisa-prd.md` + berkas contoh `Skenario UAT Penyesuaian Sistem Sesuai PER-4_PB_2026.xlsx`
**Cakupan:** Irisan 1 — inti yang menggantikan spreadsheet

---

## 0. Ringkasan berkas contoh — dan apa yang ia ubah

Berkas contoh itu bukan sekadar contoh format. Ia menunjukkan **apa yang benar-benar dipakai tim**, dan hasilnya berbeda dari PRD di beberapa titik penting.

### 0.1 Bentuk nyatanya

```
10 sheet:  Cover, Petunjuk, Rekap, Daftar User,
           A..F (6 sheet modul, masing-masing berisi skenario)

Kolom nyata (11 buah), bukan 8:
  ID | Judul Skenario | Tujuan Pengujian | Prekondisi | Data Uji / Prasyarat |
  Langkah Pengujian | Hasil yang Diharapkan | Hasil Aktual / Temuan |
  Hasil (Ya/Tidak) | Status | Catatan / Tindak Lanjut

42 skenario total di 6 sheet
47 gambar tertanam, 8,2 MB  ← inilah "kolom Bukti"
```

### 0.2 Tiga temuan yang mengubah rancangan

**Temuan 1 — PRD akan MENGHAPUS 5 kolom yang dipakai tim.**

PRD menetapkan 8 atribut. Berkas nyatanya punya 11 kolom. Lima kolom ini ada di lapangan tapi tidak ada di PRD:

| Kolom nyata | Kenapa penting |
|---|---|
| **Tujuan Pengujian** | Menjelaskan *mengapa* skenario ini ada. Tanpa ini, penguji tahu caranya tapi tidak tahu maksudnya. |
| **Prekondisi** | Keadaan yang harus ada sebelum uji. Ini yang membedakan "gagal" dari "belum bisa diuji". |
| **Data Uji / Prasyarat** | Data konkret yang dipakai. Tanpa ini, hasil uji tidak bisa diulang orang lain. |
| **Hasil Aktual / Temuan** | Apa yang benar-benar terjadi. **Ini inti pengujian** — PRD tidak memilikinya. |
| **Modul** | Pengelompokan (A–F). Rekap per modul bergantung padanya. |

**Kalau dibangun persis 8 atribut PRD, aplikasinya lebih buruk daripada spreadsheet** — penguji kehilangan tempat menulis temuan. Itu kegagalan yang paling mahal: dibangun, lalu ditinggalkan.

**Temuan 2 — bukti berupa GAMBAR TERTANAM, bukan kolom.**

47 gambar, 8,2 MB, tertanam di dalam berkas. Ini menjelaskan kenapa berkasnya 8 MB dan kenapa tidak bisa dibuka cepat. Di aplikasi, bukti harus jadi berkas terpisah — dan **inilah keuntungan terbesar yang bisa langsung dirasakan tim**.

**Temuan 3 — pengisian manual sudah bocor.**

```
Sheet A, B, C, E, F : status terisi semua
Sheet D             : 10 skenario, kolom Status KOSONG semua
                      padahal kolom Hasil (Ya/Tidak) terisi "Ya"

Rekap menyebut total 32, padahal ada 42 skenario.
Sheet D tidak masuk rekap — 10 skenario hilang dari hitungan.
```

Bukti bahwa spreadsheet sudah gagal sebagai alat: **10 dari 42 skenario (24%) tidak terhitung**. Ini argumen terkuat untuk proyek ini, dan sebaiknya disebut saat presentasi ke pimpinan.

### 0.3 Metadata proyek yang PRD tidak punya

Halaman Cover memuat informasi yang semuanya berguna dan semuanya hilang di skema PRD:

| Metadata | Contoh | Kenapa perlu |
|---|---|---|
| Modul / Aplikasi | OM-SPAN TKD | Satu proyek = satu aplikasi |
| Ruang Lingkup | Poin A s.d. F | Batas pengujian |
| Sumber Acuan | UR-OMSPAN-TKD Juni 2026 | Dasar dokumen |
| **Dasar Regulasi** | **PER-4/PB/2026** | **Menentukan versi aturan yang diuji** |
| **Lingkungan Uji** | **Dev** | **Hasil di Dev ≠ hasil di Prod** |
| Tahun Anggaran | 2026 | Konteks fiskal |
| Versi Dokumen | 1.0 (Draft UAT) | Riwayat revisi |
| Disusun oleh | Tim UAT | Penanggung jawab dokumen |
| Alamat Server | tkd-dev.apps... | Tempat pengujian |
| Status Dokumen | Draft — menunggu eksekusi | Keadaan dokumen |

**Dasar Regulasi** dan **Lingkungan Uji** adalah dua yang paling penting. Pengujian yang menguji PER-4/PB/2026 tidak sama dengan yang menguji PER-3/PB/2025 — dan hasil di lingkungan Dev tidak boleh dipakai untuk mengesahkan sistem produksi.

---

## 1. Permintaanmu yang memperluas cakupan

Yang kamu sebutkan menambah dua hal di luar PRD:

### 1.1 "Bisa digunakan pihak yang akan melakukan UAT — kantor vertikal Kemenkeu atau eksternal"

Ini **tidak ada di PRD**. Daftar 5 peran PRD semuanya internal. Menambahkan pengguna eksternal berarti:

- Pengguna luar **tidak boleh melihat seluruh portofolio proyek**. KPPN di Makassar tidak perlu tahu proyek apa saja yang sedang diuji subdit.
- Jadi butuh **keanggotaan per proyek**: seseorang hanya melihat proyek yang ia diundang ke dalamnya.

Ini menambah satu tabel (`project_members`) dan satu aturan akses. Bukan pekerjaan besar, tapi kalau tidak direncanakan dari awal, seluruh query harus ditulis ulang nanti.

**Usulan:** dua lingkup akses saja —
- **Internal** (PSII): melihat semua proyek
- **Eksternal**: hanya proyek yang ia menjadi anggotanya

Jangan bikin lebih rumit dari itu di fase 1.

### 1.2 "Ada chart chart atau tabel view dashboard untuk pimpinan"

Ini ada di PRD (Modul 4). Tapi perlu diputuskan: pimpinan perlu **chart** atau **angka dan tabel**?

Dari berkas contoh, pimpinan sebenarnya butuh:
- Berapa proyek berjalan, di tahap apa
- Berapa persen lulus per proyek
- Apa saja yang gagal/tertunda
- Mana yang menunggu tanda tangan

Semua itu **terjawab angka dan tabel**. Chart batang menambah kejelasan visual tapi bukan penambah informasi.

**Usulan:** angka + bilah progres + tabel dulu. Chart menyusul di Irisan 5 setelah angkanya terbukti dipakai.

---

## 2. Cakupan Irisan 1 — tegas

### Masuk

```
1. Masuk/keluar, 5 peran + admin, keanggotaan proyek
2. Daftar proyek (buat, lihat, arsipkan) + metadata Cover
3. Modul dalam proyek (A, B, C, ...)
4. Skenario SIT & UAT: 11 kolom (8 PRD + 5 nyata, minus yang tumpang tindih)
5. Ubah status uji dari dalam tabel (Pending/Pass/Fail/Blocked)
6. Unggah bukti — banyak berkas per skenario, kompres di browser
7. Catatan tindak lanjut + penanda siap retest
8. Penyaring: tahap, status, penguji, modul, kata kunci
9. Impor dari .xlsx lewat SKRIP (bukan UI)
10. Dashboard pimpinan: angka KPI + tabel portofolio
```

### Tidak masuk Irisan 1

```
Berita Acara + sign-off     -> Irisan 2
Penguncian data             -> Irisan 2
Audit log terperinci        -> Irisan 3
Chart batang                -> Irisan 5
Impor lewat UI              -> Irisan 5 (kalau memang perlu)
Notifikasi                  -> out of scope (PRD)
PDF                         -> out of scope (PRD)
```

---

## 3. Rangkaian pengerjaan

Disusun berurutan. Setiap langkah **bisa diperiksa hasilnya** sebelum lanjut ke langkah berikutnya.

### Langkah 1 — Fondasi proyek
- `create-next-app` (App Router, TypeScript, Tailwind)
- Neon Postgres + koneksi
- `lib/waktu.ts` — **satu** fungsi tanggal WIB untuk seluruh aplikasi
- Verifikasi: halaman kosong tampil, koneksi basis data hidup

### Langkah 2 — Skema basis data
Satu migrasi berisi seluruh tabel (lihat Bagian 4).
- Verifikasi: `\dt` menunjukkan semua tabel, 0 relasi putus

### Langkah 3 — Masuk & peran
- `lib/sesi.ts` — scrypt + `timingSafeEqual` + cookie bertanda tangan
- `lib/gerbang.ts` — pemeriksaan sesi untuk halaman & API
- Halaman masuk, halaman kelola pengguna (admin)
- Batas percobaan **per-email**
- Verifikasi: tanpa sesi 401/redirect; cookie ditempa ditolak; akun nonaktif langsung mati

### Langkah 4 — Proyek
- Daftar proyek + buat baru (dengan seluruh metadata Cover)
- Keanggotaan proyek (`project_members`)
- Verifikasi: pengguna eksternal hanya melihat proyeknya

### Langkah 5 — Modul & skenario
- Modul dalam proyek
- Tabel skenario dengan **11 kolom**
- Tambah/ubah/hapus baris
- Verifikasi: 42 skenario dari berkas contoh masuk lengkap

### Langkah 6 — Eksekusi
- Ubah status dari dalam tabel
- **Aturan: status Fail/Blocked wajib punya catatan ATAU bukti** (FR-2.5)
- Penanda siap retest (peran Developer)
- Verifikasi: coba simpan Fail tanpa catatan → ditolak dengan pesan jelas

### Langkah 7 — Bukti
- Kompres gambar di browser (canvas)
- Unggah langsung ke penyimpanan objek (URL bertanda tangan)
- Banyak berkas per skenario, pratinjau, hapus
- Verifikasi: unggah gambar 8 MB → tersimpan, ukuran terkompres, pratinjau tampil

### Langkah 8 — Penyaring & pencarian
- Tahap, status, penguji, modul, kata kunci
- Tampilan "perlu tindak lanjut" (lintas proyek) — ini Modul 3 yang sebenarnya cuma penyaring
- Verifikasi: angka cocok dengan hitungan manual

### Langkah 9 — Dashboard pimpinan
- 4 kartu KPI
- Tabel portofolio dengan bilah progres
- Verifikasi: angka cocok dengan data skenario

### Langkah 10 — Impor skrip
- Skrip terminal pembaca .xlsx → masukkan ke basis data
- Memetakan 11 kolom + nama sheet jadi Modul
- Menyimpan gambar tertanam sebagai bukti
- Verifikasi: 42 skenario + 47 gambar dari berkas contoh masuk utuh

---

## 4. Skema basis data

```
users
  id, email, nama, jabatan, peran, sandi_hash, aktif, created_at
  peran: ADMIN | PIMPINAN | PM | QA | DEVELOPER | BUSINESS_USER | EKSTERNAL

projects
  id (PRJ-001), nama, modul_aplikasi, unit_bisnis,
  pm_id -> users, ruang_lingkup, sumber_acuan, dasar_regulasi,
  lingkungan (DEV|SIT|UAT|PROD), alamat_server, tahun_anggaran,
  versi_dokumen, disusun_oleh, status_dokumen,
  tanggal_mulai, target_selesai,
  tahap (PERSIAPAN|SIT|UAT|MENUNGGU_SIGNOFF|SELESAI),
  dibuat_pada, diubah_pada

project_members            <- untuk pengguna eksternal
  project_id, user_id, peran_dalam_proyek

modules                    <- "A", "B", "C" ... (dari nama sheet)
  id, project_id, kode, nama, urutan

scenarios                  <- 11 kolom nyata
  id (UUID), project_id, module_id,
  kode              -- "A-01" (yang dilihat manusia)
  fase              -- SIT | UAT
  judul
  tujuan_pengujian
  prekondisi
  data_uji
  langkah_pengujian
  hasil_diharapkan
  hasil_aktual
  status            -- PENDING | PASS | FAIL | BLOCKED
  catatan_tindak_lanjut
  penguji_id -> users
  siap_retest       -- boolean, diisi Developer
  diubah_pada       -- untuk cek tabrakan

evidence
  id, scenario_id, path, nama_asli, tipe, ukuran, diunggah_oleh, diunggah_pada

audit_logs                 <- mulai dari yang wajib saja
  id, pada, user_id, project_id, scenario_id,
  aksi, kolom, nilai_lama, nilai_baru
```

### Catatan rancangan

**`kode` dipisah dari `id`.** `id` UUID untuk relasi; `kode` ("A-01") untuk manusia. Kalau `kode` jadi primary key, impor ulang dan penomoran ulang jadi menyakitkan.

**Kolom "Hasil (Ya/Tidak)" tidak disimpan.** Di berkas contoh ia duplikat dari Status: "Ya" = Pass. Menyimpan keduanya berarti bisa bertentangan. Diturunkan dari status saja.

**`hasil_aktual` disimpan terpisah dari `catatan_tindak_lanjut`.** Di berkas contoh keduanya kolom berbeda, dan memang beda maksud: yang satu "apa yang terjadi", yang satu "apa yang harus dilakukan".

**`lingkungan` disimpan di proyek, bukan skenario.** Satu proyek diuji di satu lingkungan. Kalau nanti perlu per-skenario, tinggal dipindah.

---

## 5. Aturan yang harus diputuskan kode, bukan manusia

Ini yang mencegah masalah yang sudah terlihat di spreadsheet:

| Aturan | Kenapa |
|---|---|
| Status Fail/Blocked wajib punya catatan atau bukti | Sudah diminta PRD FR-2.5. Mencegah "gagal tanpa penjelasan". |
| Tingkat kelulusan = lulus ÷ **semua** skenario | Keputusanmu. Angka 60% mengukur kemajuan. |
| BA layak = tidak ada Pending/Fail/Blocked | Keputusanmu. Dipakai di Irisan 2. |
| Skenario tidak bisa dihapus kalau sudah ada bukti | Mencegah bukti menggantung |
| Pengguna eksternal hanya lihat proyeknya | Permintaanmu |
| Semua waktu WIB | Vercel berjalan UTC |

---

## 6. Risiko dan penanganannya

| Risiko | Penanganan |
|---|---|
| **Lingkup melebar seperti proyek sebelumnya** | Cakupan Irisan 1 dikunci di Bagian 2. Tambahan apa pun masuk daftar tunggu, bukan dikerjakan. |
| Batas unggah 4,5 MB di awan | Kompres di browser + unggah langsung ke penyimpanan |
| Unggahan langsung perlu kunci rahasia di browser | URL bertanda tangan berlaku singkat, hanya untuk satu berkas |
| Dua orang mengubah skenario yang sama | Kolom `diubah_pada` sebagai kunci; tolak simpanan yang basi |
| Pengguna eksternal sulit masuk | Email + sandi, sandi awal dibuat admin, satu kali tampil |
| Impor skrip salah petakan kolom | Uji dengan berkas contoh dulu; bandingkan jumlah: 42 skenario, 47 gambar |

---

## 7. Cara mengukur Irisan 1 berhasil

Bukan "fitur selesai", tapi:

1. **42 skenario dari berkas contoh masuk lengkap** — 0 hilang, 0 kolom salah.
2. **47 gambar pindah** dan bisa dilihat tanpa membuka berkas 8 MB.
3. **Rekap otomatis menunjukkan 42, bukan 32** — artinya 10 skenario yang hilang di spreadsheet sekarang terhitung.
4. **Satu orang dari luar subdit bisa masuk** dan hanya melihat proyeknya.
5. **Satu skenario Fail tanpa catatan ditolak** oleh sistem.

Kalau kelima ini terpenuhi, spreadsheet sudah bisa ditinggalkan.

---

## 8. Yang masih saya butuhkan

| # | Yang dibutuhkan | Menghambat |
|---|---|---|
| 1 | **Format nomor Berita Acara** (contoh nyata) | Irisan 2, bukan sekarang |
| 2 | **Daftar pengguna awal** (nama, email, jabatan, peran) | Langkah 3 — sebelum uji dengan orang sungguhan |
| 3 | **Keputusan: pengguna eksternal perlu akun, atau cukup tautan baca-saja?** | Langkah 3–4 |

Nomor 3 penting dan bisa menghemat banyak kerja. Kalau pihak eksternal **hanya perlu melihat** hasil UAT tanpa mengubah apa pun, cukup **tautan bertanda tangan** — tidak perlu akun, tidak perlu keanggotaan, tidak perlu halaman masuk untuk mereka. Kalau mereka **harus mengisi status uji sendiri**, baru perlu akun penuh.

Dari berkas contoh, ada sheet "Daftar User" berisi akun untuk tester (djpk_dodk_001, dpa_apprv, kemenkes_opr_001, dst). Itu menunjukkan **penguji eksternal memang mengisi sendiri**. Tapi perlu kamu pastikan, karena bedanya besar.

---

## 9. Perkiraan urutan pengerjaan

Langkah 1–4 adalah fondasi (belum terlihat hasilnya bagi pengguna).
Langkah 5–8 adalah inti (di sini spreadsheet sudah bisa ditinggalkan).
Langkah 9 adalah yang dilihat pimpinan.
Langkah 10 adalah pemindahan data.

**Saran saya: kerjakan Langkah 1–5 dulu, lalu tunjukkan kepadamu sebelum lanjut.** Dengan begitu kamu bisa menilai apakah arahnya sudah benar sementara biaya pembetulannya masih kecil.

Aplikasi akan dijalankan lokal dulu supaya bisa kamu buka sebelum dipindah ke awan.

---

## 10. KEPUTUSAN PEMILIK PRODUK (15 Oktober 2026)

Bagian ini yang berlaku. Kalau berbeda dengan usulan di atas, yang ini yang dipakai.

### 10.1 Kolom skenario: **8 kolom sesuai PRD**

Diputuskan memakai 8 atribut PRD, **bukan** 11 kolom seperti berkas nyata:

```
1. ID                    5. Penguji
2. Judul Skenario        6. Bukti
3. Langkah Pengujian     7. Status Uji
4. Hasil yang Diharapkan 8. Catatan Tindak Lanjut
```

**Konsekuensi yang harus disadari:** tidak ada kolom khusus untuk *Hasil Aktual /
Temuan*. Di berkas nyata, kolom itu terpisah dari Catatan Tindak Lanjut — yang
satu mencatat **apa yang terjadi**, yang satu mencatat **apa yang harus
dilakukan**. Dengan 8 kolom, keduanya menumpuk di Catatan Tindak Lanjut.

**Yang tetap dipertahankan dari berkas nyata** (karena tidak menambah kolom):
- **Modul** tetap ada, tapi sebagai **entitas terpisah**, bukan kolom skenario.
  Pengelompokan A–F dipakai untuk rekap dan penyaring.
- **Metadata Cover** (Dasar Regulasi, Lingkungan Uji, Sumber Acuan, dst.) tetap
  disimpan di tabel `projects` — itu metadata proyek, bukan kolom skenario.
- **Kolom "Hasil (Ya/Tidak)" tidak disimpan** — duplikat dari Status.

**Wajib dikerjakan agar murah dibatalkan:** tabel `scenarios` dibuat dengan
kolom tambahan yang sudah ada tapi belum dipakai di antarmuka —
`tujuan_pengujian`, `prekondisi`, `data_uji`, `hasil_aktual` — semuanya boleh
kosong (nullable). Menampilkannya nanti berarti **mengubah formulir saja, tanpa
migrasi dan tanpa menyentuh data yang sudah ada**.

### 10.2 Pengguna eksternal: **akun penuh**

Kantor vertikal Kemenkeu dan pihak luar Kemenkeu **mengisi sendiri** — mereka
mengubah status uji dan mengunggah bukti. Jadi butuh akun penuh, bukan tautan
baca-saja.

Konsekuensinya tetap berlaku: `project_members` wajib ada, dan **pengguna
eksternal hanya melihat proyek yang ia menjadi anggotanya** — bukan seluruh
portofolio subdit. Admin yang mengundang dan menentukan proyeknya.

### 10.3 Urutan pengerjaan: **Langkah 1–5 dulu**

Fondasi + skema + masuk/peran + proyek + modul/skenario. Setelah itu hasilnya
ditunjukkan ke pemilik produk sebelum lanjut ke Langkah 6–10.

Alasannya: pada Langkah 1–5 biaya pembetulan masih kecil, dan arahnya bisa
dinilai sebelum fitur di atasnya ikut salah.

### 10.4 Yang masih belum ada

| # | Yang dibutuhkan | Menghambat |
|---|---|---|
| 1 | Format nomor Berita Acara | Irisan 2 — belum sekarang |
| 2 | Daftar pengguna awal (nama, email, jabatan, peran) | Uji Langkah 3 dengan orang sungguhan |
