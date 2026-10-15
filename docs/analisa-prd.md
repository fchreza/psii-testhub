# Analisa PRD — PSII TestHub

**Dokumen yang dianalisa:** PRD Sistem Digitalisasi Pengujian (SIT & UAT) dan Berita Acara Terpusat, v1.0
**Tanggal analisa:** 15 Oktober 2026
**Status:** Analisa awal, belum ada kode

---

## 1. Penilaian umum

PRD ini **jauh di atas rata-rata**. Tiga hal yang biasanya tidak ada, tapi ada di sini:

1. **8 atribut skenario dipatok eksplisit** — lengkap dengan tipe data dan aturan validasi. Ini yang paling sering hilang di PRD lain, dan justru yang paling menentukan bentuk basis data.
2. **Out-of-scope ditulis terang-terangan** — SharePoint, Teams, pengingat, PDF. Empat hal itu adalah empat minggu kerja yang tidak akan terbuang.
3. **Alur end-to-end ditulis 6 langkah** — dari daftar proyek sampai BA disahkan. Jadi bisa diperiksa: apakah setiap langkah punya rumah di modul yang disebutkan.

Yang perlu saya sampaikan jujur di depan: **lingkupnya besar.** Bukan sulit — besar. Itu dua hal berbeda, dan bedanya menentukan cara mengerjakannya.

---

## 2. Perbandingan jujur dengan proyek sebelumnya

Proyek sebelumnya (PSII Hub) dihentikan karena terlalu berat. Perlu dibandingkan supaya keputusan berikutnya berbasis kenyataan, bukan perasaan.

| Aspek | PSII Hub (dihentikan) | TestHub (PRD ini) |
|---|---|---|
| Editor blok (contentEditable) | Ada — bagian tersulit | **Tidak ada** |
| Mesin view (6 tipe, filter, grup) | Ada | **Tidak ada** |
| Relasi antar-database | 11 relasi | **Tidak ada** |
| Peran pengguna | 1 (semua sama) | 5 peran |
| Unggah berkas | Tidak ada | Ada (10 MB) |
| Impor xlsx | Tidak ada | Ada |
| Dokumen otomatis | Tidak ada | Ada (Berita Acara) |
| Tanda tangan berjenjang | Tidak ada | Ada |
| Audit log | Tidak ada | Ada |
| Jumlah layar | ~8 | ~12 |

**Kesimpulan: TestHub punya LEBIH BANYAK fitur, tapi risiko teknis LEBIH RENDAH.**

Alasannya: tidak ada satu pun bagian di TestHub yang secara teknis sulit. Semua layarnya berbentuk tabel + formulir. Tidak ada editor teks kaya, tidak ada mesin view yang harus menafsirkan konfigurasi, tidak ada relasi dua arah. Yang ada adalah **banyak pekerjaan yang jelas batasnya**, bukan pekerjaan yang tidak jelas kapan selesainya.

Pelajaran dari proyek sebelumnya: yang membunuhnya bukan tingkat kesulitan, tapi **lingkup yang tidak pernah sampai bisa dipakai**. Karena itu seluruh rekomendasi di dokumen ini mengarah ke satu hal: **jangan bangun 5 modul sebelum ada satu yang benar-benar dipakai orang.**

---

## 3. Celah data model — harus ditambal sebelum menulis kode

Bagian 7 PRD mendefinisikan 3 tabel. Itu kurang untuk memenuhi kebutuhan yang PRD sendiri sebutkan di tempat lain.

### 3.1 Tidak ada tabel pengguna (paling kritis)

Lima peran didefinisikan di Bagian 4, dan seluruh hak akses bergantung padanya. Tapi tidak ada tabel `users`. Akibatnya:

- `test_scenarios.tester_name` ditulis "String / User ID" — ambigu. Kalau teks bebas, tidak bisa difilter per pengguna secara andal, dan FR-2.6 (saring berdasarkan Penguji) jadi rapuh: satu orang bisa tercatat sebagai "Ari", "ari", dan "Ari Rohmawan".
- `bast_approvals.approver_name` juga teks bebas. **Siapa pun bisa mengetik nama siapa pun** lalu menyatakan orang itu sudah menyetujui.
- FR-5.2 menjanjikan "mencatat nama akun, jabatan, serta waktu" — jabatan tidak ada di skema.

