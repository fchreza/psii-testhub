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
| Skema basis data | Tabel, kolom, dan indeks wajib diverifikasi oleh runner migrasi |
| Masuk & peran | 5 peran, scrypt, cookie bertanda tangan, batas percobaan per-email |
| Pemulihan sandi | Tautan email sekali pakai, berlaku 30 menit, rate-limited, membatalkan sesi lama |
| Hak akses per proyek | Internal/Eksternal Kemenkeu hanya melihat proyek yang ditugaskan |
| Dashboard Admin | Area privat; Admin mengelola akun, Pimpinan dapat meninjau secara baca-saja |
| Tautan penguji | Tautan SIT/UAT tetap meminta login dan penugasan proyek; bukan akses publik |
| Proyek | Metadata Cover dapat diubah Admin/Internal PSII dan tercatat pada audit log |
| Akun uji proyek | Kredensial opsional dienkripsi; penguji yang ditugaskan dapat melihatnya, Pimpinan tidak |
| Skenario SIT & UAT | Admin/Internal PSII mengelola definisi; tester mengisi status, hasil aktual, dan catatan |
| Bukti pengujian | Admin, Internal PSII, dan penguji yang memiliki akses proyek dapat menghapus bukti |
| Dashboard | Ringkasan dibatasi ke portofolio yang boleh dilihat akun |
| Audit log | Perubahan hasil/status, catatan, bukti, akun uji, dan tahap proyek tercatat |
| Aturan FR-2.5 | Status Gagal/Tertunda wajib bercatatan atau berbukti |

Belum dikerjakan: Berita Acara & tanda tangan digital, impor .xlsx, ekspor
laporan, dan penyaring lanjutan lintas proyek.

## Menjalankan

```bash
cp .env.contoh .env.local      # isi DATABASE_URL dan SESI_SECRET
npm install
npm run migrasi -- db/migrasi-001.sql db/migrasi-002-peran.sql db/migrasi-003-pemulihan-sandi.sql db/migrasi-004-jenis-pengujian.sql db/migrasi-005-ketahanan-operasional.sql db/migrasi-006-akun-uji.sql db/migrasi-007-multi-akun-uji.sql --setuju-migrasi-004 --setuju-migrasi-006 --setuju-migrasi-007
npm run akun -- <email> "<Nama>" "<Jabatan>"   # akun admin pertama
npm run dev                    # http://localhost:3200
```

Skrip lain:

```bash
npm run sandi -- <email>       # setel ulang sandi (menulis ke /tmp, tidak dicetak)
npm test                       # tes guardrail dan migrasi pada PostgreSQL tertanam
npm run typecheck
npm run build
npm run rekonsiliasi-bukti     # retry upload/delete tertunda; jalankan terjadwal secara manual oleh operator
```

## Dukungan peramban

Tailwind CSS v4 memakai fitur CSS modern dan mensyaratkan Chrome 111+, Safari 16.4+, atau Firefox 128+. Peramban yang lebih lama tidak didukung oleh stylesheet aplikasi.

Pemulihan sandi mandiri memerlukan `APP_URL`, `RESEND_API_KEY`, dan `RESEND_FROM`
di `.env.local`/environment deployment. `RESEND_FROM` harus memakai alamat pada
domain yang sudah diverifikasi di Resend; `APP_URL` production harus HTTPS. Tanpa
konfigurasi ini, halaman pemulihan akan mengarahkan pengguna untuk menghubungi Admin.

Runner migrasi tidak memiliki daftar default: pilih file secara eksplisit. Migrasi
`004`, `006`, dan `007` memerlukan flag acknowledgement tersendiri setelah SQL ditinjau.
Di `NODE_ENV=production`, runner juga menolak berjalan tanpa `--setujui-produksi`.
Migrasi `006` membuat tabel akun uji. Migrasi `007` mengubah batasan satu akun per proyek
menjadi daftar akun: setiap baris lama dipertahankan, diberi UUID dan label “Akun uji 1”,
sedangkan nonce, ciphertext, tag, versi format, dan audit tidak diubah. Baris lama tetap
dapat dibuka dengan format enkripsi v1; akun baru memakai AES-256-GCM v2 yang mengikat
data ke ID proyek dan ID akun. Migrasi ini tidak men-dekripsi atau mengisi ulang password.
Pada database production, migration 007 harus ditinjau dan disetujui secara terpisah
sebelum dijalankan:

```bash
NODE_ENV=production npm run migrasi -- db/migrasi-007-multi-akun-uji.sql --setuju-migrasi-007 --setujui-produksi
```

Username dan password akun uji dienkripsi dengan AES-256-GCM; kuncinya diturunkan
secara terpisah menggunakan HKDF dari `SESI_SECRET`. Jaga nilai itu tetap stabil:
rotasi `SESI_SECRET` tanpa re-enkripsi akan membuat password tersimpan tidak dapat dibuka.

Jangan jalankan perintah produksi sebelum persetujuan pemilik dan verifikasi target
database TestHub. Runner memeriksa tabel, kolom, indeks, dan role; setiap kekurangan
menghentikan proses (fail closed). CI di GitHub menjalankan tes, typecheck, dan build.

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
- `db/migrasi-001.sql`–`db/migrasi-007-multi-akun-uji.sql` — skema, peran, operasional, dan kredensial uji terenkripsi multi-akun
- `lib/waktu.ts` — satu sumber tanggal WIB
- `lib/gerbang.ts` — satu tempat pemeriksaan sesi dan hak akses
