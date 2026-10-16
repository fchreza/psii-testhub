export const PERAN_AKUN = [
  "ADMIN",
  "PIMPINAN",
  "INTERNAL_PSII",
  "INTERNAL_KEMENKEU",
  "EKSTERNAL_KEMENKEU",
] as const;

export type Peran = (typeof PERAN_AKUN)[number];

const PEMILIK_PORTOFOLIO: Peran[] = ["ADMIN", "PIMPINAN", "INTERNAL_PSII"];
const PENGELOLA: Peran[] = ["ADMIN", "INTERNAL_PSII"];
export const PERAN_PENGUJI: Peran[] = ["INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"];

/** Role yang dapat melihat seluruh portofolio proyek. */
export function internal(peran: Peran): boolean {
  return PEMILIK_PORTOFOLIO.includes(peran);
}

/** Akses internal melewati penugasan; tester wajib menjadi anggota proyek. */
export function bolehAksesProyekPeran(peran: Peran, ditugaskan: boolean): boolean {
  return internal(peran) || ditugaskan;
}

export function bolehKelolaPengguna(peran: Peran): boolean {
  return peran === "ADMIN";
}

/** Admin dan Internal PSII dapat mengelola struktur proyek/skenario. */
export function bolehKelolaProyek(peran: Peran): boolean {
  return PENGELOLA.includes(peran);
}

/** Admin, Internal PSII, dan penguji boleh menghapus bukti pada proyek yang dapat mereka akses. */
export function bolehHapusBukti(peran: Peran): boolean {
  return PENGELOLA.includes(peran) || PERAN_PENGUJI.includes(peran);
}

/** Hanya Admin boleh melewati perlindungan riwayat saat menghapus skenario. */
export function bolehLewatiGuardHapusSkenario(peran: Peran): boolean {
  return peran === "ADMIN";
}

/** Semua selain Pimpinan dapat menjalankan dan mengisi pengujian. */
export function bolehUbahEksekusi(peran: Peran): boolean {
  return peran !== "PIMPINAN";
}

export type KolomSkenario =
  | "judul"
  | "langkahPengujian"
  | "hasilDiharapkan"
  | "hasilAktual"
  | "status"
  | "catatanTindakLanjut"
  | "pengujiId"
  | "moduleId"
  | "siapRetest";

/**
 * Tester yang ditugaskan dapat mengubah hasil aktual, status, dan catatan
 * tindak lanjut. Definisi, penugasan, lembar, dan retest tetap dikelola
 * Admin/Internal PSII; Pimpinan tetap hanya-baca.
 */
export function bolehUbahKolomSkenario(peran: Peran, kolom: KolomSkenario): boolean {
  if (bolehKelolaSkenario(peran)) return true;
  if (peran === "INTERNAL_KEMENKEU" || peran === "EKSTERNAL_KEMENKEU") {
    return kolom === "hasilAktual" || kolom === "status" || kolom === "catatanTindakLanjut";
  }
  return false;
}

/** Perubahan master skenario (buat/hapus dan definisi) hanya untuk pengelola. */
export function bolehKelolaSkenario(peran: Peran): boolean {
  return PENGELOLA.includes(peran);
}