**Perlu:** tabel `users` (id, nama, jabatan, email, peran) dan semua referensi orang memakai `user_id`, bukan teks.

### 3.2 Tidak ada tabel audit log

NFR-1 mewajibkan setiap perubahan Status Uji, Bukti, Catatan Tindak Lanjut, dan Sign-Off tercatat di audit log. Tapi tidak ada tabelnya di Bagian 7.

**Perlu:** tabel `audit_logs` (waktu, user_id, tabel, record_id, aksi, nilai_lama, nilai_baru).

Catatan: audit log untuk Sign-Off bisa langsung dibaca dari `bast_approvals.signed_at`. Yang benar-benar butuh tabel terpisah adalah perubahan status uji dan penggantian bukti.

### 3.3 Tidak ada kolom kesiapan retest

Peran Developer di Bagian 4 bertugas "memperbarui informasi kesiapan uji ulang (retest)". Tidak ada kolom untuk itu di `test_scenarios`. Kalau tidak ditambah, Developer hanya bisa mengubah Catatan Tindak Lanjut — dan QA tidak punya cara membedakan "sedang diperbaiki" dari "sudah siap diuji ulang".

**Perlu:** kolom `retest_ready` (boolean) dan `retest_note`.

### 3.4 Tidak ada peran administrator

NFR-4 menyebut "tanpa otorisasi administrator sistem", tapi peran itu tidak ada di daftar 5 peran Bagian 4. Siapa yang boleh membuka kunci setelah BA disahkan?

**Perlu:** putuskan — tambah peran `ADMIN`, atau berikan wewenang buka-kunci ke Pimpinan.

### 3.5 Kunci komposit tanpa `test_phase`

Bagian 7.2 menulis kunci komposit `(scenario_id, project_id)`. Kalau suatu saat ada skenario bernama "SIT-001" di tab UAT, tidak ada yang mencegahnya. Kunci seharusnya `(project_id, test_phase, scenario_id)`, atau lebih baik: UUID sebagai primary key + kolom `kode` untuk tampilan.

Alasan memilih UUID: `scenario_id` yang bisa diketik manusia berarti bisa bentrok, bisa diubah, dan menyulitkan impor massal (FR-2.3) ketika berkas lama punya penomoran sendiri.

### 3.6 Bukti hanya satu berkas

`evidence_file_url` tunggal. Pengujian UAT yang nyata sering butuh beberapa tangkapan layar (layar sebelum, sesudah, pesan galat). Kalau hanya satu kolom, penguji akan menggabungkan gambar jadi satu — dan bukti jadi tidak terbaca.

**Perlu:** tabel `scenario_evidence` (banyak baris per skenario), atau kolom array.

### 3.7 `current_stage` di PRD menyebut `WAITING_BAST`

BAST adalah istilah untuk Berita Acara Serah Terima — dokumen yang berbeda dari Berita Acara SIT/UAT. Kemungkinan maksudnya `WAITING_SIGNOFF`. Perlu dipastikan supaya penamaan di kode tidak menyesatkan pembaca berikutnya.

---

## 4. Ambiguitas yang harus diputuskan

Bagian ini bukan keluhan — ini daftar keputusan yang, kalau dibiarkan, akan diputuskan diam-diam oleh orang yang menulis kode (yaitu saya). Lebih baik kamu yang putuskan.

### 4.1 Definisi tingkat kelulusan (paling penting)

FR-4.1: *"Persentase akumulasi skenario berstatus Lulus dibandingkan total skenario yang diuji."*

Kata **"yang diuji"** bisa berarti dua hal, dan bedanya besar:

Contoh: satu proyek punya 100 skenario — 60 Lulus, 5 Gagal, 3 Tertunda, 32 Belum Diuji.

