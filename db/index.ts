import postgres from "postgres";

/**
 * Koneksi database.
 *
 * KENAPA MEMAKAI DRIVER `postgres` LANGSUNG, bukan ORM:
 * Seluruh query di aplikasi ini berbentuk tabel sederhana dengan penyaring.
 * ORM menambah satu lapisan yang harus dipahami saat ada masalah, tanpa
 * memberi manfaat yang sebanding. Driver langsung juga membuat SQL-nya
 * terbaca apa adanya — berguna saat menelusuri hitungan yang tidak cocok.
 *
 * KENAPA SATU KLIEN UNTUK SELURUH APLIKASI:
 * Next.js memuat ulang modul saat pengembangan, dan setiap muat ulang yang
 * membuat koneksi baru akan menghabiskan batas koneksi database dalam
 * hitungan menit. Menyimpannya di variabel global bertahan lintas muat ulang.
 */
const url = process.env.DATABASE_URL;

if (!url) {
  /*
   * Gagal KERAS, bukan diam-diam memakai nilai bawaan. Kalau aplikasi jalan
   * tanpa koneksi, gejalanya adalah halaman kosong tanpa penjelasan — dan itu
   * lebih memakan waktu daripada pesan galat yang jelas di awal.
   */
  throw new Error("DATABASE_URL belum diatur. Salin .env.contoh ke .env.local lalu isi.");
}

const globalUntukKlien = globalThis as unknown as { __psiiSql?: ReturnType<typeof postgres> };

export const klienMentah =
  globalUntukKlien.__psiiSql ??
  postgres(url, {
    max: 10,
    idle_timeout: 20,
    // Neon memutus koneksi menganggur; menyambung ulang lebih murah daripada
    // menampilkan galat kepada pengguna.
    connect_timeout: 15,
  });

if (process.env.NODE_ENV !== "production") globalUntukKlien.__psiiSql = klienMentah;
