# Laporan final UAT v1

## Perilaku

Panel hanya dikirim ke Admin, Internal PSII, dan Pimpinan. Admin/Internal PSII dapat membuat laporan hanya saat proyek UAT (termasuk proyek lama SIT_UAT) berada pada tahap Selesai. Pimpinan hanya melihat dan mengunduh versi yang sudah diterbitkan. Kedua role tester ditolak pada daftar, pratinjau, penerbitan, maupun URL PDF langsung.

Perubahan tahap tidak menerbitkan laporan otomatis. Tombol **Generate Laporan Final** membuka pratinjau identitas, hitungan, rekap modul, dan peringatan. Pengguna harus mengakui peringatan sebelum menerbitkan. Token pratinjau mengikat revisi sumber dan nomor versi berikutnya; perubahan sumber atau penerbitan lain memerlukan pratinjau baru.

Hasil kosong, tertunda, belum diuji, serta skenario tanpa modul yang sah tetap disertakan dan diberi peringatan. Tanggal target bukan tanggal selesai aktual. Tanggal selesai hanya berasal dari riwayat penandaan tahap yang tercatat. Kolom temuan tersendiri, PIC/target/status tindak lanjut tidak ada di skema sumber v1: laporan menyatakan keterbatasan ini, tidak mengarang nilai. Status UAT Selesai bukan klaim semua pengujian lulus, persetujuan produksi, e-signature, atau berita acara.

## Snapshot dan penyimpanan privat

PDFKit merender di proses Node aplikasi, tanpa layanan PDF eksternal. Font Unicode dibundel lokal beserta lisensinya. Tabel `th_final_reports` menyimpan JSON snapshot, sidik sumber, dan byte PDF privat. Unduhan selalu memeriksa sesi aktif dan peran pada server, memakai `private, no-store`, serta tidak mengeluarkan URL storage atau bukti bertanda tangan. ID bukti internal bukan tautan unduhan atau jaminan berkas bukti masih tersedia.

Sumber dibaca dalam transaksi REPEATABLE READ dan diproyeksikan melalui daftar kolom eksplisit; akun uji, kredensial, alamat server, path bukti, storage key, serta signed URL tidak dibaca. Teks bebas juga disaring untuk URL, locator storage, dan kredensial berlabel. Pengguna tetap tidak boleh memasukkan rahasia tanpa label ke teks hasil pengujian: penyaringan teks bebas bukan sistem deteksi semua jenis rahasia.

Snapshot dan PDF yang sudah terbit tidak diubah. Trigger database menolak UPDATE/DELETE; nomor versi unik per proyek. Penghapusan proyek yang sudah memiliki laporan dibatasi agar riwayat tidak ikut hilang. Perubahan sumber dideteksi dari sidik data aman dan revisi MVCC, termasuk perubahan yang kemudian dikembalikan. Versi lama tetap dapat diunduh dan diberi badge Perlu pembaruan; penerbitan berikutnya membuat versi baru. Metadata daftar tidak menulis ulang snapshot.

## Migrasi 008: perlu persetujuan terpisah

Berkas sumber tepat: `db/migrasi-008-laporan-final.sql`. Migrasi menambah satu tabel, satu fungsi perlindungan, satu trigger, dan indeks unik bawaan constraint. Tidak mengubah atau menghapus data pengujian/akun uji yang sudah ada. Dampak setelah fitur digunakan: PDF menambah pemakaian database, dan proyek dengan laporan tidak dapat dihapus lewat aplikasi.

Jangan menerapkan ke produksi sebelum pemilik menyetujui SQL ini. Runner menuntut pemilihan berkas eksplisit, `--setuju-migrasi-008`, dan pada produksi `--setujui-produksi`. Verifikasi target database adalah `psii_testhub`, bukan `neondb` aplikasi lain. Jangan menjalankan seluruh migrasi lama ulang pada produksi.

DDL telah diuji pada cabang sementara Neon `psii-uat-final-validation-20261019` (`br-icy-paper-b3rq91hp`), database `psii_testhub`, terpisah dari cabang produksi. Asersi UPDATE/DELETE ditolak, versi duplikat ditolak, versi berikutnya tidak mengubah versi pertama, serta penghapusan proyek ditolak semuanya lulus. Data sintetis di-rollback; tabel laporan pada cabang uji kosong. PostgreSQL 18 dapat mengembalikan SQLSTATE 23001 untuk RESTRICT (selain 23503 pada beberapa lingkungan); API menangani keduanya. Metadata skema produksi diperiksa dan tabel `th_final_reports` masih belum ada. Cabang sementara belum dihapus; minta izin pembersihan sebelum menghapusnya.

Setelah SQL disetujui: terapkan migrasi ke target yang telah diverifikasi, jalankan verifikasi skema, buka PR dan tunggu seluruh required CI checks, merge tanpa bypass, lalu verifikasi deployment produksi dan akses per peran. Persetujuan deploy umum tidak menggantikan persetujuan SQL.

## Validasi lokal

- `npm test`: domain, PGlite migrasi 001–008, handler API nyata dengan injeksi dependensi, serta ekstraksi teks PDF menggunakan `pdftotext`.
- `npm run typecheck` dan `npm run build`: gunakan URL DATABASE_URL localhost dummy bila tidak ada konfigurasi lokal; tidak membutuhkan koneksi produksi untuk build.
- `npm run pratinjau-laporan-final`: membuat `/workspace/psii-testhub-uat-final-synthetic.pdf` dari data fiktif saja.
- CI memasang `poppler-utils` untuk pemeriksaan PDF. Preview tidak membutuhkan akun atau proyek produksi.

## Status persiapan rilis

Pemilik/koordinator melaporkan migrasi 008 telah diterapkan secara terpisah dalam satu transaksi ke database `psii_testhub`, proyek `crimson-sea-93554649`, cabang produksi `br-old-scene-b3o5s8id`. Pemeriksaan pascamigrasi yang dilaporkan: tabel tersedia dengan sembilan kolom, constraint unik proyek/versi, pembatasan penghapusan proyek, trigger immutable, dan nol laporan. Sumber SQL yang disetujui tetap tidak diubah (SHA-256 `b137b0fb2940015cfa64bc60ab260851cd2ec9d197a139b863ddbaeaf053fdb7`).

Jangan jalankan ulang migrasi ini atau mengubah database produksi saat rilis kode. Lanjutkan melalui feature branch dari main terbaru, PR, seluruh required CI checks, dan merge tanpa bypass. Verifikasi deployment produksi READY pada merge commit dan lakukan smoke test read-only. Cabang database sementara tidak diubah/dihapus oleh proses rilis ini.
