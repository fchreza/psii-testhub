/**
 * WAKTU — satu sumber untuk seluruh aplikasi.
 *
 * KENAPA INI BERKAS TERSENDIRI DAN KENAPA PENTING:
 * Server produksi (Vercel) berjalan di UTC, sedangkan penggunanya di WIB
 * (UTC+7). Antara pukul 00.00 dan 06.59 WIB, tanggal UTC masih KEMARIN. Jadi
 * kode yang memakai `new Date().toISOString()` akan mencatat cap waktu
 * "diuji tanggal berapa" dengan tanggal yang salah — tujuh jam setiap hari,
 * tanpa gejala apa pun.
 *
 * Pernah terjadi di proyek lain: diukur dengan menyapu 24 jam, 7 dari 24 jam
 * menghasilkan tanggal yang salah. Karena itu SELURUH perhitungan waktu di
 * aplikasi ini harus lewat berkas ini — jangan ada `new Date()` yang berdiri
 * sendiri di tempat lain.
 */

/** Selisih WIB terhadap UTC, dalam milidetik. */
const WIB_MS = 7 * 60 * 60 * 1000;

/**
 * Tanggal hari ini menurut WIB, sebagai 'YYYY-MM-DD'.
 *
 * Dipakai untuk perbandingan tanggal (mis. "sudah lewat tenggat?").
 */
export function tanggalHariIniWIB(sekarang: Date = new Date()): string {
  return new Date(sekarang.getTime() + WIB_MS).toISOString().slice(0, 10);
}

/** Cap waktu lengkap menurut WIB, sebagai 'YYYY-MM-DD HH:mm:ss'. */
export function capWaktuWIB(sekarang: Date = new Date()): string {
  return new Date(sekarang.getTime() + WIB_MS).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Format tanggal untuk dibaca manusia: "15 Okt 2026".
 *
 * KENAPA timeZone: "UTC" WALAU INI WIB:
 * Nilai tanggal disimpan sebagai 'YYYY-MM-DD' tanpa jam dan tanpa zona. Saat
 * diformat, ia harus dibaca apa adanya — bukan digeser oleh zona mesin yang
 * sedang menjalankannya. Memakai UTC membuat hasilnya sama di server (UTC)
 * maupun di peramban pengguna (WIB).
 */
export function tanggalID(ymd: string | Date | null | undefined): string {
  if (ymd === null || ymd === undefined || ymd === "") return "";

  /*
   * KENAPA HARUS MENANGANI OBJEK Date:
   * Driver Postgres mengembalikan kolom `date` sebagai objek Date, bukan
   * string. Kalau nilainya dipaksa jadi string, hasilnya menjadi
   * "Sat Oct 31 2026 00:00:00 GMT+0000 (Coordinated Universal Time)" — dan
   * kalimat sepanjang itu masuk ke dalam sel tabel, merusak tata letaknya.
   * Ini pernah terjadi pada kolom Target di dashboard.
   */
  if (ymd instanceof Date) {
    if (Number.isNaN(ymd.getTime())) return "";
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }).format(ymd);
  }

  const bersih = String(ymd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bersih)) return String(ymd);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${bersih}T00:00:00Z`));
}

/** Format cap waktu untuk dibaca manusia, dalam WIB: "15 Okt 2026, 14.30". */
export function capWaktuID(nilai: string | Date | null | undefined): string {
  if (!nilai) return "";
  const d = typeof nilai === "string" ? new Date(nilai) : nilai;
  if (Number.isNaN(d.getTime())) return String(nilai);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  }).format(d);
}

/** Selisih hari antara dua tanggal 'YYYY-MM-DD'. Negatif = sudah lewat. */
export function selisihHari(dari: string, sampai: string): number {
  const a = Date.parse(`${String(dari).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(sampai).slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Sisa hari menuju sebuah tanggal, dihitung dari hari ini WIB. */
export function sisaHari(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  const bersih = String(ymd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bersih)) return null;
  return selisihHari(tanggalHariIniWIB(), bersih);
}