| Tafsir | Hitungan | Hasil |
|---|---|---|
| Pembagi = semua skenario | 60 / 100 | **60%** |
| Pembagi = skenario yang sudah punya status | 60 / 68 | **88%** |

Selisihnya 28 poin persen. Dan angka ini langsung menentukan apakah Berita Acara boleh disahkan (FR-5.1 menyebut "pernyataan kesimpulan kelayakan otomatis berdasarkan persentase kelulusan").

Ini keputusan bisnis, bukan keputusan teknis.

### 4.2 Ambang kelayakan Berita Acara

FR-5.1 menyebut "pernyataan kesimpulan kelayakan otomatis", tapi tidak menyebut ambangnya. 100%? 95%? Atau ditentukan manual per proyek oleh PM?

Catatan dari praktik: menuntut 100% sering tidak realistis — selalu ada skenario yang gagal karena hal sepele. Tapi menuntut kurang dari 100% berarti BA bisa disahkan padahal masih ada yang gagal. Yang biasanya dipakai: **semua skenario harus punya status, dan tidak boleh ada Fail/Blocked** — jadi ambangnya 100% dari yang sudah diuji, dengan syarat tidak ada sisa Pending.

### 4.3 Format nomor Berita Acara

FR-5.1: "Nomor Berita Acara otomatis". Formatnya tidak ditentukan. Nomor dokumen di lingkungan Kemenkeu biasanya punya pola tetap (mis. `ND-123/PB.5/2026`). Saya perlu format aslinya — kalau saya karang, dokumennya tidak akan lolos administrasi.

### 4.4 Perpindahan tahapan otomatis

FR-1.3: "otomatis maupun manual". Otomatis dalam kondisi apa? Usulan: otomatis naik ke `SEDANG_UAT` ketika semua skenario SIT lulus, dan ke `MENUNGGU_SIGNOFF` ketika semua skenario UAT lulus. Tapi PM harus selalu bisa menggeser manual — karena kenyataan di lapangan tidak selalu mengikuti aturan.

### 4.5 Jalan keluar dari penguncian

FR-5.3 mengunci skenario setelah BA disetujui penuh. Tidak ada jalan membuka. Padahal kenyataannya: BA sudah disahkan, lalu ditemukan salah ketik, atau ada skenario susulan.

Tanpa jalan keluar, pilihannya hanya dua: membiarkan data salah selamanya, atau mengubah langsung di basis data (yang merusak audit trail). **Harus ada tombol buka-kunci**, terbatas untuk peran tertentu, dan setiap pembukaan tercatat.

---

## 5. Risiko teknis

### 5.1 Unggahan berkas 10 MB — bertabrakan dengan batas platform

NFR-2 menuntut lampiran sampai 10 MB. Kalau aplikasinya ditaruh di Vercel (paket Hobby), **batas badan permintaan hanya 4,5 MB** — unggahan 10 MB akan gagal, dan pesan galatnya tidak menjelaskan sebabnya.

Dua jalan keluar:
1. Unggah langsung dari browser ke penyimpanan objek memakai URL bertanda tangan (tidak melewati server aplikasi) — bebas batas.
2. Kompres gambar di browser sebelum diunggah — tangkapan layar 10 MB biasanya bisa jadi 300 KB tanpa terlihat berbeda.

Saran: lakukan keduanya. Kompresi di browser menghemat penyimpanan dan mempercepat pratinjau (NFR-2 menuntut "waktu muat pratinjau yang responsif"), unggahan langsung menghilangkan batas ukuran.

### 5.2 Kinerja dashboard

NFR-3 menuntut agregasi di bawah 2 detik untuk "ratusan proyek dan ribuan skenario".

Penilaian saya: **target ini berlebihan untuk kebutuhan nyatanya.** Satu subdit tidak akan punya ratusan proyek pengujian berjalan. Merancang untuk ratusan proyek berarti menambah lapisan cache, tabel ringkasan, dan pembaruan berkala — semuanya untuk beban yang tidak akan datang.

