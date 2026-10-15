# Audit dan perbaikan PSII TestHub — 15 Oktober 2026

## Tujuan produk yang menjadi acuan

Sistem menjadi satu sumber data pengujian SIT/UAT PSII: proyek, modul/skenario, hasil aktual, catatan tindak lanjut, bukti, serta ringkasan yang dapat dipantau pimpinan. Penguji Kemenkeu non-PSII mengerjakan hanya proyek yang ditugaskan, sedangkan administrasi akun tidak terbuka bagi publik atau peran lain.

## Temuan audit pada implementasi awal

1. **Model peran tidak sesuai kebutuhan.** Skema memakai tujuh peran lama (PM, QA, Developer, Business User, dan Eksternal), sehingga perbedaan Internal PSII, Internal Kemenkeu, dan Eksternal Kemenkeu tidak dapat ditegakkan secara jelas.
2. **Halaman pengguna belum berada di ruang admin yang jelas.** Rute `/pengguna` berdiri sendiri, bukan bagian dashboard admin. Proteksi server/API perlu konsisten agar menyembunyikan tautan saja tidak dianggap sebagai kontrol akses.
3. **Scope proyek tidak konsisten pada API tulis.** Sebagian endpoint hanya memeriksa akses ketika `projectId` disertakan; operasi skenario/bukti juga perlu memastikan objek yang disebut benar-benar berasal dari proyek yang sama. Ini berisiko membuka akses lintas proyek lewat request yang dibentuk manual.
4. **Ringkasan beranda menghitung seluruh data.** Angka agregat perlu mengikuti proyek yang boleh dilihat akun penguji.
5. **Hak tulis belum granular.** Pimpinan harus baca-saja; penguji perlu bisa mengisi hasil uji tanpa dapat mengubah spesifikasi atau menghapus bukti; hanya Admin/Internal PSII yang mengelola struktur.
6. **Hasil aktual belum muncul di antarmuka** meskipun kolomnya sudah ada di database. Hasil aktual harus berbeda dari catatan tindak lanjut.
7. **Alur tautan proyek belum jelas.** Tautan yang dibagikan harus mempertahankan konteks SIT/UAT ketika penerima belum login dan tidak boleh menjadi tautan publik tanpa autentikasi.

## Perbaikan yang sudah diterapkan

- Lima peran resmi: `ADMIN`, `PIMPINAN`, `INTERNAL_PSII`, `INTERNAL_KEMENKEU`, `EKSTERNAL_KEMENKEU`.
  - Admin: akses penuh termasuk administrasi akun.
  - Pimpinan: seluruh portofolio, baca-saja.
  - Internal PSII: seluruh portofolio dan operasi proyek/pengujian, tanpa administrasi akun.
  - Internal/Eksternal Kemenkeu: proyek yang ditugaskan; dapat mengisi status, hasil aktual, catatan, dan mengunggah bukti.
