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
| Skema basis data | 7 tabel, 8 indeks, terverifikasi dari katalog Postgres |
| Masuk & peran | 7 peran, scrypt, cookie bertanda tangan, batas percobaan per-email |
| Hak akses per proyek | Pengguna EKSTERNAL hanya melihat proyeknya |
| Proyek | Metadata lengkap dari halaman Cover berkas contoh |
| Skenario SIT & UAT | 8 atribut sesuai PRD, bisa diketik di tempat |
| Audit log | Perubahan status & catatan tercatat |
| Aturan FR-2.5 | Status Gagal/Tertunda wajib bercatatan atau berbukti |

Belum dikerjakan: unggah bukti, dashboard pimpinan, Berita Acara & tanda tangan,
impor .xlsx, penyaring lintas proyek.

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

**Kolom cadangan sudah ada tapi belum dipakai UI.** Keputusan pemilik produk
adalah 8 kolom PRD, bukan 11 kolom seperti berkas nyata. Akibatnya tidak ada
tempat khusus untuk "Hasil Aktual / Temuan". Kolom `tujuan_pengujian`,
`prekondisi`, `data_uji`, dan `hasil_aktual` sudah disiapkan di tabel — jadi
menampilkannya nanti cukup mengubah formulir, tanpa migrasi.

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
- `db/migrasi-001.sql` — DDL, komentar berisi alasan setiap pilihan
- `lib/waktu.ts` — satu sumber tanggal WIB
- `lib/gerbang.ts` — satu tempat pemeriksaan sesi dan hak akses