Yang tetap perlu: indeks pada `project_id`, `test_phase`, dan `test_status`. Dengan itu, ribuan skenario tetap terhitung di bawah 2 detik tanpa lapisan tambahan apa pun.

Saran: bangun versi sederhana dulu, ukur dengan data nyata, tambah lapisan hanya kalau memang melambat.

### 5.3 Dua orang mengedit skenario yang sama

Tidak disebut di PRD, tapi pasti terjadi: QA dan Business User membuka skenario yang sama, keduanya mengubah status, yang menyimpan belakangan menang — dan perubahan yang pertama hilang tanpa peringatan.

Solusi ringan: setiap baris membawa `updated_at`, dan server menolak simpanan kalau nilai itu sudah berubah sejak halaman dibuka. Pengguna diberi tahu "data sudah diubah orang lain, silakan muat ulang".

### 5.4 Zona waktu

Semua cap waktu harus dikunci ke WIB. Kalau memakai jam server (yang di penyedia awan berjalan UTC), maka antara pukul 00.00–06.59 WIB tanggalnya masih kemarin — dan laporan "diuji tanggal berapa" jadi salah tujuh jam setiap hari. Sudah pernah terjadi di proyek lain; jangan diulang.

### 5.5 Berita Acara dengan ribuan baris

FR-5.1 meminta BA memuat tabel rincian seluruh skenario beserta 8 atributnya. Untuk proyek dengan 500 skenario, itu 4.000 sel dalam satu halaman — berat dibuka dan tidak terbaca.

Saran: tampilkan ringkasan lengkap di atas, lalu rincian per tahap dengan penyaring dan penomoran halaman. Yang penting untuk pengesahan adalah ringkasan angkanya; rinciannya untuk lampiran.

---

## 6. Yang bisa dipotong dari Fase 1

### 6.1 Modul 3 sebenarnya bukan modul

FR-3.1: "seluruh skenario dari proyek mana pun yang berstatus Gagal atau Tertunda otomatis terkumpul". Itu **penyaring dari Modul 2**, bukan modul tersendiri. Tidak butuh tabel baru, tidak butuh halaman baru — cukup satu tampilan yang memakai penyaring lintas proyek.

Menuliskannya sebagai modul membuatnya terlihat seperti pekerjaan besar. Sebenarnya pekerjaan satu hari.

### 6.2 Impor xlsx bisa jadi skrip sekali pakai

FR-2.3 meminta impor massal dari `.xlsx`/`.csv` untuk migrasi dari spreadsheet lama.

Pertanyaan yang menentukan: **impor ini sekali di awal, atau setiap kali ada proyek baru?**

- Kalau sekali di awal → cukup **skrip sekali pakai** yang dijalankan dari terminal. Menghemat pembuatan halaman unggah, pemetaan kolom, pratinjau, dan penanganan galat — pekerjaan beberapa hari.
- Kalau tiap proyek baru → baru perlu UI.

Saran: mulai dengan skrip. Kalau ternyata sering dipakai, baru dibuatkan halamannya.

### 6.3 Grafik dashboard

FR-4.2 meminta dua grafik. Untuk fase pertama, **angka dan bilah progres sudah menjawab pertanyaan pimpinan** ("berapa yang lulus", "proyek mana yang tertinggal"). Grafik batang bisa menyusul setelah angkanya terbukti dipakai.

### 6.4 Audit log terperinci

NFR-1 bisa dipenuhi bertahap: mulai dari mencatat perubahan status uji dan sign-off (yang paling sering dipersoalkan), lalu lengkapi ke perubahan bukti dan catatan.

---

## 7. Usulan urutan pembangunan

Prinsipnya: setiap irisan harus **bisa dipakai**, bukan sekadar selesai.

**Irisan 1 — menggantikan spreadsheet (inti)**
Login + peran, daftar proyek, skenario SIT dengan 8 atribut, ubah status, unggah bukti, penyaring.
→ Setelah ini, spreadsheet sudah tidak diperlukan lagi. Ini irisan yang paling menentukan.