- Rute `/dashboard/admin` dan `/dashboard/admin/pengguna` kini privat untuk Admin dan Pimpinan; Pimpinan hanya dapat membaca ringkasan/daftar pengguna. Rute lama `/pengguna` menjadi alias ke area ini. API mutasi akun hanya menerima Admin. Akun Admin aktif terakhir tidak bisa dinonaktifkan atau diturunkan perannya.
- Migrasi `002` memetakan role lama ke lima role baru. Default `npm run migrasi` menjalankan migrasi awal dan migrasi role secara berurutan.
- Admin/Internal PSII dapat menugaskan akun tester pada detail proyek, lalu menyalin tautan SIT/UAT. **Tautan hanya alamat ke halaman proyek**, bukan token bearer: penerima tetap harus login dan menjadi anggota proyek.
- Pimpinan dan tester tidak melihat tombol pembuatan proyek; API pembuatan, perubahan tahap, manajemen anggota, serta pembuatan/penghapusan skenario menerapkan izin yang sama di server.
- Endpoint skenario dan bukti memeriksa keanggotaan proyek dan hubungan objek-ke-proyek pada setiap operasi. Penguji hanya bisa mengubah status, hasil aktual, dan catatan; spesifikasi, penugasan, serta penghapusan dibatasi ke Admin/Internal PSII. Bukti dapat diunggah penguji, tetapi penghapusan dibatasi ke pengelola.
- Dashboard/beranda dan daftar proyek membatasi agregat sesuai proyek yang dapat diakses. Login mempertahankan parameter fase pada tautan internal dan menolak redirect keluar situs.
- Kolom **Hasil aktual / temuan** kini ditampilkan dan dapat diedit. Judul, langkah, hasil diharapkan, penugasan, status, catatan, bukti, dan hasil aktual tersedia melalui tabel/panel dengan izin sesuai peran.
- Metadata proyek yang telah dibuat kini dapat diedit Admin/Internal PSII: nama, aplikasi/unit, ruang lingkup, sumber acuan, regulasi, lingkungan, alamat server, tahun/periode, serta versi/penyusun/status dokumen. API memvalidasi nilai, perubahan audit dicatat dalam transaksi yang sama, dan Pimpinan/penguji tidak mendapat kontrol tulis.
- Pemulihan sandi mandiri tersedia melalui tautan email satu kali (kedaluwarsa 30 menit), dengan rate limit, HMAC untuk token/identifier, respons permintaan yang tidak membedakan email terdaftar, dan invalidasi sesi lama setelah sandi diganti.
- Migrasi `003` menambahkan tabel permintaan reset dan `sesi_versi`; verifikator migrasi memeriksa tabel, indeks, dan kolom pemulihan.

## Pekerjaan lanjutan yang masih disarankan

Prioritas berikutnya bukan kontrol akses dasar, melainkan kelengkapan operasional dan pelaporan:

1. Impor/ekspor `.xlsx` untuk migrasi spreadsheet — **ditunda sesuai permintaan pemilik produk**.
2. Berita Acara SIT/UAT, pengesahan/tanda tangan digital, dan ekspor dokumen — **ditunda sesuai permintaan pemilik produk**.
3. Pencarian/filter/dashboard tambahan serta notifikasi tugas dan perubahan.
4. Uji integrasi permission terhadap database nyata untuk semua kombinasi role, termasuk percobaan akses lintas proyek dan pengujian upload storage.
5. Mengaktifkan sender email pemulihan sandi dan memverifikasi koneksi database runtime sebelum deployment.

## Catatan deployment — status 15 Oktober 2026

Migrasi role `002` dan pemulihan sandi `003` telah diuji di branch sementara lalu diterapkan setelah persetujuan pemilik produk, hanya ke Neon project Angkutin / branch `production` / database `psii_testhub`. Verifikasi production menemukan satu akun `ADMIN`, default role `INTERNAL_PSII`, kolom `sesi_versi`, tabel `th_password_resets`, serta indeks email/IP/user; database `neondb` tidak disentuh.

Akses ke project Vercel `psii-testhub` telah pulih. Project memiliki deployment production berstatus `READY` pada commit lama `c68ce00`; perubahan lokal belum dipush. Environment production memiliki `DATABASE_URL` dan `SESI_SECRET`, tetapi Vercel menandai `DATABASE_URL` sebagai sensitive dan tidak mengembalikan nilainya, sehingga target database belum dapat diverifikasi secara independen tanpa konfirmasi pemilik. `APP_URL` production sudah ditambahkan dengan nilai `https://psii-testhub.vercel.app`.

`RESEND_API_KEY` dan `RESEND_FROM` belum ada pada project Vercel. Akun Resend memiliki domain pengirim terverifikasi `harikita.biz.id`, tetapi alamat pengirim belum dipilih untuk PSII TestHub. Pemulihan sandi akan tetap tidak berfungsi di production sampai tersedia API key khusus send-only dan alamat pengirim yang disetujui.

Commit lokal `5b18733` berisi seluruh perbaikan dan lulus `npm run typecheck`, build Next.js production, serta `git diff --check`. Push ke `main` ditahan sampai pemilik mengonfirmasi `DATABASE_URL` production memang menunjuk `psii_testhub` dan memberikan konfigurasi email yang disetujui (API key sebagai secret, alamat pengirim biasa).