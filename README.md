# PSII TestHub

Manajemen pengujian **SIT & UAT** dan Berita Acara digital untuk Subdit PSII —
menggantikan spreadsheet terpisah-pisah yang dipakai sekarang.

## Kenapa

Dari berkas UAT nyata di kantor (42 skenario, 6 modul):

- **10 dari 42 skenario (24%) tidak terhitung** di lembar rekap — kolom Status
  di sheet D kosong semua, sementara kolom Hasil terisi. Rekap menyebut 32,
  padahal ada 42. Rekap manual tidak bisa dipercaya.
- **47 gambar bukti ditanam di dalam berkas**, total 8,2 MB. Itu sebabnya
  berkasnya berat dan lambat dibuka.
- Tidak ada satu layar pun untuk pimpinan melihat progres lintas proyek.

## Keadaan sekarang

**Irisan 1 — inti yang menggantikan spreadsheet.** Yang sudah berdiri:

| Bagian | Keadaan |
|---|---|
| Skema basis data | 8 tabel, 11 indeks aplikasi, diverifikasi oleh runner migrasi |
| Masuk & peran | 5 peran, scrypt, cookie bertanda tangan, batas percobaan per-email |
| Pemulihan sandi | Tautan email sekali pakai, berlaku 30 menit, rate-limited, membatalkan sesi lama |
| Hak akses per proyek | Internal Kemenkeu dan Eksternal Kemenkeu hanya melihat proyek yang ditugaskan |
| Dashboard Admin | Area privat; Admin mengelola akun, Pimpinan dapat meninjau secara baca-saja |
| Tautan penguji | Tautan SIT/UAT tetap meminta login dan penugasan proyek; bukan akses publik |
| Proyek | Metadata Cover dapat diubah Admin/Internal PSII dan tercatat pada audit log |
| Skenario SIT & UAT | Admin/Internal PSII mengelola definisi; tester mengisi status, hasil aktual, dan catatan |
| Bukti pengujian | Unggah dan daftar bukti; penghapusan hanya Admin/Internal PSII |
| Dashboard | Ringkasan dibatasi ke portofolio yang boleh dilihat akun |
| Audit log | Perubahan hasil/status, catatan, bukti, dan tahap proyek tercatat |
| Aturan FR-2.5 | Status Gagal/Tertunda wajib bercatatan atau berbukti |

Belum dikerjakan: Berita Acara & tanda tangan digital, impor .xlsx, ekspor
laporan, dan penyaring lanjutan lintas proyek.

## Menjalankan

```bash
cp .env.contoh .env.local      # isi DATABASE_URL dan SESI_SECRET
npm install
npm run migrasi                # buat tabel + verifikasi
npm run akun -- <email> "<Nama>" "<Jabatan>"   # akun admin pertama
npm run dev                    # http://localhost:3200
```

Skrip lain:

```bash
npm run sandi -- <email>       # setel ulang sandi (menulis ke /tmp, tidak dicetak)
npm run typecheck
npm run build
```

Pemulihan sandi mandiri memerlukan `APP_URL`, `RESEND_API_KEY`, dan `RESEND_FROM`
di `.env.local`/environment deployment. `RESEND_FROM` harus memakai alamat pada
domain yang sudah diverifikasi di Resend; `APP_URL` production harus HTTPS. Tanpa
konfigurasi ini, halaman pemulihan akan mengarahkan pengguna untuk menghubungi Admin.

Migrasi `003` menambahkan penyimpanan hash token pemulihan dan `sesi_versi`.
Jalankan `npm run migrasi` pada database TestHub yang benar sebelum deployment
kode yang memakai kolom baru.

## Catatan rancangan

**Satu fungsi tanggal WIB untuk seluruh aplikasi** (`lib/waktu.ts`). Server
produksi berjalan di UTC; antara 00.00–06.59 WIB tanggalnya masih kemarin. Kode
yang memakai `new Date().toISOString()` akan mencatat tanggal yang salah tujuh
jam setiap hari, tanpa gejala apa pun.

**Tingkat kelulusan memakai SEMUA skenario sebagai pembagi** (keputusan pemilik
produk). Angka ini mengukur **kemajuan proyek**, bukan mutu pengujian — proyek
yang belum selesai diuji tidak boleh terlihat seperti sudah selesai. Karena itu
angka ini **bukan** syarat kelayakan Berita Acara; syaratnya adalah tidak ada
sisa Pending/Fail/Blocked.

**Hasil aktual/temuan** memakai kolom `hasil_aktual` yang sudah tersedia pada
skema awal; pengguna penguji dapat mengisinya langsung dari tabel/panel detail.
Kolom `tujuan_pengujian`, `prekondisi`, dan `data_uji` masih menjadi ruang
pengembangan; saat ini tidak ditampilkan pada formulir.

**Relasi menyimpan ID, bukan judul.** Kalau yang tersimpan judul, relasi putus
begitu judulnya diganti.

**Awalan `th_` pada nama tabel**, bukan schema terpisah: Neon menolak
`search_path` sebagai parameter startup di koneksi pooled.

**Database TERPISAH — jangan pernah menumpang di database proyek lain.**
TestHub memakai database `psii_testhub` sendiri. Sebelumnya tabel `th_*` ikut
menumpang di `neondb` milik Angkutin, dan itu keliru: satu database berisi dua
proyek berarti menghapus salah satu bisa mematikan yang lain, dan batas koneksi
saling makan. Kalau nanti ada yang meminta "hapus database Neon", periksa dulu
database mana yang dimaksud — `neondb` berisi Angkutin yang LIVE.

Bucket penyimpanan juga terpisah: `psii-testhub` (bukan `angkutin`).

## Berkas penting

- `docs/analisa-prd.md` — analisa PRD, celah yang ditemukan, keputusan pemilik produk
- `docs/plan-irisan-1.md` — rencana pengerjaan dan temuan dari berkas contoh
- `db/migrasi-001.sql`, `db/migrasi-002-peran.sql`, `db/migrasi-003-pemulihan-sandi.sql` — skema, peran, dan pemulihan sandi
- `lib/waktu.ts` — satu sumber tanggal WIB
- `lib/gerbang.ts` — satu tempat pemeriksaan sesi dan hak akses