**Irisan 2 — Berita Acara + pengesahan**
BA SIT otomatis, kartu pengesahan, kunci setelah disetujui penuh.
→ Ini yang menghapus pekerjaan rekap manual — alasan utama proyek ini dibangun.

**Irisan 3 — UAT**
Tahap UAT sebenarnya **struktur yang sama dengan SIT**, hanya berbeda nilai pada kolom `test_phase`. Kalau SIT dikerjakan benar, UAT hampir gratis.

**Irisan 4 — Dashboard pimpinan**
Angka KPI dulu (total proyek, tingkat kelulusan, jumlah butuh tindak lanjut, BA menunggu). Grafik menyusul.

**Irisan 5 — pelengkap**
Impor xlsx (jika memang berkelanjutan), grafik, audit log lengkap, tampilan tindak lanjut lintas proyek.

Catatan penting: **Irisan 3 hampir gratis** karena UAT = SIT dengan nilai berbeda. Jangan bangun keduanya seolah dua sistem terpisah — itu kesalahan yang mahal.

---

## 8. Yang saya butuhkan darimu

1. **Format nomor Berita Acara** yang dipakai di kantor (contoh nyata lebih baik).
2. **Definisi tingkat kelulusan** — pembaginya semua skenario, atau yang sudah diuji? (lihat 4.1)
3. **Ambang kelayakan BA** — 100%, 95%, atau ditentukan PM per proyek?
4. **Cara masuk pengguna** — SSO kantor, atau email + sandi sederhana?
5. **Tempat menjalankannya** — server kantor atau awan? Ini menentukan batas unggahan berkas.
6. **Contoh spreadsheet lama** — supaya bentuk kolomnya bisa dicocokkan, dan supaya saya tahu apakah impornya sekali atau berkelanjutan.

---

## 9. Kesimpulan

PRD-nya layak dikerjakan. Yang perlu diubah bukan isinya, melainkan **cara memulainya**: jangan bangun lima modul sekaligus, bangun satu irisan sampai bisa dipakai lalu lanjut.

Tiga hal yang harus ditambal lebih dulu: **tabel pengguna**, **tabel audit log**, dan **jalan keluar dari penguncian BA**. Sisanya bisa menyusul.

Dan satu hal yang perlu diingat: proyek sebelumnya berhenti karena lingkup, bukan karena kesulitan. Proyek ini punya lebih banyak fitur — jadi risiko yang sama tetap ada, dan cara menghindarinya adalah mengirim sesuatu yang bisa dipakai lebih cepat, bukan merancang lebih lama.

---

## 10. KEPUTUSAN YANG SUDAH DIAMBIL (15 Oktober 2026)

Empat pertanyaan di Bagian 8 sudah dijawab pemilik produk. Bagian ini yang berlaku — kalau berbeda dengan usulan di atas, yang ini yang dipakai.

### 10.1 Tingkat kelulusan: pembagi = SEMUA skenario

```
tingkat_kelulusan = jumlah_lulus / jumlah_seluruh_skenario x 100
```

Contoh: 100 skenario, 60 lulus → **60%** (bukan 88%).

**Akibat yang harus disadari:** angka ini tidak pernah mencapai 100% selama masih ada skenario yang belum diuji. Itu memang tujuannya — angka ini mengukur **kemajuan proyek**, bukan **kualitas pengujian**. Proyek yang belum selesai diuji tidak boleh terlihat seperti sudah selesai.

**Konsekuensi teknis:** karena itu, tingkat kelulusan TIDAK BOLEH dipakai sebagai syarat kelayakan Berita Acara (lihat 10.2). Kalau dipakai, BA hanya bisa disahkan pada 100% — yang berarti tidak ada bedanya dengan syarat "semua harus lulus".

### 10.2 Kelayakan Berita Acara: dua syarat, tanpa ambang persentase

BA dinyatakan **layak disahkan** kalau dan hanya kalau:

1. **Tidak ada skenario berstatus `PENDING`** — seluruh skenario pada tahap itu sudah punya status.
2. **Tidak ada skenario berstatus `FAIL` atau `BLOCKED`.**

Kalau kedua syarat itu terpenuhi, secara otomatis seluruh skenario berstatus `PASS`, dan tingkat kelulusan juga 100% — tapi **syaratnya bukan persentasenya**, melainkan tidak adanya sisa. Ini lebih jelas dibaca dan lebih sulit disalahartikan.

**Tampilan di halaman Berita Acara:** tunjukkan daftar penghalang secara eksplisit — "3 skenario belum diuji, 2 skenario gagal". Jangan hanya menonaktifkan tombol; pengguna harus tahu apa yang kurang.

**Konsekuensi:** karena BA mensyaratkan 100% lulus, kunci penguncian (10.3) menjadi lebih penting — begitu BA sah, seluruh data terkunci dan tidak ada jalan membukanya.

### 10.3 Masuk: email + sandi, didaftarkan admin

- Peran `ADMIN` ditambahkan (menutup celah 3.4). Admin mendaftarkan pengguna, menyetel peran, dan menonaktifkan akun.
- Sandi di-hash `scrypt`, perbandingan `timingSafeEqual`, cookie sesi bertanda tangan — pola yang sudah terbukti di proyek sebelumnya.
- Pesan galat disamakan untuk "email tidak terdaftar" dan "sandi salah".
- Batas percobaan masuk **per-email**, bukan per-IP (satu kantor keluar lewat satu IP).
- Akun nonaktif ditolak di **setiap permintaan**, bukan hanya saat masuk.
- Karena ada akun nyata, **audit log jadi bermakna** — NFR-1 bisa dipenuhi sungguhan, bukan sekadar formalitas.

**Sandi awal:** dibangkitkan sistem, ditampilkan **sekali** di layar admin untuk disampaikan ke yang bersangkutan. Hanya hash yang tersimpan; sandi hilang = buat baru, bukan dilihat lagi.

### 10.4 Penempatan: awan (Vercel)

Konsekuensi yang harus dikerjakan:

- **Batas badan permintaan 4,5 MB** (paket Hobby). NFR-2 menuntut 10 MB. Dua langkah wajib:
  1. **Kompres di browser** sebelum unggah (tangkapan layar 10 MB → ~300 KB). Ini juga yang membuat pratinjau responsif seperti diminta NFR-2.
  2. **Unggah langsung ke penyimpanan objek** memakai URL bertanda tangan — berkas tidak melewati server aplikasi, jadi batas 4,5 MB tidak berlaku.
- **Cron maksimal 1x/hari** dan tidak presisi. Jangan bangun fitur apa pun yang bergantung pada cron tepat waktu (mis. pengingat sign-off — toh sudah out-of-scope).
- **Tidak ada Password Protection di paket Hobby.** Jadi halaman dalam harus dijaga oleh sesi aplikasi sendiri (yang memang sudah dirancang di 10.3).
- **Semua cap waktu dikunci ke WIB.** Vercel berjalan UTC — antara 00.00–06.59 WIB tanggalnya masih kemarin. Pakai satu fungsi tanggal yang sama di seluruh aplikasi.

### 10.5 Yang masih perlu dari pemilik produk

Tiga hal ini belum bisa saya putuskan sendiri dan **menghambat** dua bagian:

| # | Yang dibutuhkan | Menghambat |
|---|---|---|
| 1 | **Format nomor Berita Acara** (contoh nyata, mis. `ND-123/PB.5/2026`) | Halaman Berita Acara (Irisan 2) |
| 2 | **Contoh berkas spreadsheet lama** (.xlsx/.csv) | Keputusan apakah impor perlu UI atau cukup skrip |
| 3 | **Daftar pengguna awal** (nama, email, jabatan, peran) | Pengujian Irisan 1 dengan orang sungguhan |

Nomor 1 bisa ditunda sampai Irisan 2 dikerjakan. Nomor 2 dan 3 sebaiknya ada sebelum Irisan 1 selesai.
